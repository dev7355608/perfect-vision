import { Logger } from "../utils/logger.js";

export const UNDEFINED = Symbol("undefined");

function sortChildren(a, b) {
    if (a.render._zIndex === b.render._zIndex) {
        return a._lastSortedIndex - b._lastSortedIndex;
    }

    return a.render._zIndex - b.render._zIndex;
}

export class Layer extends PIXI.Container {
    constructor(zIndex) {
        super();

        this.sortableChildren = true;
        this.zIndex = zIndex;
    }

    addChild(...children) {
        if (children.length > 1) {
            for (let i = 0; i < children.length; i++) {
                this.addChild(children[i]);
            }
        } else {
            const child = children[0];

            if (child.render.parent instanceof Layer) {
                child.render.parent.removeChild(child);
            }

            const render = function (renderer) { };

            render.parent = this;
            render.render = child.hasOwnProperty("render") ? child.render : UNDEFINED;

            child.render = render;
            child.render.onRemove = () => child.render.parent.removeChild(child);
            child.on("removed", child.render.onRemove);

            this.sortDirty = true;

            this.children.push(child);

            this._boundsID++;

            this.onChildrenChange(this.children.length - 1);
            this.emit("childAdded", child, this, this.children.length - 1);
        }

        return children[0];
    }

    addChildAt(child, index) {
        if (index < 0 || index > this.children.length) {
            throw new Error(`${child}addChildAt: The index ${index} supplied is out of bounds ${this.children.length}`);
        }

        if (child.render.parent instanceof Layer) {
            child.render.parent.removeChild(child);
        }

        const render = function (renderer) { };

        render.parent = this;
        render.render = child.hasOwnProperty("render") ? child.render : UNDEFINED;

        child.render = render;
        child.render.onRemove = () => child.render.parent.removeChild(child);
        child.on("removed", child.render.onRemove);

        this.sortDirty = true;

        this.children.splice(index, 0, child);

        this.onChildrenChange(index);
        this.emit("childAdded", child, this, index);

        return child;
    }

    removeChild(...children) {
        if (children.length > 1) {
            for (let i = 0; i < children.length; i++) {
                this.removeChild(children[i]);
            }
        } else {
            const child = children[0];
            const index = this.children.indexOf(child);

            if (index === -1) return null;

            child.off("removed", child.render.onRemove);

            if (child.render.render !== UNDEFINED) {
                child.render = child.render.render;
            } else {
                delete child.render;
            }

            PIXI.utils.removeItems(this.children, index, 1);

            this._boundsID++;

            this.onChildrenChange(index);
            this.emit("childRemoved", child, this, index);
        }

        return children[0];
    }

    removeChildAt(index) {
        const child = this.getChildAt(index);

        child.off("removed", child.render.onRemove);

        if (child.render.render !== UNDEFINED) {
            child.render = child.render.render;
        } else {
            delete child.render;
        }

        PIXI.utils.removeItems(this.children, index, 1);

        this._boundsID++;

        this.onChildrenChange(index);
        this.emit("childRemoved", child, this, index);

        return child;
    }

    removeChildren(beginIndex = 0, endIndex = this.children.length) {
        const begin = beginIndex;
        const end = endIndex;
        const range = end - begin;
        let removed;

        if (range > 0 && range <= end) {
            removed = this.children.splice(begin, range);

            for (let i = 0; i < removed.length; ++i) {
                const child = removed[i];

                child.off("removed", child.render.onRemove);

                if (child.render.render !== UNDEFINED) {
                    child.render = child.render.render;
                } else {
                    delete child.render;
                }
            }

            this._boundsID++;

            this.onChildrenChange(beginIndex);

            for (let i = 0; i < removed.length; ++i) {
                this.emit("childRemoved", removed[i], this, i);
            }

            return removed;
        } else if (range === 0 && this.children.length === 0) {
            return [];
        }

        throw new RangeError("removeChildren: numeric values are outside the acceptable range.");
    }

    sortChildren() {
        let sortRequired = false;

        for (let i = 0, j = this.children.length; i < j; ++i) {
            const child = this.children[i];

            child._lastSortedIndex = i;

            if (!sortRequired && child.render._zIndex !== 0) {
                sortRequired = true;
            }
        }

        if (sortRequired && this.children.length > 1) {
            this.children.sort(sortChildren);
        }

        this.sortDirty = false;
    }

    updateTransform() {
        if (this.sortableChildren) {
            for (let i = 0, j = this.children.length; i < j; ++i) {
                const child = this.children[i];
                const zIndex = child.render.zIndex ? child.render.zIndex.call(child) : child.zIndex;

                if (child.render._zIndex !== zIndex) {
                    child.render._zIndex = zIndex;
                    this.sortDirty = true;
                }
            }

            if (this.sortDirty) {
                this.sortChildren();
            }
        }

        this._boundsID++;

        this.transform.updateTransform(this.parent.transform);

        this.worldAlpha = this.alpha * this.parent.worldAlpha;
    }

