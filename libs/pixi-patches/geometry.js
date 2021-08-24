import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.Geometry.prototype.geometry (OVERRIDE)");

Object.defineProperty(PIXI.Geometry.prototype, "geometry", {
    get() {
        return this._geometry;
    },
    set(value) {
        if (this._geometry === value) {
            return;
        }

        if (this._geometry) {
            this._geometry.refCount--;

            if (this._geometry.refCount === 0) {
                this._geometry.dispose();
            }
        }

        this._geometry = value;

        if (this._geometry) {
            this._geometry.refCount++;
        }

        this.vertexDirty = -1;
    }
});
