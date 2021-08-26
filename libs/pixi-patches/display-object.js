import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.DisplayObject.prototype.mask (OVERRIDE)");

Object.defineProperty(PIXI.DisplayObject.prototype, "mask", {
    get() {
        return this._mask;
    },
    set(value) {
        if (this._mask === value) {
            return;
        }

        if (this._mask) {
            const maskObject = this._mask.maskObject || this._mask;

            maskObject._maskRefCount--;

            if (maskObject._maskRefCount === 0) {
                maskObject.renderable = true;
                maskObject.isMask = false;
            }
        }

        this._mask = value;

        if (this._mask) {
            const maskObject = this._mask.maskObject || this._mask;

            if (maskObject._maskRefCount === undefined) {
                maskObject._maskRefCount = 0;
            }

            if (maskObject._maskRefCount === 0) {
                maskObject.renderable = false;
                maskObject.isMask = true;
            }

            maskObject._maskRefCount++;
        }
    }
});

Logger.debug("Patching PIXI.DisplayObject.prototype.destroyed");

Object.defineProperty(PIXI.DisplayObject.prototype, "destroyed", {
    get() {
        return this._destroyed;
    }
});

Logger.debug("Patching PIXI.DisplayObject.prototype.destroy (OVERRIDE)");

PIXI.DisplayObject.prototype.destroy = function (_options) {
    if (this.parent) {
        this.parent.removeChild(this);
    }

    this.emit('destroyed');
    this.removeAllListeners();
    this.transform = null;

    this.parent = null;
    this._bounds = null;
    this.mask = null;

    this.filters = null;
    this.filterArea = null;
    this.hitArea = null;

    this.interactive = false;
    this.interactiveChildren = false;

    this._destroyed = true;
};
