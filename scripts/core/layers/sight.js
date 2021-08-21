import { Elevation, ElevationFilter } from "../elevation.js";
import { Lighting } from "../lighting.js";
import { Mask } from "../mask.js";
import { patch } from "../../utils/patch.js";
import { SpriteMesh } from "../../display/sprite-mesh.js";

Hooks.once("init", () => {
    patch("FogExploration.prototype.explore", "OVERRIDE", function (source, force = false) {
        let globalLight = canvas.lighting.globalLight;

        if (!globalLight) {
            for (const area of canvas.lighting._pv_areas) {
                if (area.skipRender) {
                    continue;
                }

                if (area._pv_globalLight) {
                    globalLight = true;
                    break;
                }
            }
        }

        const r = globalLight ? canvas.dimensions.maxR : source.radius;
        if (r < 0) return false;
        const coords = canvas.grid.getCenter(source.x, source.y).map(Math.round).join("_");
        const position = this.data.positions[coords];

        // Check whether the position has already been explored
        let explored = position && (position.limit !== true) && (position.radius >= r);
        if (explored && !force) return false;

        // Update explored positions
        if (CONFIG.debug.fog) console.debug("SightLayer | Updating fog exploration for new explored position.");
        this.data.update({
            positions: {
                [coords]: { radius: source.radius, limit: source.limited }
            }
        });
        return true;
    });

    patch("SightLayer.prototype._createVisionContainer", "POST", function (c) {
        c._pv_fov = c.addChildAt(new PIXI.Container(), 0);
        c._pv_filter = VisionContainerFilter.instance;

        if (c.filters?.length > 0) {
            c.filters.push(c._pv_filter);
        } else {
            c.filters = [c._pv_filter];
        }

        return c;
    });

    patch("SightLayer.prototype._recycleVisionContainer", "PRE", function (c) {
        c._pv_fov.removeChildren().forEach(c => c.destroy(true));
        return [c];
    });

    patch("SightLayer.prototype.testVisibility", "OVERRIDE", function (point, { tolerance = 2, object = null } = {}) {
        const visionSources = this.sources;
        const lightSources = canvas.lighting.sources;
        if (!visionSources.size) return game.user.isGM;

        // Determine the array of offset points to test
        const t = tolerance;
        const offsets = t > 0 ? [[0, 0], [-t, 0], [t, 0], [0, -t], [0, t], [-t, -t], [-t, t], [t, t], [t, -t]] : [[0, 0]];
        const points = offsets.map(o => new PIXI.Point(point.x + o[0], point.y + o[1]));

        // Test that a point falls inside a line-of-sight polygon
        let inLOS = false;
        for (let source of visionSources.values()) {
            if (points.some(p => source.los.contains(p.x, p.y))) {
                inLOS = true;
                break;
            }
        }
        if (!inLOS) return false;

        // If global illumination is active, nothing more is required
        if (points.some(p => Lighting.findArea(p.x, p.y)._pv_globalLight)) return true;

        // Test that a point is also within some field-of-vision polygon
        for (let source of visionSources.values()) {
            if (!source.active) continue;
            if (points.some(p => source.fov.contains(p.x, p.y))) return true;
        }
        for (let source of lightSources.values()) {
            if (!source.active) continue;
            if (points.some(p => source.fov.contains(p.x, p.y))) return true;
        }

        return false;
    });

    patch("SightLayer.prototype.refresh", "OVERRIDE", function ({ forceUpdateFog = false, noUpdateFog = false } = {}) {
        if (!this._initialized) return;
        if (!this.tokenVision) {
            this.visible = false;
            return this.restrictVisibility()
        }

        // Configuration variables
        const d = canvas.dimensions;
        // const unrestrictedVisibility = canvas.lighting.globalLight;
        const exc = CONFIG.Canvas.exploredColor;

        // Recycle the current vision, either adding it to pending fog or returning it to the pool
        const prior = this.explored.removeChild(this.current);
        if (prior._explored) {
            prior.fov.tint = exc;

            for (const child of prior._pv_fov.children) {
                child.tint = exc;
            }

            this.pending.addChild(prior);
        }
        else this._recycleVisionContainer(prior);

        // Obtain a new vision container from the rotating pool
        const vision = this._getVisionContainer();

        const elevation = !this.fogExploration && Mask.get("elevation");

        const fov = new PIXI.Graphics()
            .beginFill(canvas.lighting._pv_globalLight ? 0xFFFFFF : 0x000000)
            .drawShape(canvas.lighting._pv_shape)
            .endFill();

        vision._pv_fov.addChild(fov);

        const areas = canvas.lighting._pv_areas;

        if (areas?.length !== 0) {
            for (const area of areas) {
                if (area.skipRender) {
                    continue;
                }

                const fov = new PIXI.Graphics()
                    .beginFill(area._pv_globalLight ? 0xFFFFFF : 0x000000)
                    .drawShape(area._pv_shape)
                    .endFill();

                if (elevation) {
                    fov.filters = [new ElevationFilter(Elevation.getElevationRange(area))];
                }

                vision._pv_fov.addChild(fov);
            }
        }

        // Draw standard vision sources
        let inBuffer = canvas.scene.data.padding === 0;

        // const elevation = Mask.get("elevation");

        // if (!elevation) {
        //     // Unrestricted visibility, everything in LOS is visible
        //     if (unrestrictedVisibility) {
        //         vision.fov.beginFill(0xFFFFFF, 1.0).drawShape(d.rect).endFill();
        //     } else {
        //         vision.fov.beginFill(0x000000, 1.0).drawShape(d.rect).endFill();
        //     }

        //     for (const area of canvas.lighting._pv_areas) {
        //         if (area._pv_globalLight) {
        //             vision.fov.beginFill(0xFFFFFF, 1.0).drawShape(area._pv_shape).endFill();
        //         } else {
        //             vision.fov.beginFill(0x000000, 1.0).drawShape(area._pv_shape).endFill();
        //         }
        //     }
        // } else {

        // }

        // // Otherwise provided minimum visibility for each vision source
        // else {
        //     for (let source of this.sources) {
        //         vision.fov.beginFill(exc, 1.0).drawCircle(source.x, source.y, d.size / 2);
        //     }
        // }

        // Draw sight-based visibility for each vision source
        for (let source of this.sources) {
            source.active = !source.skipRender;

            if (!source.active) {
                continue;
            }

            if (!inBuffer && !d.sceneRect.contains(source.x, source.y)) inBuffer = true;

            // Restricted sight-based visibility for this source
            if (/*!unrestrictedVisibility && */ (source.radius > 0)) {
                // if (source.radius > 0) {
                //vision.fov.beginFill(0xFFFFFF, 1.0).drawPolygon(source.fov).endFill();

                const fov = new PIXI.Graphics()
                    .beginFill(0xFFFFFF)
                    .drawShape(source.fov)
                    .endFill();

                if (elevation) {
                    fov.filters = [new ElevationFilter(Elevation.getElevationRange(source.object))];
                }

                vision._pv_fov.addChild(fov);
                // }
            }

            // LOS masking polygon for this source
            vision.los.beginFill(0xFFFFFF, 1.0).drawPolygon(source.los).endFill();

            // Potentially update fog exploration
            if (!noUpdateFog) this.updateFog(source, forceUpdateFog);
        }

        // Draw global or universal light sources
        for (let source of canvas.lighting.sources) {
            if (!this.sources.size || !source.active) continue;

            if (source.radius > 0) {
                const fov = new PIXI.Graphics()
                    .beginFill(0xFFFFFF)
                    .drawShape(source.fov)
                    .endFill();

                if (elevation) {
                    fov.filters = [new ElevationFilter(Elevation.getElevationRange(source.object))];
                }

                vision._pv_fov.addChild(fov);
            }

            // vision.fov.beginFill(0xFFFFFF, 1.0).drawPolygon(source.fov).endFill();
            if ((source.type === CONST.SOURCE_TYPES.LOCAL) || source.isDarkness) continue;
            vision.los.beginFill(0xFFFFFF, 1.0).drawPolygon(source.fov).endFill();
        }

        // Asynchronously commit pending fog exploration if enough positions have been explored
        if (this._fogUpdates >= SightLayer.FOG_COMMIT_THRESHOLD) this.commitFog();

        // Alter visibility of the vision layer
        this.visible = this.sources.size || !game.user.isGM;
        this.unexplored.tint = CONFIG.Canvas.unexploredColor;

        // Apply a mask to the exploration container
        if (this.explored.msk) {
            const noMask = this.sources.size && inBuffer;
            this.explored.mask = noMask ? null : this.explored.msk;
            this.explored.msk.visible = !noMask;
        }

        // Alter visibility of the lighting layer
        canvas.lighting.illumination.lights.mask = this.visible ? this.los : null;
        canvas.lighting.coloration.mask = this.visible ? this.los : null;

        // Restrict the visibility of other canvas objects
        this.restrictVisibility();

        // Log debug status
        if (CONFIG.debug.sight) {
            const perf = SightLayer._performance;
            let ns = Math.round((performance.now() - perf.start) * 100) / 100;
            console.log(`Rendered Sight Layer update | ${ns}ms | ${perf.rays} rays | ${perf.tests} tests`);
        }
    });

    patch("SightLayer.prototype._configureFogResolution", "OVERRIDE", function () {
        const d = canvas.dimensions;
        const gl = canvas.app.renderer.gl;

        let format = PIXI.FORMATS.RGBA;
        let maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

        const singleChannel = false;
        const exploredColor = foundry.utils.hexToRGB(CONFIG.Canvas.exploredColor);

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
            fogShader.uniforms.uExploredColor = foundry.utils.hexToRGB(CONFIG.Canvas.exploredColor);
        });

        patch("SightLayer.prototype.draw", "POST", async function (result) {
            await result;

            fogShader.texture = PIXI.Texture.EMPTY;
            fogShader.uniforms.uExploredColor = foundry.utils.hexToRGB(CONFIG.Canvas.exploredColor);

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
                fogShader.uniforms.uExploredColor = foundry.utils.hexToRGB(0x7F7F7F);

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
                fogShader.uniforms.uExploredColor = foundry.utils.hexToRGB(CONFIG.Canvas.exploredColor);
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
                    fogShader.uniforms.uExploredColor = foundry.utils.hexToRGB(0x7F7F7F);
                }

                canvas.app.renderer.render(sprite, { renderTexture: texture, clear: false });

                if (this.saved.texture.baseTexture.format === PIXI.FORMATS.RED) {
                    fogShader.uniforms.uExploredColor = foundry.utils.hexToRGB(CONFIG.Canvas.exploredColor);
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

Hooks.on("canvasInit", () => {
    VisionContainerFilter.instance.resolution = canvas.app.renderer.resolution;
    VisionContainerFilter.instance.multisample = PIXI.MSAA_QUALITY.NONE;
});

class VisionContainerFilter extends PIXI.Filter {
    static vertexSource = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;

        varying vec2 vTextureCoord;

        void main()
        {
            vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);
            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
            vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
        }`;

    static fragmentSource = `\
        varying vec2 vTextureCoord;

        uniform sampler2D uSampler;

        void main()
        {
            vec3 color = texture2D(uSampler, vTextureCoord).rgb;

            if (any(notEqual(color, vec3(0.0)))) {
                gl_FragColor = vec4(color, 1.0);
            } else {
                gl_FragColor = vec4(0.0);
            }
        }`;

    static get instance() {
        if (!this._instance) {
            this._instance = new VisionContainerFilter();
        }

        return this._instance;
    }

    constructor() {
        super(VisionContainerFilter.vertexSource, VisionContainerFilter.fragmentSource);
    }
}
