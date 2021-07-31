import { Logger } from "../utils/logger.js";
import { SpriteMesh } from "../display/sprite-mesh.js";

export class Mask extends PIXI.utils.EventEmitter {
    static debug = false;

    static frame = new PIXI.Rectangle(0, 0, 1, 1);
    static size = new Float32Array([1, 1, 1, 1]);
    static resolution = 1;

    static resize() {
        this.frame.copyFrom(canvas.app.renderer.screen);
        this.size[0] = this.frame.width;
        this.size[1] = this.frame.height;
        this.size[2] = 1 / this.size[0];
        this.size[3] = 1 / this.size[1];
        this.resolution = canvas.app.renderer.resolution;

        this.invalidateAll();
    }

    static get width() {
        return this.frame.width;
    }

    static get height() {
        return this.frame.height;
    }

    static masks = new Map();

    static create(name, options) {
        console.assert(typeof name === "string" && !this.masks.has(name));

        const mask = new Mask(options);

        mask.name = name;
        mask.groups = new Set(options.groups);
        mask.dependencies = new Set(options.dependencies);
        mask.dependents = null;

        this.masks.set(name, mask);

        const sorted = [];
        const visited = {};

        const visit = (mask, dependent) => {
            if (!mask) {
                return;
            }

            if (visited[mask.name]) {
                if (dependent) {
                    mask.dependents.add(dependent);
                }

                return;
            } else {
                mask.dependents = dependent ? new Set([dependent]) : new Set();
            }

            visited[mask.name] = true;

            for (const dependency of mask.dependencies) {
                visit(this.masks.get(dependency), mask);
            }

            sorted.push(mask);
        }

        for (const mask of this.masks.values()) {
            visit(mask);
        }

        this.masks.clear();

        for (const mask of sorted) {
            this.masks.set(mask.name, mask);
        }

        return mask;
    }

    static get(name) {
        return this.masks.get(name);
    }

    static getTexture(name) {
        return this.get(name)?.texture ?? PIXI.Texture.EMPTY;
    }

    static invalidateAll(...groups) {
        for (const mask of this.masks.values()) {
            if (!mask.dirty && (groups.length === 0 || groups.some(group => mask.groups.has(group)))) {
                mask.invalidate();
            }
        }
    }

    static updateAll(...groups) {
        if (!canvas?.ready) {
            return;
        }

        let updated;
        let start;

        if (this.debug) {
            start = performance.now();
        }

        for (const mask of this.masks.values()) {
            if (mask.dirty && (groups.length === 0 || groups.some(group => mask.groups.has(group)))) {
                mask.dirty = false;

                mask.emit("updateStage", mask);
                mask.emit("updateTexture", mask);

                if (this.debug) {
                    if (!updated) {
                        updated = [];
                    }

                    updated.push(mask.name);
                }
            }
        }

        if (this.debug && updated) {
            const end = performance.now();
            const elapsed = Math.round((end - start) * 100) / 100;

            Logger.debug("Updated masks | %fms | %s", elapsed, updated.join(" "));
        }
    }

    static tick() {
        this.updateAll();
    }

    static hideAll() {
        for (const mask of this.masks.values()) {
            mask.hide();
        }
    }

    static defaultOptions() {
        return {
            mipmap: PIXI.MIPMAP_MODES.OFF,
            anisotropicLevel: 0,
            wrapMode: PIXI.WRAP_MODES.CLAMP,
            scaleMode: PIXI.SCALE_MODES.LINEAR,
            format: PIXI.FORMATS.RGBA,
            type: PIXI.TYPES.UNSIGNED_BYTE,
            target: PIXI.TARGETS.TEXTURE_2D,
            alphaMode: PIXI.ALPHA_MODES.NPM,
            multisample: PIXI.MSAA_QUALITY.NONE,
            clear: true,
            clearColor: [0, 0, 0, 0]
        };
    }

