import { Logger } from "../utils/logger.js";

export class RenderFunction {
    static _key = Symbol();

    static create() {
        function render(renderer, skip = true) {
            if (!skip) {
                this.render = Object.hasOwnProperty(render, "function") ? render.function : Object.getPrototypeOf(this).render;
                this.render(renderer);
                this.render = render;
            }
        }

        render.id = null;
        render.update = null;
        render.destroy = this._destroy;
        render._object = null;
        render._layer = null;
        render._zIndex = 0;
        render._lastSortedIndex = 0;
        render._key = this._key;

        Object.defineProperty(render, "object", {
            get: this._getObject,
            set: this._setObject,
            configurable: false
        });

        Object.defineProperty(render, "layer", {
            get: this._getLayer,
            set: this._setLayer,
            configurable: false
        });

        Object.defineProperty(render, "zIndex", {
            get: this._getZIndex,
            set: this._setZIndex,
            configurable: false
        });

        return render;
    }

    static get(object) {
        const render = object.render;

        if (this.check(render)) {
            return render;
        }
    }

    static getOrCreate(object) {
        const render = object.render;

        if (this.check(render)) {
            return render;
        }

        return this.create();
    }

    static check(render) {
        return render !== undefined && render._key === this._key;
    }

    static _getObject() {
        return this._object;
    }

    static _setObject(value) {
        if (this._object !== value) {
            if (this._object) {
                if (this._layer) {
                    this._layer.removeChild(this._object);
                }

                this._object.off("removed", this.destroy, this);

                if (Object.hasOwnProperty(this, "function")) {
                    Object.defineProperty(this._object, "render", {
                        value: this.function,
                        configurable: true,
                        writable: true
                    });

                    delete this.function;
                } else {
                    delete this._object.render;
                }

                this._object = null;
            }

            this._object = value;

            if (this._object) {
                this._object.on("removed", this.destroy, this);

                if (this._object.hasOwnProperty("render")) {
                    this.function = this._object.render;
                }

                Object.defineProperty(this._object, "render", {
                    value: this,
                    configurable: true,
                    writable: true
                });

                if (this._layer) {
                    this._layer.addChild(this._object);
                }
            }
        }
    }

    static _setLayer() {
        return this._layer;
    }

    static _setLayer(value) {
        if (this._layer !== value) {
            if (this._layer && this._object) {
                this._layer.removeChild(this._object);
            }

            this._layer = value;

            if (this._layer && this._object) {
                this._layer.addChild(this._object);
            }
        }
    }

    static _getZIndex() {
        return this._zIndex;
    }

    static _setZIndex(value) {
        if (this._zIndex !== value) {
            this._zIndex = value;

            if (this._layer) {
                this._layer.sortDirty = true;
            }
        }
    }

    static _destroy() {
        this.object = null;
        this.layer = null;
    }
}

function sortChildren(a, b) {
    a = a.render;
    b = b.render;

    if (a.zIndex === b.zIndex) {
        return a._lastSortedIndex - b._lastSortedIndex;
    }

    return a.zIndex - b.zIndex;
}

export class Layer extends PIXI.Container {
    constructor(zIndex) {
        super();

        this.sortableChildren = true;
        this.zIndex = zIndex;
        this.filters = [];
        this.filterArea = null;
    }

    addChild(...children) {
        if (children.length > 1) {
            for (let i = 0; i < children.length; i++) {
                this.addChild(children[i]);
            }
        } else {
            const child = children[0];

            if (child.render._layer) {
                child.render._layer.removeChild(child);
            }

            child.render._layer = this;

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
            throw new Error(`addChildAt: The index ${index} supplied is out of bounds ${this.children.length}`);
        }

        if (child.render._layer) {
            child.render._layer.removeChild(child);
        }

        child.render._layer = this;

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

            child.render._layer = null;

            PIXI.utils.removeItems(this.children, index, 1);

            this._boundsID++;

            this.onChildrenChange(index);
            this.emit("childRemoved", child, this, index);
        }

