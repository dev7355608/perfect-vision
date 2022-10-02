import { Sprite, SpriteMaterial } from "./sprite.js";

export class Framebuffer {
    /**
     * The textures options.
     * @type {object}
     * @readonly
     */
    texturesOptions;

    /**
     * The framebuffer options.
     * @type {object}
     * @readonly
     */
    framebufferOptions;

    /**
     * The render textures.
     * @type {PIXI.RenderTexture[]}
     * @readonly
     */
    textures;

    /**
     * The sprites.
     * @type {FramebufferSprite[]}
     * @readonly
     */
    sprites;

    /**
     * The sprites.
     * @type {Object<string,PIXI.RenderTexture|Proxy}}
     * @readonly
     */
    framebuffers;

    /**
     * Is dirty?
     * @type {boolean|undefined}
     * @readonly
     */
    dirty;

    /**
     * Is destroyed?
     * @type {boolean}
     * @readonly
     */
    destroyed = false;

    /**
     * Default framebuffer key.
     * @type {string}
     */
    #defaultFramebufferKey;

    /**
     * @param {object} [texturesOptions] - The textures options.
     * @param {object} [framebufferOptions] - The framebuffer options.
     */
    constructor(texturesOptions, framebufferOptions) {
        this.reset(texturesOptions, framebufferOptions);
    }

    /**
     * Reset.
     * @param {object} [texturesOptions] - The textures options.
     * @param {object} [framebufferOptions] - The framebuffer options.
     */
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

            for (let i = 0; i < texturesOptions.length; i++) {
                const options = {
                    ...texturesOptions[i],
                    width: 1,
                    height: 1,
                    resolution: 1,
                    multisample: framebufferOptions.multisample
                };

                const texture = PIXI.RenderTexture.create(options);
                const baseTexture = texture.baseTexture;
                const framebuffer = baseTexture.framebuffer;

                framebuffer.depth = !!framebufferOptions.depth;
                framebuffer.stencil = !!framebufferOptions.stencil;
                framebuffer.clearDepth = framebufferOptions.clearDepth ?? undefined;
                framebuffer.clearStencil = framebufferOptions.clearStencil ?? undefined;
                framebuffer.cleared = false;
                framebuffer.renderTexture = texture;

                baseTexture.clearColor = new Float32Array(4);

                if (options.clearColor) {
                    baseTexture.clear = true;
                    baseTexture.clearColor.set(options.clearColor);
                } else {
                    baseTexture.clear = false;
                }

                this.textures.push(texture);
                this.sprites.push(new FramebufferSprite(new SpriteMaterial(texture)));
            }

