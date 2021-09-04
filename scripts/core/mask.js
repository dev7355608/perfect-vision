import { Logger } from "../utils/logger.js";
import { SpriteMesh } from "../display/sprite-mesh.js";

export class MaskSprite extends SpriteMesh {
    constructor(shader) {
        super(shader);
    }

    updateTransform() {
        this.transform.updateTransform(PIXI.Transform.IDENTITY);
        this.worldAlpha = this.alpha;
    }
}

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
    static invalid = { masks: {}, groups: {} };

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
                visit(this.get(dependency), mask.name);
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
        const mask = this.masks.get(name);

        if (mask?.lazy) {
            mask.lazy(mask);
            mask.lazy = null;
        }

        return mask;
    }

    static getTexture(name) {
        return this.get(name)?.texture ?? PIXI.Texture.EMPTY;
    }

    static getSprite(name) {
        return this.get(name)?.sprite;
    }

    static invalidateAll(...groups) {
        if (groups.length !== 0) {
            const invalidGroups = this.invalid.groups;

            for (const group of groups) {
                invalidGroups[group] = true;
            }
        }

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

        const invalid = this.invalid;

        for (const mask of this.masks.values()) {
            if (mask.dirty && (groups.length === 0 || groups.some(group => mask.groups.has(group)))) {
                mask.dirty = false;

                mask.emit("updateStage", mask, invalid);
                mask.emit("updateTexture", mask, invalid);

                if (this.debug) {
                    if (!updated) {
                        updated = [];
                    }

                    updated.push(mask.name);
                }
            }
        }

        for (const name in invalid.masks) {
            delete invalid.masks[name];
        }

        for (const name in invalid.groups) {
            delete invalid.groups[name];
        }

        if (this.debug && updated) {
            const end = performance.now();
            const elapsed = Math.round((end - start) * 100) / 100;

            Logger.debug("Mask | Updated | %fms | %s", elapsed, updated.join(" "));
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
            scaleMode: PIXI.SCALE_MODES.NEAREST,
            format: PIXI.FORMATS.RED,
            type: PIXI.TYPES.UNSIGNED_BYTE,
            target: PIXI.TARGETS.TEXTURE_2D,
            alphaMode: PIXI.ALPHA_MODES.PMA,
            multisample: PIXI.MSAA_QUALITY.NONE,
            clear: true,
            clearColor: [0, 0, 0, 0],
            shader: PIXI.MeshMaterial,
            lazy: null,
        };
    }

    constructor(options) {
        super();

        this.reset(options);
    }

    reset(options) {
        this.options = Object.assign(this.options ?? Mask.defaultOptions(), options);

        let clearColor;

        if (this.options.clearColor instanceof Int32Array) {
            clearColor = new Int32Array(4);
        } else if (this.options.clearColor instanceof Uint32Array) {
            clearColor = new Uint32Array(4);
        } else {
            clearColor = new Float32Array(4);
        }

        if (this.options.clearColor) {
            clearColor.set(this.options.clearColor);
        }

        this.options.clearColor = clearColor;

        if (this.texture) {
            const { baseTexture, framebuffer } = this.texture;

            baseTexture.dispose();
            baseTexture.mipmap = this.options.mipmap;
            baseTexture.anisotropicLevel = this.options.anisotropicLevel;
            baseTexture.wrapMode = this.options.wrapMode;
            baseTexture.scaleMode = this.options.scaleMode;
            baseTexture.format = this.options.format;
            baseTexture.target = this.options.target;
            baseTexture.type = this.options.type;
            baseTexture.alphaMode = this.options.alphaMode;

            framebuffer.dispose();
            framebuffer.multisample = this.options.multisample;
        } else {
            this.texture = PIXI.RenderTexture.create({
                ...this.options,
                width: Mask.width,
                height: Mask.height,
                resolution: Mask.resolution
            });
        }

        if (this.sprite) {
            this.sprite.shader = new (this.options.shader)();
        } else {
            this.sprite = new MaskSprite(new (this.options.shader)());
        }

        this.sprite.texture = this.texture;

        if (!this.stage) {
            this.stage = new MaskStage();
        }

        this.clear = this.options.clear;
        this.clearColor = this.options.clearColor;
        this.dirty = true;
        this.lazy = this.options.lazy;
    }

    get clear() {
        return this.stage.clear;
    }

    set clear(value) {
        this.stage.clear = value;
    }

    get clearColor() {
        return this.stage.clearColor;
    }

    set clearColor(value) {
        let clearColor;

        if (value instanceof Int32Array) {
            clearColor = new Int32Array(4);
        } else if (value instanceof Uint32Array) {
            clearColor = new Uint32Array(4);
        } else {
            clearColor = new Float32Array(4);
        }

        if (value) {
            clearColor.set(value);
        }

        this.stage.clearColor = clearColor;
    }

    invalidate() {
        if (!this.dirty) {
            this.dirty = true;

            Mask.invalid.masks[this.name] = true;

            for (const dependent of this.dependents) {
                Mask.get(dependent)?.invalidate();
            }
        }
    }

    refresh() {
        for (const dependency of this.dependencies) {
            Mask.get(dependency)?.refresh();
        }

        if (this.dirty) {
            this.dirty = false;

            this.emit("updateStage", this);
            this.emit("updateTexture", this);

            return true;
        }

        return false;
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

        canvas.app.renderer.render(stage, { renderTexture: this.texture, clear: false });
        canvas.app.renderer.framebuffer.blit();
    }

    show(alpha = 1.0, min = 0.0, max = 1.0) {
        if (alpha > 0) {
            const container = new PIXI.Container();

            container.addChild(this.sprite);
            container.zIndex = Infinity;

            if (this.texture.baseTexture.format === PIXI.FORMATS.RED && (
                this.texture.baseTexture.type === PIXI.TYPES.FLOAT ||
                this.texture.baseTexture.type === PIXI.TYPES.HALF_FLOAT)) {
                const filter = new PIXI.Filter(`\
                    attribute vec2 aVertexPosition;
                    attribute vec2 aTextureCoord;

                    uniform mat3 projectionMatrix;

                    varying vec2 vTextureCoord;

                    void main(void)
                    {
                        gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
                        vTextureCoord = aTextureCoord;
                    }`, `\
                    varying vec2 vTextureCoord;

                    uniform sampler2D uSampler;
                    uniform float uMin;
                    uniform float uMax;
                    uniform float uAlpha;

                    void main()
                    {
                        float r = texture2D(uSampler, vTextureCoord).r;
                        vec4 color;

                        if (r < uMin) {
                            color = vec4(0.0, 0.0, 0.0, 1.0);
                        } else if (r > uMax) {
                            color = vec4(1.0, 1.0, 1.0, 1.0);
                        } else {
                            float s = clamp((r - uMin) / (uMax - uMin), 0.0, 1.0) * 4.0;

                            if (0.0 <= s && s < 1.0) {
                                color = mix(vec4(0.0, 0.0, 1.0, 1.0), vec4(0.0, 1.0, 1.0, 1.0), s);
                            } else if (1.0 <= s && s < 2.0) {
                                color = mix(vec4(0.0, 1.0, 1.0, 1.0), vec4(0.0, 1.0, 0.0, 1.0), s - 1.0);
                            } else if (2.0 <= s && s < 3.0) {
                                color = mix(vec4(0.0, 1.0, 0.0, 1.0), vec4(1.0, 1.0, 0.0, 1.0), s - 2.0);
                            } else if (3.0 <= s && s <= 4.0) {
                                color = mix(vec4(1.0, 1.0, 0.0, 1.0), vec4(1.0, 0.0, 0.0, 1.0), s - 3.0);
                            }
                        }

                        gl_FragColor = color * uAlpha;
                    }`, {
                    uMin: min,
                    uMax: max,
                    uAlpha: alpha
                });

                container.filters = [filter];
            } else {
                container.filters = [new PIXI.filters.AlphaFilter(alpha)];
            }

            canvas.stage.addChild(container);
        } else {
            this.hide();
        }
    }

    hide() {
        const container = this.sprite.parent;

        if (container) {
            container.removeChild(this.sprite);
            container.destroy(true);
        }
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

class MaskStage extends PIXI.Container {
    constructor() {
        super();

        this.clear = undefined;
        this.clearColor = undefined;
    }

    render(renderer) {
        if (this.clear !== undefined ? this.clear : renderer.clearBeforeRender) {
            const clearColor = this.clearColor;
            const gl = renderer.gl;

            if (clearColor instanceof Float32Array) {
                gl.clearBufferfv(gl.COLOR, 0, clearColor);
            } else if (clearColor instanceof Int32Array) {
                gl.clearBufferiv(gl.COLOR, 0, clearColor);
            } else if (clearColor instanceof Uint32Array) {
                gl.clearBufferuiv(gl.COLOR, 0, clearColor);
            } else {
                renderer.renderTexture.clear(clearColor, PIXI.BUFFER_BITS.COLOR);
            }
        }

        super.render(renderer);
    }
}

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

export class MaskData extends PIXI.MaskData {
    constructor(name, filter) {
        super(new PIXI.Sprite(Mask.getTexture(name)));

        this.filter = filter ?? new MaskFilter();
        this.resolution = null;
        this.multisample = PIXI.MSAA_QUALITY.NONE;
    }
}
