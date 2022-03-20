import { Logger } from "./logger.js";
import { Sprite, SpriteMaterial } from "./sprite.js";

export class Framebuffer extends PIXI.utils.EventEmitter {
    static buffers = {};
    static debug = false;

    static create({ name, dependencies = [] }, ...args) {
        console.assert(typeof name === "string" && !this.buffers.hasOwnProperty(name));

        const buffer = new this(...args);

        buffer.name = name;
        buffer.dependencies = Object.assign({}, ...Array.from(dependencies, v => ({ [v]: null })));
        buffer.dependents = null;

        this.buffers[name] = buffer;

        const sorted = [];
        const visited = {};

        const visit = (buffer, dependent) => {
            if (!buffer) {
                return null;
            }

            if (visited.hasOwnProperty(buffer.name)) {
                if (dependent) {
                    buffer.dependents[dependent.name] = dependent;
                }

                return buffer;
            } else {
                buffer.dependents = dependent ? { [dependent.name]: dependent } : {};
            }

            visited[buffer.name] = true;

            for (const name of Object.keys(buffer.dependencies)) {
                buffer.dependencies[name] = visit(this.buffers[name], buffer);
            }

            sorted.push(buffer);

            return buffer;
        }

        for (const buffer of Object.values(this.buffers)) {
            visit(buffer);
        }

        for (const name of Object.keys(this.buffers)) {
            delete this.buffers[name];
        }

        for (const buffer of sorted) {
            this.buffers[buffer.name] = buffer;
        }

        return buffer;
    }

    static get(name) {
        return this.buffers[name];
    }

    static getTexture(name, index = 0) {
        return this.get(name)?.textures[index] ?? PIXI.Texture.EMPTY;
    }

    static getSprite(name, index = 0) {
        return this.get(name)?.sprites[index];
    }

    static invalidateAll() {
        for (const buffer of Object.values(this.buffers)) {

            if (!(buffer instanceof this)) {
                continue;
            }

            buffer.invalidate();
        }
    }

    static updateAll() {
        let updated;
        let start;

        if (this.debug) {
            start = performance.now();
        }

        for (const buffer of Object.values(this.buffers)) {
            if (!(buffer instanceof this)) {
                continue;
            }

            if (buffer.dirty === true) {
                buffer.dirty = false;

                buffer.emit("preupdate", buffer);
                buffer.emit("update", buffer);
                buffer.emit("postupdate", buffer);

                if (this.debug) {
                    if (!updated) {
                        updated = [];
                    }

                    updated.push(buffer.name);
                }
            }
        }

        if (this.debug && updated) {
            const end = performance.now();
            const elapsed = Math.round((end - start) * 100) / 100;

            Logger.debug("Framebuffer | Updated | %fms | %s", elapsed, updated.join(" "));
        }
    }

    static hideAll() {
        for (const buffer of Object.values(this.buffers)) {

            if (!(buffer instanceof this)) {
                continue;
            }

            buffer.hide();
        }
    }

    name;
    texturesOptions;
    framebufferOptions;
    textures;
    sprites;
    framebuffer;
    drawBuffers;
    dirty;

    constructor(texturesOptions, framebufferOptions) {
        super();

        this.reset(texturesOptions, framebufferOptions);
    }