            this.#defaultFramebufferKey = [...new Array(this.textures.length).keys()].join(",");
        } else {
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
            }

            for (const framebuffer of Object.values(this.framebuffers)) {
                framebuffer.dispose();
                framebuffer.multisample = framebufferOptions.multisample;
                framebuffer.depth = !!framebufferOptions.depth;
                framebuffer.stencil = !!framebufferOptions.stencil;
                framebuffer.clearDepth = framebufferOptions.clearDepth ?? undefined;
                framebuffer.clearStencil = framebufferOptions.clearStencil ?? undefined;
                framebuffer.cleared = false;
            }
        }

        this.framebuffers = {};

        for (let i = 0; i < this.textures.length; i++) {
            this.framebuffers[`${i}`] = this.textures[i].framebuffer;
        }

        this.dirty = undefined;
    }

    /**
     * Aquire.
     * @returns {boolean} True if and only if aquired by this call.
     */
    acquire() {
        if (this.disposed) {
            this.dirty = true;

            return true;
        }

        return false;
    }

    /**
     * Invalidate.
     * @returns {boolean} True if and only if invalidated by this call.
     */
    invalidate() {
        if (this.dirty === false) {
            this.dirty = true;

            return true;
        }

        return false;
    }

    /**
     * Is disposed?
     * @type {boolean}
     * @readonly
     */
    get disposed() {
        return this.dirty === undefined;
    }

    /**
     * Dispose.
     * @returns {boolean} True if and only if disposed by this call.
     */
    dispose() {
        if (!this.disposed) {
            this.reset();

            return true;
        }

        return false;
    }

    /**
     * Destroy.
     */
    destroy() {
        for (let i = 0; i < this.textures.length; i++) {
            this.textures[i].destroy(true);
            this.sprites[i].destroy();
        }

        for (const framebuffer of Object.values(this.framebuffers)) {
            framebuffer.renderTexture.destroy();
            framebuffer.dispose();
        }

        this.textures = null;
        this.sprites = null;
        this.framebuffers = null;
        this.destroyed = true;
    }

    /**
     * Render the display object.
     * @param {PIXI.Renderer} renderer - The renderer.
     * @param {PIXI.DisplayObject} displayObject - The display object to be rendered.
     * @param {object} [options]
     * @param {boolean|undefined} [options.clear=true] - Clear before rendering?
     * @param {PIXI.Matrix} [options.transform] - The camera transform.
     * @param {boolean} [options.skipUpdateTransform=false] - Skip transform updates?
     * @param {number[]} [options.attachments] - The subset of attachments to render to.
     * @param {boolean} [options.resize=true] - Resize framebuffer?
     * @param {number} [options.width] - The width of the framebuffer. Defaults to the width of the renderer.
     * @param {number} [options.height] - The height of the framebuffer. Defaults to the height of the renderer.
     * @param {number} [options.resolution] - The resolution of the framebuffer. Defaults to the resolution of the renderer.
     */
    render(renderer, displayObject, { clear = true, transform, skipUpdateTransform = false,
        attachments, resize = true, width, height, resolution } = {}) {
        const textures = this.textures;

        if (resize) {
            const texture0 = textures[0];
            const screen = renderer.screen;

            height ??= screen.height;
            width ??= screen.width;
            resolution ??= renderer.resolution;

            if (texture0.width !== width || texture0.height !== height || texture0.resolution !== resolution) {
                const realWidth = Math.round(width * resolution);
                const realHeight = Math.round(height * resolution);

                for (let i = 0; i < textures.length; i++) {
                    const texture = textures[i];
                    const baseTexture = texture.baseTexture;

                    texture.valid = width > 0 && height > 0;
                    texture._frame.width = texture.orig.width = width;
                    texture._frame.height = texture.orig.height = height;
                    baseTexture.setRealSize(realWidth, realHeight, resolution);
                    texture.updateUvs();

                    const sprite = this.sprites[i];

                    sprite.width = width;
                    sprite.height = height;
                    sprite.updateTransform();
                }

                for (const framebuffer of Object.values(this.framebuffers)) {
                    framebuffer.width = realWidth;
                    framebuffer.height = realHeight;

                    framebuffer.dirtyId++;
                    framebuffer.dirtySize++;

                    if (framebuffer.depthTexture) {
                        const resolution = framebuffer.depthTexture.resolution;

                        framebuffer.depthTexture.setSize(width / resolution, height / resolution);
                    }
                }
            }
        }

        renderer.renderingToScreen = false;
        renderer.runners.prerender.emit();
        renderer.emit("prerender");
        renderer.projection.transform = transform ?? null;

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

        renderer.state.reset();
        renderer.batch.currentRenderer.start();

        this.bind(renderer, attachments);

        displayObject.render(renderer);

        renderer.batch.currentRenderer.flush();
        renderer.framebuffer.blit();

        for (let i = 0; i < textures.length; i++) {
            textures[i].baseTexture.update();
        }

        renderer.runners.postrender.emit();
        renderer.projection.transform = null;
        renderer.emit("postrender");
    }

    /**
     * Bind.
     * @param {PIXI.renderer} renderer - The renderer.
     * @param {number[]} [attachments] - The subset of attachments to render to.
     */
    bind(renderer, attachments) {
        if (attachments?.length === 0) {
            return;
        }

        renderer.batch.flush();

        const gl = renderer.gl;
        let framebuffer;

        const key = attachments?.join(",") ?? this.#defaultFramebufferKey;

        if (!this.framebuffers.hasOwnProperty(key)) {
            const { realWidth, realHeight } = this.textures[0].baseTexture;

            framebuffer = new PIXI.Framebuffer(realWidth, realHeight);
            framebuffer.multisample = this.framebufferOptions.multisample;
            framebuffer.depth = !!this.framebufferOptions.depth;
            framebuffer.stencil = !!this.framebufferOptions.stencil;
            framebuffer.clearDepth = this.framebufferOptions.clearDepth ?? undefined;
            framebuffer.clearStencil = this.framebufferOptions.clearStencil ?? undefined;
            framebuffer.cleared = false;

            for (let i = 0; i < (attachments?.length ?? this.textures.length); i++) {
                framebuffer.addColorTexture(i, this.textures[attachments?.[i] ?? i].baseTexture);
            }

            framebuffer.renderTexture = new PIXI.RenderTexture(new Proxy(this.textures[attachments?.[0] ?? 0].baseTexture, {
                get(target, prop) {
                    return prop === "framebuffer" ? framebuffer : Reflect.get(...arguments);
                },
                set(target, prop, value) {
                    if (prop === "framebuffer") {
                        framebuffer = value;
                    } else {
                        return Reflect.set(...arguments);
                    }
                }
            }));

            this.framebuffers[key] = framebuffer;
        } else {
            framebuffer = this.framebuffers[key];
        }

        if (Object.values(this.framebuffers).indexOf(renderer.framebuffer.current) >= 0) {
            for (const baseTexture of renderer.framebuffer.current.colorTextures) {
                if (framebuffer.colorTextures.indexOf(baseTexture) < 0) {
                    baseTexture.update();
                }
            }
        }

        renderer.renderTexture.bind(framebuffer.renderTexture);

        const drawBuffers = [];

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
}

class FramebufferSprite extends Sprite {
    constructor(shader) {
        super(shader);

        this.interactive = false;
        this.interactiveChildren = false;
        this.accessible = false;
        this.accessibleChildren = false;

        this._bounds.minX = -Infinity;
        this._bounds.minY = -Infinity;
        this._bounds.maxX = +Infinity;
        this._bounds.maxY = +Infinity;
    }

    get renderable() {
        return true;
    }

    set renderable(value) { }

    calculateBounds() { }

    getBounds(skipUpdate, rect) {
        if (!skipUpdate) {
            if (!this.parent) {
                this.parent = this._tempDisplayObjectParent;
                this.updateTransform();
                this.parent = null;
            } else {
                this._recursivePostUpdateTransform();
                this.updateTransform();
            }
        }

        if (!rect) {
            if (!this._boundsRect) {
                this._boundsRect = new PIXI.Rectangle();
            }

            rect = this._boundsRect;
        }

        rect.x = 0;
        rect.y = 0;
        rect.width = this.width;
        rect.height = this.height;

        return rect;
    }

    updateTransform() {
        this.transform.updateTransform(PIXI.Transform.IDENTITY);
        this.worldAlpha = this.alpha;
    }
}
