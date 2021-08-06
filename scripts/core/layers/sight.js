import { patch } from "../../utils/patch.js";
import { SpriteMesh } from "../../display/sprite-mesh.js";

Hooks.once("init", () => {
    patch("SightLayer.prototype._configureFogResolution", "OVERRIDE", function () {
        const d = canvas.dimensions;
        const gl = canvas.app.renderer.gl;

        let format = PIXI.FORMATS.RGBA;
        let maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

        const singleChannel = false;
        const exploredColor = hexToRGB(CONFIG.Canvas.exploredColor);

        if (singleChannel && exploredColor[0] === exploredColor[1] && exploredColor[1] === exploredColor[2]) {
            format = PIXI.FORMATS.RED;
            maxSize = Math.min(maxSize, 8192);
        } else {
            format = PIXI.FORMATS.RGBA;
            maxSize = Math.min(maxSize, 4096);
        }

        let resolution;
        let width;
        let height;

        if (d.sceneWidth <= d.sceneHeight) {
            resolution = Math.min(maxSize / d.sceneHeight, 1.0);
            width = Math.ceil(d.sceneWidth * resolution);
            height = Math.round(d.sceneHeight * resolution);
        } else {
            resolution = Math.min(maxSize / d.sceneWidth, 1.0);
            width = Math.round(d.sceneWidth * resolution);
            height = Math.ceil(d.sceneHeight * resolution);
        }

        const nextPow2 = false;

        if (nextPow2) {
            width = PIXI.utils.nextPow2(width) / resolution;
            height = PIXI.utils.nextPow2(height) / resolution;
        } else {
            width = width / resolution;
            height = height / resolution;
        }

        return {
            resolution,
            width,
            height,
            mipmap: PIXI.MIPMAP_MODES.OFF,
            anisotropicLevel: 0,
            wrapMode: PIXI.WRAP_MODES.CLAMP,
            scaleMode: PIXI.SCALE_MODES.LINEAR,
            format,
            type: PIXI.TYPES.UNSIGNED_BYTE,
            target: PIXI.TARGETS.TEXTURE_2D,
            alphaMode: PIXI.ALPHA_MODES.PMA,
            multisample: PIXI.MSAA_QUALITY.NONE,
        };
    });

    const fogShader = new PIXI.MeshMaterial(PIXI.Texture.EMPTY, {
        program: PIXI.Program.from(`\
            attribute vec2 aVertexPosition;
            attribute vec2 aTextureCoord;

            uniform mat3 projectionMatrix;
            uniform mat3 translationMatrix;
            uniform mat3 uTextureMatrix;
            varying vec2 vTextureCoord;

            void main()
            {
                gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
                vTextureCoord = (uTextureMatrix * vec3(aTextureCoord, 1.0)).xy;
            }`, `\
            varying vec2 vTextureCoord;

            uniform sampler2D uSampler;
            uniform vec3 uExploredColor;

            const float SCALE = 255.0 / 127.0;

            void main()
            {
                float r = texture2D(uSampler, vTextureCoord).r;
                gl_FragColor = vec4(uExploredColor, 1.0) * (r * SCALE);
            }`
        )
    });

    {
        let renderTexturePool = [];
        let renderTextureOptions = {};

        Hooks.on("sightRefresh", () => {
            fogShader.uniforms.uExploredColor = hexToRGB(CONFIG.Canvas.exploredColor);
        });

        patch("SightLayer.prototype.draw", "POST", async function (result) {
            await result;

            fogShader.texture = PIXI.Texture.EMPTY;
            fogShader.uniforms.uExploredColor = hexToRGB(CONFIG.Canvas.exploredColor);

            if (this._fogResolution.format === PIXI.FORMATS.RED) {
                const d = canvas.dimensions;

                const index = this.revealed.getChildIndex(this.saved);

                this.saved.destroy();
                this.saved = this.revealed.addChildAt(new SpriteMesh(fogShader), index);
                this.saved.position.set(d.paddingX, d.paddingY);
                this.saved.width = this._fogResolution.width;
                this.saved.height = this._fogResolution.height;
            }

            if (renderTexturePool.length !== 0) {
                for (const [property, value] of Object.entries(this._fogResolution)) {
                    if (renderTextureOptions[property] !== value) {
                        for (const renderTexture of renderTexturePool) {
                            renderTexture.destroy(true);
                        }

                        renderTexturePool.length = 0;
                        break;
                    }
                }

                if (renderTexturePool.length > 2) {
                    for (let i = 2; i < renderTexturePool.length; i++) {
                        renderTexturePool[i].destroy(true);
                    }

                    renderTexturePool.length = 2;
                }
            }

            Object.assign(renderTextureOptions, this._fogResolution);

            this.filter.resolution = canvas.app.renderer.resolution;

            return this;
        });

        patch("SightLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
            if (this.saved.texture instanceof PIXI.RenderTexture) {
                renderTexturePool.push(this.saved.texture);

                this.saved.texture = PIXI.Texture.EMPTY;
            }

            fogShader.texture = PIXI.Texture.EMPTY;

            return await wrapped(...args);
        });

        patch("SightLayer.prototype.commitFog", "OVERRIDE", function () {
            if (CONFIG.debug.fog) {
                console.debug("SightLayer | Committing fog exploration to render texture.");
            }

            if (!this._fogUpdates) {
                return;
            }

            this._fogUpdates = 0;

            // Protect against an invalid render texture
            if (!this.saved.texture.valid) {
                this.saved.texture = PIXI.Texture.EMPTY;
            }

            if (this._fogResolution.format === PIXI.FORMATS.RED) {
                // Set explored color to standard gray
                fogShader.uniforms.uExploredColor = hexToRGB(0x7F7F7F);

                for (const c of this.pending.children) {
                    c.fov.tint = 0x7F7F7F;
                }
            }

            // Create a staging texture and render the entire fog container to it
            const d = canvas.dimensions;
            const texture = renderTexturePool.pop() ?? PIXI.RenderTexture.create(this._fogResolution);
            const transform = new PIXI.Matrix(1, 0, 0, 1, -d.paddingX, -d.paddingY);

            // Render the texture (temporarily disabling the masking rectangle)
            canvas.app.renderer.render(this.revealed, texture, undefined, transform);

            if (this._fogResolution.format === PIXI.FORMATS.RED) {
                // Restore explored color
                fogShader.uniforms.uExploredColor = hexToRGB(CONFIG.Canvas.exploredColor);
            }

            // Swap the staging texture to the rendered Sprite
            if (this.saved.texture instanceof PIXI.RenderTexture) {
                renderTexturePool.push(this.saved.texture);
            } else {
                this.saved.texture.destroy(true);
            }

            this.saved.texture = texture;
            this.saved.width = texture.width;
            this.saved.height = texture.height;
            this.pending.removeChildren().forEach(c => this._recycleVisionContainer(c));

            // Record that fog was updated and schedule a save
            this._fogUpdated = true;
            this.debounceSaveFog();
        });
    }

    patch("SightLayer.prototype.loadFog", "OVERRIDE", async function () {
        if (CONFIG.debug.fog) {
            console.debug("SightLayer | Loading saved FogExploration for Scene.");
        }

        // Remove the previous render texture if one exists
        if (this.saved.texture.valid) {
            this.saved.texture.destroy(true);
        }

        // Take no further action if vision or fog is not used
        if (!this.tokenVision || !this.fogExploration) {
            return;
        }

        // Load existing FOW exploration data or create a new placeholder
        const fogExplorationCls = getDocumentClass("FogExploration");

        this.exploration = await fogExplorationCls.get();

        if (!this.exploration) {
            this.exploration = new fogExplorationCls();
        }

        // Extract the fog data image
        const render = texture => {
            const d = canvas.dimensions;

            this.saved.texture = texture;
            this.saved.width = d.sceneWidth;
            this.saved.height = d.sceneHeight;
        };

        return await new Promise(resolve => {
            const texture = this.exploration.getTexture();

            if (texture === null) {
                render(PIXI.Texture.EMPTY);
                return resolve(PIXI.Texture.EMPTY);
            }

            if (texture.baseTexture.valid) {
                render(texture);
                return resolve(texture);
            }

            texture.on("update", texture => {
                render(texture);
                resolve(texture);
            });
        });
    });

    {
        const MAX_SIZE = 2048;

        const arrayBuffer = new ArrayBuffer(4 * MAX_SIZE * MAX_SIZE);
        const renderTarget = new PIXI.utils.CanvasRenderTarget(MAX_SIZE, MAX_SIZE, 1);
        const renderTexture = PIXI.RenderTexture.create({
            width: MAX_SIZE,
            height: MAX_SIZE,
            resolution: 1,
            mipmap: PIXI.MIPMAP_MODES.OFF,
            anisotropicLevel: 0,
            wrapMode: PIXI.WRAP_MODES.CLAMP,
            scaleMode: PIXI.SCALE_MODES.LINEAR,
            format: PIXI.FORMATS.RGBA,
            type: PIXI.TYPES.UNSIGNED_BYTE,
            target: PIXI.TARGETS.TEXTURE_2D,
            alphaMode: PIXI.ALPHA_MODES.PMA,
            multisample: PIXI.MSAA_QUALITY.NONE,
        });

        function blobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        };

        function canvasToDataURL(canvas, mimeType, qualityArgument) {
            return new Promise((resolve, reject) => {
                canvas.toBlob(blob => blobToBase64(blob).then(resolve).catch(reject), mimeType, qualityArgument);
            });
        }

        patch("SightLayer.prototype.saveFog", "OVERRIDE", async function () {
            if (!this.tokenVision || !this.fogExploration || !this.exploration) {
                return;
            }

            // If there are pending fog updates, we need to first commit them
            if (this._fogUpdates) {
                this.commitFog();
            }

            if (!this._fogUpdated) {
                return;
            }

            this._fogUpdated = false;

            if (CONFIG.debug.fog) {
                console.debug("SightLayer | Saving exploration progress to FogExploration document.");
            }

            const d = canvas.dimensions;

            let texture;
            let width;
            let height;

            const scale = Math.min(MAX_SIZE / d.sceneWidth, MAX_SIZE / d.sceneHeight, 1.0);

            if (scale < 1.0) {
                // Use the existing rendered fog to create a Sprite and downsize to save with smaller footprint
                let sprite;

                if (this.saved.texture.baseTexture.format === PIXI.FORMATS.RED) {
                    sprite = new SpriteMesh(fogShader);
                } else {
                    sprite = new PIXI.Sprite(this.saved.texture);
                }

                sprite.width = this.saved.texture.width * scale;
                sprite.height = this.saved.texture.height * scale;

                texture = renderTexture;
                width = Math.min(Math.round(d.sceneWidth * scale), MAX_SIZE);
                height = Math.min(Math.round(d.sceneHeight * scale), MAX_SIZE);

                if (this.saved.texture.baseTexture.format === PIXI.FORMATS.RED) {
                    fogShader.uniforms.uExploredColor = hexToRGB(0x7F7F7F);
                }

                canvas.app.renderer.render(sprite, { renderTexture: texture, clear: false });

                if (this.saved.texture.baseTexture.format === PIXI.FORMATS.RED) {
                    fogShader.uniforms.uExploredColor = hexToRGB(CONFIG.Canvas.exploredColor);
                }
            } else {
                // Downsizing is not necessary
                texture = this.saved.texture;
                width = d.sceneWidth;
                height = d.sceneHeight;
            }

            const renderer = canvas.app.renderer;
            const gl = renderer.gl;

            renderer.renderTexture.bind(texture);

            const pixels = new Uint8Array(arrayBuffer, 0, 4 * width * height);

            // Extract the pixel data from the texture
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

            if (renderTarget.width !== width || renderTarget.height !== height) {
                renderTarget.resize(width, height);
            }

            const imageData = renderTarget.context.getImageData(0, 0, width, height);

            // Copy pixels into image data
            if (texture.baseTexture.format === PIXI.FORMATS.RED) {
                const out = imageData.data;

                for (let i = 0; i < pixels.length; i += 4) {
                    const value = pixels[i];

                    out[i] = out[i + 1] = out[i + 2] = value !== 0 ? 127 : 0;
                    out[i + 3] = Math.round(Math.min(pixels[i] * 255 / 127), 255);
                }
            } else {
                PIXI.Extract.arrayPostDivide(pixels, pixels);

                imageData.data.set(pixels);
            }

            // Put image data into canvas
            renderTarget.context.putImageData(imageData, 0, 0);

            let dataURL = await canvasToDataURL(renderTarget.canvas, "image/webp", 0.8);

            // The backend doesn't allow webp base64 image strings, but we can trick it and change the mime type.
            // The image is still decoded as webp on load, even though the mime type is wrong.
            if (dataURL.startsWith("data:image/webp;")) {
                dataURL = "data:image/png;" + dataURL.substring(16);
            }

            // Create or update fog exploration
            const updateData = {
                explored: dataURL,
                timestamp: Date.now()
            };

            if (!this.exploration.id) {
                this.exploration.data.update(updateData);
                this.exploration = await this.exploration.constructor.create(this.exploration.toJSON());
            } else {
                await this.exploration.update(updateData);
            }
        });
    }
});