    reset(texturesOptions = [], framebufferOptions = {}) {
        this.framebufferOptions = framebufferOptions = Object.assign(this.framebufferOptions ?? {
            multisample: PIXI.MSAA_QUALITY.NONE,
            depth: false,
            stencil: false,
            clearDepth: 1,
            clearStencil: 0
        }, framebufferOptions);

        this.texturesOptions = this.texturesOptions ?? [];

        for (let i = 0, n = texturesOptions.length; i < n; i++) {
            this.texturesOptions[i] = Object.assign(this.texturesOptions[i] ?? {
                wrapMode: PIXI.WRAP_MODES.CLAMP,
                scaleMode: PIXI.SCALE_MODES.NEAREST,
                format: PIXI.FORMATS.RED,
                type: PIXI.TYPES.UNSIGNED_BYTE,
                target: PIXI.TARGETS.TEXTURE_2D,
                alphaMode: PIXI.ALPHA_MODES.PMA,
                multisample: framebufferOptions.multisample,
                clearColor: [0, 0, 0, 0],
            }, texturesOptions[i] ?? {});

            const options = this.texturesOptions[i];

            options.mipmap = PIXI.MIPMAP_MODES.OFF;
            options.anisotropicLevel = 0;

            const clearColor = options.clearColor;

            if (clearColor) {
                options.clearColor = new Float32Array(4);

                if (clearColor) {
                    for (let j = 0; j < Math.min(clearColor.length, 4); j++) {
                        options.clearColor[j] = clearColor[j];
                    }
                }
            }
        }

        texturesOptions = this.texturesOptions;

        if (!this.textures) {
            this.textures = [];
            this.sprites = [];
            this.drawBuffers = [];

            for (let i = 0; i < texturesOptions.length; i++) {
                const options = {
                    ...texturesOptions[i],
                    width: 1,
                    height: 1,
                    resolution: 1,
                    multisample: framebufferOptions.multisample
                };

                let texture;

                if (i === 0) {
                    texture = PIXI.RenderTexture.create(options);

                    const baseTexture = texture.baseTexture;

                    this.framebuffer = baseTexture.framebuffer;
                    this.framebuffer.depth = !!framebufferOptions.depth;
                    this.framebuffer.stencil = !!framebufferOptions.stencil;
                    this.framebuffer.clearDepth = framebufferOptions.clearDepth ?? undefined;
                    this.framebuffer.clearStencil = framebufferOptions.clearStencil ?? undefined;
                    this.framebuffer.cleared = false;
                } else {
                    // TODO: BaseRenderTexture?
                    const baseTexture = new PIXI.BaseTexture(null, options);

                    baseTexture.valid = true;
                    // This prevents the base texture from being destroyed by the texture GC system:
                    baseTexture.framebuffer = this.framebuffer;

                    this.framebuffer.addColorTexture(i, baseTexture);

                    // TODO: RenderTexture?
                    texture = new PIXI.Texture(baseTexture);
                    texture.valid = true;
                }

                texture.baseTexture.clearColor = new Float32Array(4);

                if (options.clearColor) {
                    texture.baseTexture.clear = true;
                    texture.baseTexture.clearColor.set(options.clearColor);
                } else {
                    texture.baseTexture.clear = false;
                }

                this.textures.push(texture);
                this.sprites.push(new FramebufferSprite(new SpriteMaterial(this.textures[i])));
                this.drawBuffers.push(WebGL2RenderingContext.COLOR_ATTACHMENT0 + i);

                const name = options.name;

                if (typeof name === "string") {
                    this.textures[name] = this.textures[i];
                    this.sprites[name] = this.sprites[i];
                }
            }
        } else {
            for (const name of Object.keys(this.textures)) {
                if (!Number.isInteger(Number(name))) {
                    delete this.textures[name];
                    delete this.sprites[name];
                }
            }

            const textures = this.textures;

            for (let i = 0; i < textures.length; i++) {
                const baseTexture = textures[i].baseTexture;
                const options = texturesOptions[i];

                baseTexture.dispose();
                baseTexture.mipmap = options.mipmap;
                baseTexture.anisotropicLevel = options.anisotropicLevel;
                baseTexture.wrapMode = options.wrapMode;
                baseTexture.scaleMode = options.scaleMode;
                baseTexture.format = options.format;
                baseTexture.target = options.target;
                baseTexture.type = options.type;
                baseTexture.alphaMode = options.alphaMode;

                if (options.clearColor) {
                    baseTexture.clear = true;
                    baseTexture.clearColor.set(options.clearColor);
                } else {
                    baseTexture.clear = false;
                    baseTexture.clearColor.fill(0);
                }

                const name = options.name;

                if (typeof name === "string") {
                    this.textures[name] = this.textures[i];
                    this.sprites[name] = this.sprites[i];
                }
            }

            this.framebuffer.dispose();
            this.framebuffer.multisample = framebufferOptions.multisample;
            this.framebuffer.depth = !!framebufferOptions.depth;
            this.framebuffer.stencil = !!framebufferOptions.stencil;
            this.framebuffer.clearDepth = framebufferOptions.clearDepth ?? undefined;
            this.framebuffer.clearStencil = framebufferOptions.clearStencil ?? undefined;
            this.framebuffer.cleared = false;

            for (const framebuffer of Object.values(this.framebuffers)) {
                if (framebuffer !== this.framebuffer) {
                    framebuffer.dispose();
                }
            }
        }

        this.framebuffers = { [[...Array(this.textures.length).keys()].join(",")]: this.framebuffer };
        this.dirty = undefined;

        if (this.constructor.debug) {
            Logger.debug("Framebuffer | Disposed & Reset | %s", this.name);
        }
    }

