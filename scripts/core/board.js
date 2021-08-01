import { Logger } from "../utils/logger.js";

export class Layer extends PIXI.Container {
    constructor(zIndex) {
        super();

        this.sortableChildren = true;
        this.zIndex = zIndex;
    }

    updateTransform() {
        for (let i = 0, j = this.children.length; i < j; ++i) {
            const child = this.children[i];

            if (child._zIndex !== child.zIndex) {
                child._zIndex = child.zIndex;
                this.sortDirty = true;
            }
        }

        super.updateTransform();
    }
}

export class Detachment extends PIXI.Container {
    constructor(object) {
        super();

        this.object = object;
        this._zIndex = 0;
    }

    get transform() {
        return this.object.transform;
    }

    set transform(value) { }

    get visible() {
        return this.object.visible;
    }

    set visible(value) { }

    get renderable() {
        return this.object.renderable;
    }

    set renderable(value) { }

    get zIndex() {
        return this.object.zIndex;
    }

    set zIndex(value) { }

    get alpha() {
        return this.object.alpha;
    }

    set alpha(value) { }

    get worldAlpha() {
        return this.object.worldAlpha;
    }

    set worldAlpha(value) { }

    get sortableChildren() {
        return this.object.sortableChildren;
    }

    set sortableChildren(value) { }

    updateTransform() {
        this.object._recursivePostUpdateTransform();

        if (this.sortableChildren && this.sortDirty) {
            this.sortChildren();
        }

        this._boundsID++;

        for (let i = 0, j = this.children.length; i < j; ++i) {
            const child = this.children[i];

            if (child.visible) {
                child.updateTransform();
            }
        }
    }

    _recursivePostUpdateTransform() {
        this.object._recursivePostUpdateTransform();
    }
}

export class Placeholder extends PIXI.DisplayObject {
    constructor(object) {
        super();

        this.object = object;
    }

    get transform() {
        return this.object.transform;
    }

    set transform(value) { }

    get visible() {
        return this.object.visible;
    }

    set visible(value) { }

    get renderable() {
        return this.object.renderable;
    }

    set renderable(value) { }

    get zIndex() {
        return this.object.zIndex;
    }

    set zIndex(value) { }

    get _bounds() {
        return this.object._bounds;
    }

    set _bounds(value) { }

    get _localBounds() {
        return this.object._localBounds;
    }

    set _localBounds(value) { }

    get _boundsRect() {
        return this.object._boundsRect;
    }

    set _boundsRect(value) { }

    get _localBoundsRect() {
        return this.object._localBoundsRect;
    }

    set _localBoundsRect(value) { }

    calculateBounds() { }

    getBounds(skipUpdate, rect) {
        return this.object.getBounds(skipUpdate, rect);
    }

    getLocalBounds(rect) {
        return this.object.getLocalBounds(rect);
    }

    getGlobalPosition(point, skipUpdate) {
        return this.object.getGlobalPosition(point, skipUpdate);
    }

    toGlobal(position, point, skipUpdate) {
        return this.object.toGlobal(position, point, skipUpdate);
    }

    toLocal(position, from, point, skipUpdate) {
        return this.object.toLocal(position, from, point, skipUpdate);
    }

    updateTransform() {
        this.object._recursivePostUpdateTransform();
        this.object.updateTransform();
    }

    _recursivePostUpdateTransform() {
        this.object._recursivePostUpdateTransform();
    }

    render(renderer) { }
}

export class Board extends PIXI.Container {
    static debug = false;
    static boards = new Map();
    static layers = {
        background: 0,
        templates: 50,
        tokens: 100,
        effects: 200,
        foreground: 300,
        weather: 400,
        lighting: 500
    };

    static create(name, options) {
        console.assert(typeof name === "string" && !this.boards.has(name));

        const board = new Board(options);

        board.name = name;

        this.boards.set(name, board);

        return board;
    }

    static get(name) {
        return this.boards.get(name);
    }

    static initialize() {
        for (const board of this.boards.values()) {
            board.clear();
            board.visible = true;
            board.renderable = true;
            board.alpha = 1;
            board.mask = null;
            board.filters = [];
            board.filterArea = canvas.app.renderer.screen;

            canvas.stage.addChild(board);
        }
    }

    static defaultOptions() {
        return {
            zIndex: 0
        };
    }

    constructor(options) {
        options = Object.assign(Board.defaultOptions(), options);

        super();

        this.pieces = new Map();
        this.zIndex = options.zIndex;
        this.sortableChildren = true;
    }

    place(id, piece, layer) {
        if (!id) {
            return;
        }

        this.unplace(id);

        if (!piece) {
            return;
        }

        let layerIndex = layer;

        if (typeof layerIndex === "string") {
            const [, name, offset] = layerIndex.match(/^([A-Z]+)([+-]\d+)?$/i);

            layerIndex = Board.layers[name] + parseInt(offset ?? 0, 10);
        }

        if (Board.debug) {
            Logger.debug("Placing %s on the %s board at %d", id, this.name, layerIndex);
        }

        layer = null;

        for (let i = 0; i < this.children.length; i++) {
            const child = this.children[i];

            if (child.zIndex === layerIndex) {
                layer = child;
                break;
            }
        }

        if (!layer) {
            layer = new Layer(layerIndex);

            this.addChild(layer);
        }

        const owner = piece.parent;
        const detachment = new Detachment(owner);
        const placeholder = new Placeholder(piece);
        const index = owner.getChildIndex(piece);

        layer.addChild(detachment);
        detachment.addChild(piece);
        owner.addChildAt(placeholder, index);
        this.pieces.set(id, { piece, owner, detachment, layer, placeholder });
    }

    unplace(id) {
        if (!id) {
            return;
        }

        if (id instanceof RegExp) {
            for (const piece of this.pieces.keys()) {
                if (id.test(piece)) {
                    this.unplace(piece);
                }
            }

            return;
        }

        if (!this.pieces.has(id)) {
            return;
        }

        if (Board.debug) {
            Logger.debug("Unplacing %s from the %s board", id, this.name);
        }

        const { piece, owner, detachment, layer, placeholder } = this.pieces.get(id);

        if (placeholder.parent === owner) {
            const index = owner.getChildIndex(placeholder);

            placeholder.destroy(true);
            owner.addChildAt(piece, index);
        } else {
            if (!placeholder.destroyed) {
                placeholder.destroy(true);
            }

            if (!piece.destroyed) {
                piece.destroy();
            }
        }

        detachment.destroy(true);
        this.pieces.delete(id);

        if (layer.children.length === 0) {
            layer.destroy(true);
        }
    }

    clear() {
        if (Board.debug) {
            Logger.debug("Clearing %s board", this.name);
        }

        for (const id of this.pieces.keys()) {
            this.unplace(id);
        }
    }
}

Hooks.on("canvasInit", () => {
    Board.initialize();
});
