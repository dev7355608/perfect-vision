import { CanvasFramebuffer } from "./canvas-framebuffer.js";
import { LightingSystem } from "./lighting-system.js";
import { Console } from "../utils/console.js";
import { TextureBlur } from "../utils/texture-blur.js";

export class LightingFramebuffer extends CanvasFramebuffer {
    /**
     * The lighting framebuffer instance.
     * @type {LightingFramebuffer}
     */
    static #instance;

    /**
     * The lighting framebuffer instance.
     * @type {LightingFramebuffer}
     * @readonly
     */
    static get instance() {
        return this.#instance ??= new LightingFramebuffer();
    }

    invalidateOnOcclusionUpdate = false;

    #quad = new PIXI.Quad();
    #colorBackgroundShader = new ColorBackgroundShader();

    constructor() {
        super(
            "lighting",
            [],
            [
                {
                    format: PIXI.FORMATS.RED,
                    type: PIXI.TYPES.UNSIGNED_BYTE,
                    scaleMode: PIXI.SCALE_MODES.NEAREST
                },
                {
                    format: PIXI.FORMATS.RGB,
                    type: PIXI.TYPES.UNSIGNED_BYTE,
                    scaleMode: PIXI.SCALE_MODES.NEAREST
                },
                {
                    format: PIXI.FORMATS.RGB,
                    type: PIXI.TYPES.UNSIGNED_BYTE,
                    scaleMode: PIXI.SCALE_MODES.NEAREST
                }
            ]
        );

        /**
         * @type {PIXI.UniformGroup}
         */
        this.uniformGroup = new PIXI.UniformGroup({
            darknessLevelTexture: this.textures[0],
            colorBackgroundTexture: this.textures[1],
            ambientDarknessTexture: this.textures[2],
            uniformLighting: true
        });
    }

    /** @override */
    _draw() {
        this.stage.renderable = true;

        if (canvas.blur.enabled) {
            this.blur = new TextureBlur(canvas.blur.strength, canvas.blur.passes, canvas.blur.kernels);

            canvas.addBlurFilter(this.blur);
        } else {
            this.blur = null;
        }
    }

    /** @override */
    _refresh() {
        const { stage, textures } = this;

        stage.removeChildren();
        stage.renderable = true;

        const { darknessLevel, colors } = LightingSystem.instance.getRegion("globalLight");

        textures[0].baseTexture.clearColor[0] = darknessLevel;
        textures[0].baseTexture.clearColor[1] = 0;
        textures[0].baseTexture.clearColor[2] = 0;
        textures[1].baseTexture.clearColor.set(this.blur ? colors.ambientDaylight.rgb : colors.background.rgb);
        textures[2].baseTexture.clearColor.set(colors.ambientDarkness.rgb);

        let bounds;

        for (const region of LightingSystem.instance.activeRegions) {
            const mesh = region.drawMesh();

            if (!mesh) {
                continue;
            }

            const clear = region.darknessLevel === darknessLevel
                && region.colors.background.equals(colors.background)
                && region.colors.ambientDarkness.equals(colors.ambientDarkness);

            if (!clear || bounds?.some(b => b.intersects(region.bounds))) {
                stage.addChild(mesh);

                if (this.blur) {
                    mesh.shader.uniforms.uColor1.set(region.colors.ambientDaylight.rgb);
                }

                if (!clear) {
                    bounds ??= [];
                    bounds.push(region.bounds);
                }
            }
        }

        this.acquire();
        this.invalidate();
    }

    /** @override */
    _tearDown() {
        this.stage.removeChildren();
        this.#quad.dispose();
    }