        return children[0];
    }

    removeChildAt(index) {
        const child = this.getChildAt(index);

        child.render._layer = null;

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
                removed[i].render._layer = null;
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

            child.render._lastSortedIndex = i;

            if (!sortRequired && child.render.zIndex !== 0) {
                sortRequired = true;
            }
        }

        if (sortRequired && this.children.length > 1) {
            this.children.sort(sortChildren);
        }

        this.sortDirty = false;
    }

    updateTransform() {
        for (let i = 0, j = this.children.length; i < j; ++i) {
            const child = this.children[i];

            if (child.render.update) {
                child.render.update();
            }
        }

        if (this.sortableChildren && this.sortDirty) {
            this.sortChildren();
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
                let skip = false;

                do {
                    if (!item.visible || !item.renderable) {
                        skip = true;
                        break;
                    }

                    item = item.parent;
                } while (item);

                child.render(renderer, skip);
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
            let skip = false;

            do {
                if (!item.visible || !item.renderable) {
                    skip = true;
                    break;
                }

                item = item.parent;
            } while (item);

            child.render(renderer, skip);
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

    _clear() {
        this.visible = true;
        this.renderable = true;
        this.alpha = 1;
        this.mask = null;
        this.filters = [];
        this.filterArea = null;
        this.sortableChildren = true;
        this.removeChildren().forEach(object => object.render.destroy());
    }
}

export class Segment extends PIXI.Container {
    constructor(bottomIndex, topIndex) {
        super();

        this.zIndex = bottomIndex;
        this.sortableChildren = true;
        this.bottomIndex = bottomIndex;
        this.topIndex = topIndex;
        this.sprite = null;
        this.filters = [];
        this.filterArea = null;
        this._backupCurrent = null;
        this._backupSourceFrame = new PIXI.Rectangle();
        this._backupDestinationFrame = new PIXI.Rectangle();
    }

    get renderTexture() {
        return this.sprite?.texture ?? null;
    }

    set renderTexture(value) {
        if (this.sprite?.texture !== value) {
            if (this.sprite) {
                this.sprite.destroy();
                this.sprite = null;
            }

            if (value) {
                this.sprite = new PIXI.Sprite(value);
                this.sprite.visible = false;
                this.addChild(this.sprite);
            }
        }
    }

    _clear() {
        this.visible = true;
        this.renderable = true;
        this.alpha = 1;
        this.mask = null;
        this.filters = [];
        this.filterArea = null;
        this.sortableChildren = true;

        for (const child of this.children) {
            if (child !== this.sprite) {
                child._clear();
            }
        }
    }

    _insertSegment(bottomIndex, topIndex) {
        const children = [];

        for (const child of this.children) {
            if (child instanceof Segment) {
                if (child.bottomIndex <= bottomIndex && topIndex <= child.topIndex) {
                    return child._insertSegment(bottomIndex, topIndex);
                }

                if (bottomIndex <= child.bottomIndex && child.topIndex <= topIndex) {
                    children.push(child);
                } else if (!(topIndex <= child.bottomIndex || child.topIndex <= bottomIndex)) {
                    throw new Error("Segments must not overlap!");
                }
            } else if (bottomIndex <= child.zIndex && child.zIndex <= topIndex) {
                children.push(child);
            }
        }

        const segment = new Segment(bottomIndex, topIndex);

        if (children.length !== 0) {
            segment.addChild(...children);
        }

        this.addChild(segment);

        return segment;
    }

    _insertLayer(index) {
        for (const child of this.children) {
            if (child instanceof Segment) {
                if (child.bottomIndex <= index && index <= child.topIndex) {
                    return child._insertLayer(index);
                }
            } else if (index === child.zIndex) {
                return child;
            }
        }

        const layer = new Layer(index);

        this.addChild(layer);

        return layer;
    }

    render(renderer) {
        if (this.sprite) {
            this._renderToTexture(renderer, this.sprite.texture);
            this.sprite.visible = true;
            this.sprite.render(renderer);
            this.sprite.visible = false;
        } else {
            super.render(renderer);
        }
    }

    _renderToTexture(renderer, texture) {
        const rt = renderer.renderTexture;
        const fs = renderer.filter.defaultFilterStack;

        this._backupCurrent = rt.current;
        this._backupSourceFrame.copyFrom(rt.sourceFrame);
        this._backupDestinationFrame.copyFrom(rt.destinationFrame);

        renderer.batch.flush();

        rt.bind(texture);
        rt.clear();

        if (fs.length > 1) {
            fs[fs.length - 1].renderTexture = texture;
        }

        super.render(renderer);

        renderer.batch.flush();
        renderer.framebuffer.blit();

        if (fs.length > 1) {
            fs[fs.length - 1].renderTexture = this._backupCurrent;
        }

        rt.bind(this._backupCurrent, this._backupSourceFrame, this._backupDestinationFrame);

        this._backupCurrent = null;
    }
}

export class Board extends PIXI.Container {
    static debug = false;
    static stage = new Segment(-Infinity, +Infinity);
    static segments = { ":": Board.stage };
    static layers = {};
    static objects = {};

    static SEGMENTS = {
        LIGHTING: [1000, 3999],
        BACKGROUND: [1000, 1999],
        FOREGROUND: [2000, 2999],
        HIGHLIGHTS: [4000, 4999],
    };
    static LAYERS = {
        BACKGROUND: 1100,
        UNDERFOOT_TILES: 1200,
        TEMPLATES: 1300,
        UNDERFOOT_EFFECTS: 1400,
        TOKENS: 2100,
        OVERHEAD_EFFECTS: 2200,
        FOREGROUND: 2300,
        OVERHEAD_TILES: 2400,
        WEATHER: 2500,
        LIGHTING: 3100,
        GRID: 4100,
        DRAWINGS: 4200,
        TOKEN_AURAS: 4300,
        TOKEN_BASES: 4400,
        TOKEN_MARKERS: 4500,
        TOKEN_BORDERS: 4600,
    };

    static getSegment([bottomIndex = -Infinity, topIndex = +Infinity] = []) {
        const key = `${Number.isFinite(bottomIndex) ? bottomIndex : ""}:${Number.isFinite(topIndex) ? topIndex : ""}`;
        let segment = this.segments[key];

        if (segment) {
            return segment;
        }

        segment = this.stage._insertSegment(bottomIndex, topIndex);

        this.segments[key] = segment;

        return segment;
    }

    static getLayer(index) {
        const key = `${index}`;
        let layer = this.layers[key];

        if (layer) {
            return layer;
        }

        layer = this.stage._insertLayer(index);
        layer.on("childAdded", this._onChildAdded, this);
        layer.on("childRemoved", this._onChildRemoved, this);

        this.layers[key] = layer;

        return layer;
    }

    static clear() {
        this.stage._clear();

        canvas.stage.addChild(this.stage);

        if (Board.debug) {
            Logger.debug("Board | Cleared");
        }
    }

    static has(object) {
        if (object instanceof PIXI.DisplayObject) {
            return RenderFunction.check(object.render);
        }

        const name = object;

        return !!this.objects[name];
    }

    static place(id, object, layerIndex, zIndex) {
        const layer = this.getLayer(layerIndex, true);

        if (!object) {
            this.unplace(id);

            return false;
        }

        const render = RenderFunction.getOrCreate(object);

        if (render.id && render.id !== id) {
            if (!this.unplace(id) && this.debug) {
                Logger.debug("Board | Renaming %s into %s", render.id, id);
            }

            delete this.objects[render.id];
            this.objects[id] = object;
        }

        render.id = id;
        render.object = object;
        render.layer = layer;

        if (zIndex !== undefined) {
            if (typeof zIndex === "function") {
                render.update = function () {
                    this.zIndex = zIndex.call(this.object);
                };
            } else {
                render.update = null;
                render.zIndex = zIndex;
            }
        } else {
            render.update = function () {
                this.zIndex = this.object.zIndex;
            };
        }
    }

    static unplace(object) {
        if (!object) {
            return false;
        }

        if (object instanceof RegExp) {
            const regexp = object;
            const unplaced = [];

            for (const [name, object] of Object.entries(this.objects)) {
                if (regexp.test(name)) {
                    object.render.destroy();
                    unplaced.push(object);
                }
            }

            return unplaced;
        }

        if (object instanceof PIXI.DisplayObject) {
            if (RenderFunction.check(object.render)) {
                return false;
            }
        } else {
            const id = object;

            object = this.objects[id];

            if (!object) {
                return false;
            }
        }

        object.render.destroy();

        return true;
    }

    static _onChildAdded(object, layer) {
        const id = object.render.id;

        if (this.debug) {
            Logger.debug("Board | Placing %s at %d", id, layer.zIndex);
        }

        this.objects[id] = object;
    }

    static _onChildRemoved(object, layer) {
        const id = object.render.id;

        if (this.debug) {
            Logger.debug("Board | Unplacing %s at %d", id, layer.zIndex);
        }

        delete this.objects[id];
    }
}

Hooks.on("canvasInit", () => {
    Board.clear();
});
