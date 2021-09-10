import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.Mesh.prototype.geometry (OVERRIDE)");

Object.defineProperty(PIXI.Mesh.prototype, "geometry", {
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

        if ("_geometry" in this && value) {
            value.refCount++;
        }

        this._geometry = value;

        this.vertexDirty = -1;
    }
});
