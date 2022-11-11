import { Framebuffer } from "../utils/framebuffer.js";
import { Console } from "../utils/console.js";

export class CanvasFramebuffer extends Framebuffer {
    /**
     * Print debug messages?
     * @type {boolean}
     */
    static #debug = false;

    /**
     * Print debug messages?
     * @type {boolean}
     */
    static get debug() {
        return CanvasFramebuffer.#debug;
    }

    static set debug(value) {
        this.#debug = value;
    }

    /**
     * The framebuffers.
     * @type {Object<string,CanvasFramebuffer>}
     */
    static #buffers = {};

    /**
     * Get the framebuffer.
     * @param {string} id - The ID.
     * @returns {CanvasFramebuffer}
     */
    static get(id) {
        return this.#buffers[id];
    }

    /**
     * Get the texture of the framebuffer.
     * @param {string} id - The ID.
     * @param {number} [index=0] - The attachment.
     * @returns {PIXI.RenderTexture}
     */
    static getTexture(id, index = 0) {
        return this.get(id)?.textures[index] ?? PIXI.Texture.EMPTY;
    }

    /**
     * Get the sprite of the framebuffer.
     * @param {string} id - The ID.
     * @param {number} [index=0] - The attachment.
     * @returns {FramebufferSprite}
     */
    static getSprite(id, index = 0) {
        return this.get(id)?.sprites[index];
    }