    constructor(options) {
        super();

        options = Object.assign(Mask.defaultOptions(), options);
        options = Object.assign(options, {
            width: Mask.width,
            height: Mask.height,
            resolution: Mask.resolution
        });

        this.texture = PIXI.RenderTexture.create(options);
        this.texture.baseTexture.clearColor = [...options.clearColor];
        this.stage = new PIXI.Container();
        this.clear = options.clear;
        this.dirty = true;

        let program;
        let uniforms;

        if (options.format === PIXI.FORMATS.RED && (options.type === PIXI.TYPES.FLOAT || options.type === PIXI.TYPES.HALF_FLOAT)) {
            program = PIXI.Program.from(`\
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
                uniform float uMin;
                uniform float uMax;

                void main()
                {
                    float r = texture2D(uSampler, vTextureCoord).r;

                    if (r < uMin) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    } else if (r > uMax) {
                        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
                    } else {
                        float s = clamp((r - uMin) / (uMax - uMin), 0.0, 1.0) * 4.0;

                        if (0.0 <= s && s < 1.0) {
                            gl_FragColor = mix(vec4(0.0, 0.0, 1.0, 1.0), vec4(0.0, 1.0, 1.0, 1.0), s);
                        } else if (1.0 <= s && s < 2.0) {
                            gl_FragColor = mix(vec4(0.0, 1.0, 1.0, 1.0), vec4(0.0, 1.0, 0.0, 1.0), s - 1.0);
                        } else if (2.0 <= s && s < 3.0) {
                            gl_FragColor = mix(vec4(0.0, 1.0, 0.0, 1.0), vec4(1.0, 1.0, 0.0, 1.0), s - 2.0);
                        } else if (3.0 <= s && s <= 4.0) {
                            gl_FragColor = mix(vec4(1.0, 1.0, 0.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0), s - 3.0);
                        }
                    }
                }`
            );

            uniforms = {
                uMin: 0.0,
                uMax: 1.0
            }
        }

        this.sprite = new SpriteMesh(new PIXI.MeshMaterial(this.texture, { program, uniforms }));
        this.sprite.width = this.texture.width;
        this.sprite.height = this.texture.height;
        this.sprite.zIndex = Infinity;
        this.sprite.blendMode = PIXI.BLEND_MODES.NORMAL_NPM;
        this.sprite.updateTransform = function () {
            this.transform.updateTransform(PIXI.Transform.IDENTITY);
            this.worldAlpha = this.alpha;
        };
    }

    invalidate() {
        if (!this.dirty) {
            this.dirty = true;

            for (const dependent of this.dependents) {
                Mask.get(dependent)?.invalidate();
            }
        }
    }

    resize() {
        const width = Mask.width;
        const height = Mask.height;
        const resolution = Mask.resolution;

        if (this.texture.width !== width || this.texture.height !== height || this.texture.resolution !== resolution) {
            this.texture.baseTexture.resolution = resolution;
            this.texture.resize(width, height);
            this.sprite.width = width;
            this.sprite.height = height;
        }
    }

    render(stage = this.stage, transform = true) {
        if (transform) {
            stage.position.copyFrom(canvas.stage.position);
            stage.pivot.copyFrom(canvas.stage.pivot);
            stage.scale.copyFrom(canvas.stage.scale);
            stage.skew.copyFrom(canvas.stage.skew);
            stage.rotation = canvas.stage.rotation;
        }

        this.resize();

        canvas.app.renderer.render(stage, { renderTexture: this.texture, clear: this.clear });
        canvas.app.renderer.framebuffer.blit();
    }

    show(alpha = 1.0, min = 0.0, max = 1.0) {
        if (alpha !== 0) {
            this.sprite.alpha = alpha;
            this.sprite.shader.uniforms.uMin = min;
            this.sprite.shader.uniforms.uMax = max;

            canvas.stage.addChild(this.sprite);
        } else {
            this.hide();
        }
    }

    hide() {
        canvas.stage.removeChild(this.sprite);
    }
}

Hooks.on("canvasInit", () => {
    canvas.app.renderer.off("resize", Mask.resize, Mask);
    canvas.app.renderer.on("resize", Mask.resize, Mask);

    Mask.resize();

    canvas.app.ticker.remove(Mask.tick, Mask);
    canvas.app.ticker.add(Mask.tick, Mask, PIXI.UPDATE_PRIORITY.LOW + 1);
});

Hooks.on("canvasReady", () => {
    Mask.invalidateAll();
});

Hooks.on("canvasPan", () => {
    Mask.resize();
});

export class MaskFilter extends PIXI.Filter {
    static defaultVertexSource = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;
        uniform vec4 uMaskSize;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        void main()
        {
            vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);
            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
            vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
            vMaskCoord = position.xy * uMaskSize.zw;
        }`;

    static defaultFragmentSource = `\
        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;

        void main()
        {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uMask, vMaskCoord);
            gl_FragColor = color * mask.r;
        }`;

    constructor(vertex, fragment, uniforms) {
        super(vertex || MaskFilter.defaultVertexSource, fragment || MaskFilter.defaultFragmentSource, uniforms);

        this.uniforms.uMaskSize = Mask.size;
        this._resolution = undefined;
        this._multisample = undefined;
        this.maskSprite = null;
    }

    get resolution() {
        if (this._resolution !== undefined) {
            return this._resolution;
        }

        const renderer = canvas.app.renderer;
        const renderTextureSystem = renderer.renderTexture;

        if (renderTextureSystem.current) {
            return renderTextureSystem.current.resolution;
        }

        return renderer.resolution;
    }

    set resolution(value) {
        this._resolution = value;
    }

    get multisample() {
        if (this._multisample !== undefined) {
            return this._multisample;
        }

        const renderer = canvas.app.renderer;
        const renderTextureSystem = renderer.renderTexture;

        if (renderTextureSystem.current) {
            return renderTextureSystem.current.multisample;
        }

        return renderer.multisample;
    }

    set multisample(value) {
        this._multisample = value;
    }

    apply(filterManager, input, output, clearMode, currentState) {
        if (this.maskSprite) {
            this.uniforms.uMask = this.maskSprite.texture;
        }

        filterManager.applyFilter(this, input, output, clearMode);
    }
}
