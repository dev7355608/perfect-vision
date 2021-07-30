import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.MaskData.prototype.resolution");

Object.defineProperty(PIXI.MaskData.prototype, "resolution", {
    get() {
        return this._resolution !== undefined ? this._resolution : null;
    },
    set(value) {
        this._resolution = value ?? null;
    }
});

Logger.debug("Patching PIXI.MaskData.prototype.multisample");

Object.defineProperty(PIXI.MaskData.prototype, "multisample", {
    get() {
        return this._multisample !== undefined ? this._multisample : PIXI.MSAA_QUALITY.NONE;
    },
    set(value) {
        this._multisample = value ?? null;
    }
});

Logger.debug("Patching PIXI.MaskData.prototype.enabled");

Object.defineProperty(PIXI.MaskData.prototype, "enabled", {
    get() {
        return this._enabled !== undefined ? this._enabled : true;
    },
    set(value) {
        this._enabled = value ?? false;
    }
});

Logger.debug("Patching PIXI.MaskData.prototype.filter");

Object.defineProperty(PIXI.MaskData.prototype, "filter", {
    get() {
        return this._filters ? this._filters[0] : null;
    },
    set(value) {
        if (value) {
            if (this._filters) {
                this._filters[0] = value;
            }
            else {
                this._filters = [value];
            }
        } else {
            this._filters = null;
        }
    }
});