    /** @override */
    _update(renderer) {
        const stage = this.stage;
        const screen = renderer.screen;
        const textures = this.textures;
        const uniform = [true, true, true];
        const cacheParent = stage.enableTempParent();

        stage.updateTransform();
        stage.disableTempParent(cacheParent);

        this.invalidateOnOcclusionUpdate = false;

        for (const mesh of stage.children) {
            if (!mesh.visible) {
                continue;
            }

            const bounds = mesh.getBounds(true);

            if (screen.intersects(bounds)) {
                for (let i = 0; i < 3; i++) {
                    if (!uniform[i]) {
                        continue;
                    }

                    const uniforms = mesh.shader.uniforms;
                    const meshColor = uniforms["uColor" + i];
                    const clearColor = textures[i].baseTexture.clearColor;

                    uniform[i] = meshColor[0] === clearColor[0]
                        && meshColor[1] === clearColor[1]
                        && meshColor[2] === clearColor[2];

                    if (uniforms.uOcclusionMode === CONST.TILE_OCCLUSION_MODES.RADIAL
                        || uniforms.uOcclusionMode === CONST.TILE_OCCLUSION_MODES.VISION) {
                        this.invalidateOnOcclusionUpdate = true;
                    }
                }

                mesh.renderable = true;
            } else {
                mesh.renderable = false;
            }

            mesh.cullable = false;
        }

        this.uniformGroup.uniforms.uniformLighting = uniform[0] && uniform[1] && uniform[2];

        const renderable = !uniform.every(e => e);

        if (!renderable && !stage.renderable) {
            stage.children.forEach(mesh => mesh.renderable = mesh.cullable = true);

            return;
        }

        stage.renderable = renderable;

        if (this.blur && !renderable) {
            textures[1].baseTexture.clearColor.set(LightingSystem.instance.getRegion("globalLight").colors.background.rgb);
        }

        this.render(renderer, stage, { skipUpdateTransform: true, resize: renderable });
        stage.children.forEach(mesh => mesh.renderable = mesh.cullable = true);

        if (this.blur) {
            for (let i = 0; i < 3; i++) {
                if (!uniform[i]) {
                    this.blur.apply(renderer, textures[i]);
                }
            }

            if (renderable) {
                const tempTexture = renderer.filter.getOptimalFilterTexture(textures[1].width, textures[1].height, textures[1].resolution);

                renderer.framebuffer.bind(textures[1].framebuffer);
                renderer.framebuffer.blit(tempTexture.framebuffer);
                renderer.renderTexture.bind(textures[1]);

                const shader = this.#colorBackgroundShader;
                const uniforms = shader.uniforms;

                uniforms.outputSize[0] = textures[1].width;
                uniforms.outputSize[1] = textures[1].height;
                uniforms.darknessLevelSampler = textures[0];
                uniforms.darknessLevelInputSize[0] = textures[0].width;
                uniforms.darknessLevelInputSize[1] = textures[0].height;
                uniforms.daylightColorSampler = tempTexture;
                uniforms.daylightColorInputSize[0] = tempTexture.width;
                uniforms.daylightColorInputSize[1] = tempTexture.height;
                uniforms.darknessColorSampler = textures[2];
                uniforms.darknessColorInputSize[0] = textures[2].width;
                uniforms.darknessColorInputSize[1] = textures[2].height;

                renderer.state.set(shader.state);
                renderer.shader.bind(shader);
                renderer.geometry.bind(this.#quad, shader);
                renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLE_STRIP);

                renderer.filter.returnFilterTexture(tempTexture);
            } else {
                textures[1].baseTexture.clearColor.set(LightingSystem.instance.getRegion("globalLight").colors.ambientDaylight.rgb);
            }
        }

        if (this.constructor.debug) {
            Console.debug("%s (%O) | Rendered", this.constructor.name, this);
        }
    }
}

class ColorBackgroundShader extends PIXI.Shader {
    static vertexSrc = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec2 outputSize;
        uniform vec2 darknessLevelInputSize;
        uniform vec2 daylightColorInputSize;
        uniform vec2 darknessColorInputSize;

        varying vec2 vDarknessLevelTextureCoord;
        varying vec2 vDaylightColorTextureCoord;
        varying vec2 vDarknessColorTextureCoord;

        void main() {
            gl_Position = vec4((projectionMatrix * vec3(aVertexPosition * outputSize, 1.0)).xy, 0.0, 1.0);
            vDarknessLevelTextureCoord = aVertexPosition * (outputSize / darknessLevelInputSize);
            vDaylightColorTextureCoord = aVertexPosition * (outputSize / daylightColorInputSize);
            vDarknessColorTextureCoord = aVertexPosition * (outputSize / darknessColorInputSize);
        }`;

    static fragmentSrc = `\
        uniform sampler2D darknessLevelSampler;
        uniform sampler2D daylightColorSampler;
        uniform sampler2D darknessColorSampler;

        varying vec2 vDarknessLevelTextureCoord;
        varying vec2 vDaylightColorTextureCoord;
        varying vec2 vDarknessColorTextureCoord;

        void main() {
            gl_FragColor = vec4(
                mix(
                    texture2D(daylightColorSampler, vDaylightColorTextureCoord).rgb,
                    texture2D(darknessColorSampler, vDarknessColorTextureCoord).rgb,
                    texture2D(darknessLevelSampler, vDarknessLevelTextureCoord).r
                ),
                1.0
            );
        }`;

    static #program;

    static get program() {
        if (!this.#program) {
            this.#program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this.#program;
    }

    constructor() {
        super(ColorBackgroundShader.program, {
            outputSize: new Float32Array(2),
            darknessLevelInputSize: new Float32Array(2),
            daylightColorInputSize: new Float32Array(2),
            darknessColorInputSize: new Float32Array(2)
        });

        this.state = new PIXI.State();
        this.state.blend = false;
    }
}