    render(renderer) {
        if (!this.visible || this.worldAlpha <= 0 || !this.renderable) {
            return;
        }

        if (this._mask || (this.filters && this.filters.length)) {
            this.renderAdvanced(renderer);
        } else {
            this._render(renderer);

            for (let i = 0, j = this.children.length; i < j; ++i) {
                const child = this.children[i];
                let item = child;
                let renderable = true;

                do {
                    if (!item.visible || !item.renderable) {
                        renderable = false;
                        break;
                    }

                    item = item.parent;
                } while (item);

                if (renderable) {
                    let render = child.render.render;

                    if (render === UNDEFINED) {
                        render = Object.getPrototypeOf(child).render;
                    }

                    render.call(child, renderer);
                }
            }
        }
    }

    renderAdvanced(renderer) {
        renderer.batch.flush();

        const filters = this.filters;
        const mask = this._mask;

        if (filters) {
            if (!this._enabledFilters) {
                this._enabledFilters = [];
            }

            this._enabledFilters.length = 0;

            for (let i = 0; i < filters.length; i++) {
                if (filters[i].enabled) {
                    this._enabledFilters.push(filters[i]);
                }
            }

            if (this._enabledFilters.length) {
                renderer.filter.push(this, this._enabledFilters);
            }
        }

        if (mask) {
            renderer.mask.push(this, this._mask);
        }

        this._render(renderer);

        for (let i = 0, j = this.children.length; i < j; ++i) {
            const child = this.children[i];
            let item = child;
            let renderable = true;

            do {
                if (!item.visible || !item.renderable) {
                    renderable = false;
                    break;
                }

                item = item.parent;
            } while (item);

            if (renderable) {
                let render = child.render.render;

                if (render === UNDEFINED) {
                    render = Object.getPrototypeOf(child).render;
                }

                render.call(child, renderer);
            }
        }

        renderer.batch.flush();

        if (mask) {
            renderer.mask.pop(this);
        }

        if (filters && this._enabledFilters && this._enabledFilters.length) {
            renderer.filter.pop();
        }
    }

    destroy(options) {
        super.destroy();

        this.sortDirty = false;

        this.removeChildren(0, this.children.length);
    }
}

export class Board extends PIXI.Container {
    static debug = false;
    static boards = new Map();
    static pieces = new Map();
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

    static has(name) {
        if (typeof name !== "string") {
            name = piece._pv_name;
        }

        return this.pieces.has(name);
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

    static _onChildAdded(piece, layer) {
        const name = piece._pv_name ?? Symbol();
        const board = layer.parent;

        if (this.debug) {
            Logger.debug("Placing %s on the %s board at %d", name, board.name, layer.zIndex);
        }

        this.pieces.set(name, piece);
    }

    static _onChildRemoved(piece, layer) {
        const name = piece._pv_name ?? Symbol();
        const board = layer.parent;

        if (this.debug) {
            Logger.warn("Unplacing %s from the %s board", name, board.name);
        }

        this.pieces.delete(name);
    }

    static defaultOptions() {
        return {
            zIndex: 0
        };
    }

    constructor(options) {
        options = Object.assign(Board.defaultOptions(), options);

        super();

        this.zIndex = options.zIndex;
        this.sortableChildren = true;
    }

    has(name) {
        let piece;

        if (typeof name !== "string") {
            piece = name;
        } else {
            piece = Board.pieces.get(name);
        }

        return piece?.render.parent === this;
    }

    place(name, piece, layer, zIndex) {
        Board.unplace(name);

        if (!piece) {
            return;
        }

        Board.unplace(piece);

        piece._pv_name = name;

        let layerIndex = layer;

        if (typeof layerIndex === "string") {
            const [, name, offset] = layerIndex.match(/^([A-Z]+)([+-]\d+)?$/i);

            layerIndex = Board.layers[name] + parseInt(offset ?? 0, 10);
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
            layer.on("childAdded", Board._onChildAdded, Board);
            layer.on("childRemoved", Board._onChildRemoved, Board);

            this.addChild(layer);
        }

        layer.addChild(piece);

        if (zIndex !== undefined) {
            if (typeof zIndex === "function") {
                piece.render.zIndex = zIndex;
            } else {
                piece.render.zIndex = () => zIndex;
            }
        }
    }

    static unplace(name) {
        if (!name) {
            return;
        }

        if (name instanceof RegExp) {
            for (const piece of this.pieces.keys()) {
                if (name.test(piece)) {
                    this.unplace(piece);
                }
            }

            return;
        }

        let piece;

        if (typeof name !== "string") {
            piece = name;
            name = piece._pv_name;
        } else {
            piece = this.pieces.get(name);
        }

        if (!piece) {
            return;
        }

        if (piece.render.parent instanceof Layer) {
            piece.render.parent.removeChild(piece);
        }
    }

    clear() {
        if (Board.debug) {
            Logger.debug("Clearing %s board", this.name);
        }

        for (let i = 0; i < this.children.length; i++) {
            this.children[i].removeChildren();
        }
    }
}

Hooks.on("canvasInit", () => {
    Board.initialize();
});