    acquire() {
        if (this.dirty === undefined) {
            this.dirty = true;

            for (const dependent of Object.values(this.dependents)) {
                dependent?.invalidate();
            }
        }
    }

    dispose() {
        if (this.dirty !== undefined) {
            this.reset();
        }
    }

    destroy() {
        for (let i = 0; i < this.textures.length; i++) {
            this.textures[i].destroy(true);
            this.sprites[i].destroy();
        }

        for (const framebuffer of Object.values(this.framebuffers)) {
            if (framebuffer !== this.framebuffer) {
                framebuffer.dispose();
            }
        }

        this.textures = null;
        this.sprites = null;
        this.framebuffer = null;
        this.framebuffers = null;
        this.drawBuffers = null;

        if (this.constructor.debug) {
            Logger.debug("Framebuffer | Destroyed | %s", this.name);
        }

        delete this.constructor.buffers[this.name];
    }

    get disposed() {
        return this.dirty === undefined;
    }

    get destroyed() {
        return !this.framebuffer;
    }

    render(renderer, displayObject, clear = true, transform = null, skipUpdateTransform = false, attachments = null) {
        const textures = this.textures;
        const renderTexture = textures[0];
        const { width, height } = renderer.screen;
        const resolution = renderer.resolution;

        if (renderTexture.width !== width || renderTexture.height !== height || renderTexture.resolution !== resolution) {
            for (let i = 0; i < textures.length; i++) {
                textures[i].baseTexture.resolution = resolution;
            }

            for (let i = 0; i < textures.length; i++) {
                const texture = textures[i];

                if (i === 0) {
                    texture.resize(width, height);
                } else {
                    texture.valid = width > 0 && height > 0;
                    texture._frame.width = texture.orig.width = width;
                    texture._frame.height = texture.orig.height = height;
                    texture.updateUvs();
                }

                const sprite = this.sprites[i];

                sprite.width = width;
                sprite.height = height;
                sprite.updateTransform();
            }

            for (const framebuffer of Object.values(this.framebuffers)) {
                if (framebuffer === this.framebuffer) {
                    continue;
                }

                framebuffer.width = width;
                framebuffer.height = height;

                framebuffer.dirtyId++;
                framebuffer.dirtySize++;

                if (framebuffer.depthTexture) {
                    const resolution = framebuffer.depthTexture.resolution;

                    framebuffer.depthTexture.setSize(width / resolution, height / resolution);
                }
            }
        }

        renderer.renderingToScreen = false;
        renderer.runners.prerender.emit();
        renderer.emit("prerender");
        renderer.projection.transform = transform;

        if (renderer.context.isLost) {
            return;
        }

        if (!skipUpdateTransform) {
            const cacheParent = displayObject.enableTempParent();

            displayObject.updateTransform();
            displayObject.disableTempParent(cacheParent);
        }

        clear = clear ?? renderer.clearBeforeRender;

        for (let i = 0; i < textures.length; i++) {
            const baseTexture = textures[i].baseTexture;

            baseTexture.cleared = !clear;
        }

        for (const framebuffer of Object.values(this.framebuffers)) {
            framebuffer.cleared = !clear;
        }

        this.bind(renderer, attachments);

        renderer.state.reset();
        renderer.batch.currentRenderer.start();

        displayObject.render(renderer);

        renderer.batch.currentRenderer.flush();

        for (let i = 0; i < textures.length; i++) {
            textures[i].baseTexture.update();
        }

        renderer.runners.postrender.emit();
        renderer.projection.transform = null;
        renderer.emit("postrender");
        renderer.framebuffer.blit();
    }

