import { patch } from "../utils/patch.js";
import { Region } from "../utils/region.js";
import { LimitSystem } from "./limit-system.js";

Hooks.once("init", () => {
    patch("MeasuredTemplate.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (this.destroyed || !this.id) {
            return this;
        }

        // TODO: move to updateMeasuredTemplate
        this._pv_updateSightLimit();

        return this;
    });

    patch("MeasuredTemplate.prototype.destroy", "WRAPPER", function (wrapped, ...args) {
        if (this.id) {
            this._pv_updateSightLimit({ deleted: true });
        }

        wrapped(...args);
    });
});

MeasuredTemplate.prototype._pv_updateSightLimit = function ({ defer = false, deleted = false } = {}) {
    let sightLimit;

    if (!deleted && (sightLimit = this.document.getFlag("perfect-vision", "sightLimit")) !== undefined) {
        sightLimit = Math.max(sightLimit ?? Infinity, 0) * (canvas.dimensions.size / canvas.dimensions.distance);

        LimitSystem.instance.addRegion(`Template.${this.document.id}`, {
            shape: Region.from(this.shape, new PIXI.Matrix().translate(this.data.x, this.data.y)),
            limit: sightLimit,
            mode: "min",
            index: [2]
        });

        if (!defer) {
            canvas.perception.schedule({ lighting: { refresh: true } });
        }
    } else {
        if (LimitSystem.instance.deleteRegion(`Template.${this.document.id}`)) {
            if (!defer) {
                canvas.perception.schedule({ lighting: { refresh: true } });
            }
        }
    }
};