    /**
     * Invalidate all framebuffer.
     */
    static invalidateAll() {
        for (const buffer of Object.values(this.#buffers)) {
            buffer.invalidate();
        }
    }

    /**
     * Update all framebuffer.
     */
    static updateAll() {
        for (const buffer of Object.values(this.#buffers)) {
            if (buffer.dirty === true) {
                buffer.dirty = false;

                if (!this.debug) {
                    buffer.update();
                } else {
                    const start = performance.now();

                    buffer.update();

                    const end = performance.now();
                    const elapsed = Math.round((end - start) * 100) / 100;

                    Console.debug(
                        "%s (%O) | Updated | %fms",
                        buffer.constructor.name,
                        buffer,
                        elapsed
                    );
                }
            }
        }
    }

    /**
     * Dispose all framebuffer.
     */
    static disposeAll() {
        for (const buffer of Object.values(this.#buffers)) {
            buffer.dispose();
        }
    }

    /**
     * Hide all debug sprites.
     */
    static hideAll() {
        for (const buffer of Object.values(this.#buffers)) {
            buffer.hide();
        }
    }

    /**
     * The ID.
     * @type {string}
     * @readonly
     */
    id;

    /**
     * The dependencies.
     * @type {Object<string,CanvasFramebuffer>}
     * @readonly
     */
    dependencies;

    /**
     * The dependents.
     * @type {Object<string,CanvasFramebuffer>}
     * @readonly
     */
    dependents;

    /**
     * The stage.
     * @type {PIXI.Container}
     * @readonly
     */
    stage = new PIXI.Container();

    /**
     * The base textures.
     * @type {Set<PIXI.BaseTexture>}
     */
    #baseTextures = new Set();

    /**
     * Is ready?
     * @type {boolean}
     */
    #ready = false;

    /**
     * An object which stores a reference to the normal renderer target and source frame.
     * We track this so we can restore them after rendering our cached texture.
     * @type {{renderTexture: PIXI.RenderTexture, sourceFrame: PIXI.Rectangle, filterStack: PIXI.FilterState[]}}
     */
    #backup = {
        renderTexture: undefined,
        sourceFrame: new PIXI.Rectangle(),
        filterStack: undefined
    };

    /**
    * @type {PIXI.FilterState[]}
    */
    #defaultFilterStack = [{}];

    /**
     * @param {string} id - The name.
     * @param {CanvasFramebuffer[]} dependencies - The dependencies.
     * @param {object} [texturesOptions] - The textures options.
     * @param {object} [framebufferOptions] - The framebuffer options.
     * @private
     */
    constructor(id, dependencies, texturesOptions, framebufferOptions) {
        super(texturesOptions, framebufferOptions);

        this.id = id;
        this.dependencies = Object.assign({}, ...Array.from(dependencies, v => ({ [v]: null })));

        if (id in CanvasFramebuffer.#buffers) {
            throw new Error("Name is already taken");
        }

        CanvasFramebuffer.#buffers[id] = this;

        const sorted = [];
        const visited = {};

        const visit = (buffer, dependent) => {
            if (!buffer) {
                return null;
            }

            if (buffer.id in visited) {
                if (dependent) {
                    buffer.dependents[dependent.id] = dependent;
                }

                return buffer;
            } else {
                buffer.dependents = dependent ? { [dependent.id]: dependent } : {};
            }

            visited[buffer.id] = true;

            for (const name of Object.keys(buffer.dependencies)) {
                buffer.dependencies[name] = visit(CanvasFramebuffer.#buffers[name], buffer);
            }

            sorted.push(buffer);

            return buffer;
        }

        for (const buffer of Object.values(CanvasFramebuffer.#buffers)) {
            visit(buffer);
        }

        for (const name of Object.keys(CanvasFramebuffer.#buffers)) {
            delete CanvasFramebuffer.#buffers[name];
        }

        for (const buffer of sorted) {
            CanvasFramebuffer.#buffers[buffer.id] = buffer;
        }
    }

    /** @override */
    reset(texturesOptions, framebufferOptions) {
        super.reset(texturesOptions, framebufferOptions);

        if (this.constructor.debug) {
            texturesOptions = this.texturesOptions;
            framebufferOptions = this.framebufferOptions;

            Console.debug(
                "%s (%O) | Reset | %O",
                this.constructor.name,
                this,
                { texturesOptions, framebufferOptions }
            );
        }
    }

    /** @override */
    acquire() {
        if (super.acquire()) {
            for (const dependent of Object.values(this.dependents)) {
                dependent?.invalidate();
            }

            if (this.constructor.debug) {
                Console.debug("%s (%O) | Aquired", this.constructor.name, this);
            }

            return true;
        }

        return false;
    }

    /** @override */
    invalidate() {
        if (super.invalidate()) {
            for (const dependent of Object.values(this.dependents)) {
                dependent?.invalidate();
            }

            if (this.constructor.debug) {
                Console.debug("%s (%O) | Invalidated", this.constructor.name, this);
            }

            return true;
        }

        return false;
    }

    /** @override */
    dispose() {
        if (super.dispose()) {
            if (this.constructor.debug) {
                Console.debug("%s (%O) | Disposed", this.constructor.name, this);
            }

            return true;
        }

        return false;
    }

    /** @override */
    destroy() {
        super.destroy();

        delete CanvasFramebuffer.#buffers[this.id];

        if (this.constructor.debug) {
            Console.debug("%s (%O) | Destroyed", this.constructor.name, this);
        }
    }

    /**
     * Show the debug sprite.
     * @param {number} [index=0] - The attachment.
     * @param {number} [channel=0] - The color channel.
     * @param {number} [alpha=1] - The alpha.
     */
    show(index = 0, channel = 0, alpha = 1) {
        if (this.disposed) {
            return;
        }

        this.hide();

        if (alpha > 0) {
            const container = new PIXI.Container();
            const sprite = container.addChild(this.sprites[index]);

            container.filters = [new FramebufferSpriteFilter(channel, alpha)];
            container.filterArea = new PIXI.Rectangle(0, 0, sprite.width, sprite.height);
            container.zIndex = Infinity;

            canvas.stage.addChild(container);
        }
    }

    /**
     * Hide the debug sprite.
     * @param {number} [index] - The attachment.
     */
    hide(index) {
        if (this.disposed) {
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

    /**
     * Draw.
     */
    draw() {
        if (this.#ready) {
            return;
        }

        this.#ready = true;
        this._draw();
        this.invalidate();
    }

    /**
     * Draw.
     * @protected
     */
    _draw() {
        throw new Error("Not implemented");
    }

    /**
     * Refresh.
     */
    refresh() {
        if (!this.#ready) {
            return;
        }

        this._refresh();
    }

    /**
     * Refresh.
     * @protected
     */
    _refresh() {
        throw new Error("Not implemented");
    }

    /**
     * Tear down.
     */
    tearDown() {
        if (!this.#ready) {
            return;
        }

        this._tearDown();
        this.stage.removeChildren().forEach(c => c.destroy({ children: true }));
        this.#baseTextures.forEach(t => t.off("update", this._onBaseTextureUpdate, this));
        this.#baseTextures.clear();
        this.#ready = false;
        this.dispose();
    }

    /**
     * Tear down.
     * @protected
     */
    _tearDown() {
        throw new Error("Not implemented");
    }

    /**
     * Update.
     */
    update() {
        if (!this.#ready) {
            return;
        }

        const canvasTransform = canvas.stage.transform;
        const stageTransform = this.stage.transform;

        stageTransform.pivot.copyFrom(canvasTransform.pivot);
        stageTransform.position.copyFrom(canvasTransform.position);
        stageTransform.rotation = canvasTransform.rotation;
        stageTransform.scale.copyFrom(canvasTransform.scale);
        stageTransform.skew.copyFrom(canvasTransform.skew);

        const renderer = canvas.app.renderer;
        const rt = renderer.renderTexture;

        this.#backup.renderTexture = rt.current;
        this.#backup.sourceFrame.copyFrom(rt.sourceFrame);
        this.#backup.filterStack = renderer.filter.defaultFilterStack;

        renderer.filter.defaultFilterStack = this.#defaultFilterStack;

        this._update(renderer);

        renderer.batch.flush();
        renderer.renderTexture.bind(this.#backup.renderTexture, this.#backup.sourceFrame, undefined);
        renderer.filter.defaultFilterStack = this.#backup.filterStack;

        this.#backup.renderTexture = undefined;
        this.#backup.filterStack = undefined;
    }

    /**
     * Update.
     * @param {PIXI.Renderer} renderer
     * @protected
     */
    _update(renderer) {
        this.render(renderer, this.stage);
    }

    /**
     * Listen to updates of this texture.
     * @param {PIXI.Texture|PIXI.BaseTexture} texture - The (base) texture.
     * @protected
     */
    _addTexture(texture) {
        texture = texture.castToBaseTexture();

        if (this.#baseTextures.has(texture)) {
            return;
        }

        this.#baseTextures.add(texture);
        texture.on("update", this._onBaseTextureUpdate, this);
    }

    /**
     * Stop listening to updates of this texture.
     * @param {PIXI.Texture|PIXI.BaseTexture} texture - The (base) texture.
     * @protected
     */
    _removeTexture(texture) {
        texture = texture.castToBaseTexture();

        if (!this.#baseTextures.has(texture)) {
            return;
        }

        this.#baseTextures.delete(texture);
        texture.off("update", this._onBaseTextureUpdate, this);
    }

    /**
     * Called if the base texture was updated.
     * @param {PIXI.BaseTexture} baseTexture
     * @protected
     */
    _onBaseTextureUpdate(baseTexture) {
        this.invalidate();
    }
}

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    let mask;

    Hooks.on("canvasReady", () => {
        canvas.masks.depth.renderTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        canvas.masks.depth.renderTexture.baseTexture.update();
        canvas.masks.occlusion.renderTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        canvas.masks.occlusion.renderTexture.baseTexture.update();

        if (!mask || mask.destroyed) {
            mask = new PIXI.Container();
            mask.render = () => CanvasFramebuffer.updateAll();
            mask.clear = () => { };
        }

        if (mask.parent) {
            mask.parent.removeChild(mask);
        }

        canvas.masks.addChildAt(mask, canvas.masks.getChildIndex(canvas.masks.depth));
        canvas.app.renderer.on("resize", CanvasFramebuffer.invalidateAll, CanvasFramebuffer);

        CanvasFramebuffer.invalidateAll();
    });

    Hooks.on("canvasTearDown", () => {
        canvas.app.renderer.off("resize", CanvasFramebuffer.invalidateAll, CanvasFramebuffer);
    });

    Hooks.on("canvasPan", () => {
        CanvasFramebuffer.invalidateAll();
    });
});

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