    bind(renderer, attachments = null) {
        const renderTexture = this.textures[0];
        const drawBuffers = this.drawBuffers;
        const gl = renderer.gl;
        let framebuffer;

        if (!attachments) {
            framebuffer = this.framebuffer;
        } else {
            const key = attachments.join(",");

            if (!this.framebuffers.hasOwnProperty(key)) {
                framebuffer = new PIXI.Framebuffer(this.framebuffer.width, this.framebuffer.height);
                framebuffer.multisample = this.framebufferOptions.multisample;
                framebuffer.depth = !!this.framebufferOptions.depth;
                framebuffer.stencil = !!this.framebufferOptions.stencil;
                framebuffer.clearDepth = this.framebufferOptions.clearDepth ?? undefined;
                framebuffer.clearStencil = this.framebufferOptions.clearStencil ?? undefined;
                framebuffer.cleared = false;

                for (let i = 0; i < attachments.length; i++) {
                    framebuffer.addColorTexture(i, this.textures[attachments[i]].baseTexture);
                }

                this.framebuffers[key] = framebuffer;
            } else {
                framebuffer = this.framebuffers[key];
            }
        }

        if (renderer.renderTexture.current !== renderTexture) {
            renderer.renderTexture.bind(renderTexture);
        }

        if (renderer.framebuffer.current !== framebuffer) {
            if (Object.values(this.framebuffers).indexOf(renderer.framebuffer.current) >= 0) {
                for (const baseTexture of renderer.framebuffer.current.colorTextures) {
                    if (framebuffer.colorTextures.indexOf(baseTexture) < 0) {
                        baseTexture.update();
                    }
                }
            }

            renderer.framebuffer.bind(framebuffer, renderer.framebuffer.viewport);
        }

        drawBuffers.length = 0;

        for (let i = 0, n = framebuffer.colorTextures.length; i < n; i++) {
            drawBuffers.push(WebGL2RenderingContext.COLOR_ATTACHMENT0 + i);
        }

        renderer.gl.drawBuffers(drawBuffers);

        for (let i = 0, n = framebuffer.colorTextures.length; i < n; i++) {
            const baseTexture = framebuffer.colorTextures[i];

            if (!baseTexture.cleared) {
                if (baseTexture.clear) {
                    gl.clearBufferfv(gl.COLOR, i, baseTexture.clearColor);
                }

                baseTexture.cleared = true;
            }
        }

        if (!framebuffer.cleared) {
            if (framebuffer.depth || framebuffer.stencil) {
                const { clearDepth, clearStencil } = framebuffer;

                if (clearDepth !== undefined && clearStencil !== undefined) {
                    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, clearDepth, clearStencil);
                } else if (clearDepth !== undefined) {
                    gl.clearBufferfv(gl.DEPTH, 0, [clearDepth]);
                } else if (clearStencil !== undefined) {
                    gl.clearBufferiv(gl.STENCIL, 0, [clearStencil]);
                }
            }

            framebuffer.cleared = true;
        }
    }

    invalidate() {
        if (this.dirty === false) {
            this.dirty = true;

            for (const dependent of Object.values(this.dependents)) {
                dependent?.invalidate();
            }
        }
    }

    show(stage, index = 0, channel = 0, alpha = 1.0) {
        if (this.dirty === undefined) {
            return;
        }

        this.hide();

        if (alpha > 0) {
            const container = new PIXI.Container();

            container.filters = [new FramebufferSpriteFilter(channel, alpha)];
            container.zIndex = Infinity;
            container.addChild(this.sprites[index]);

            stage.addChild(container);
        }
    }

    hide(index) {
        if (this.dirty === undefined) {
            return;
        }

        for (let i = 0; i < this.sprites.length; i++) {
            if (index == null || index === i) {
                const sprite = this.sprites[i];
                const container = sprite.parent;

                if (container) {
                    container.removeChild(sprite);
                    container.destroy(true);
                }
            }
        }
    }
}

class FramebufferSprite extends Sprite {
    constructor(shader) {
        super(shader);

        this.interactive = false;
        this.interactiveChildren = false;
        this.accessible = false;
        this.accessibleChildren = false;
    }

    get renderable() {
        return true;
    }

    set renderable(value) { }

    updateTransform() {
        this._boundsID++;
        this.transform.updateTransform(PIXI.Transform.IDENTITY);
        this.worldAlpha = this.alpha;
    }
}

class FramebufferSpriteFilter extends PIXI.Filter {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;

        varying vec2 vTextureCoord;

        void main() {
            vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);

            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);

            vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;

        uniform sampler2D uSampler;
        uniform vec4 uWeights;
        uniform float uAlpha;

        void main() {
            float value = dot(texture2D(uSampler, vTextureCoord), uWeights);

            gl_FragColor = vec4(value, value, value, 1.0) * uAlpha;
        }`;

    constructor(channel = 0, alpha = 1) {
        const weights = new Float32Array(4);

        weights[channel] = 1;

        super(FramebufferSpriteFilter.vertexSrc, FramebufferSpriteFilter.fragmentSrc, {
            uWeights: weights,
            uAlpha: alpha
        });
    }
}
