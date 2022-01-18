import { patch } from "../utils/patch.js";
import { Region } from "../utils/region.js";

const updateAreaKeys = ["t", "x", "y", "direction", "angle", "distance", "width"];

Hooks.once("init", () => {
    patch("MeasuredTemplate.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        await wrapped(...args);

        if (!this._original) {
            let sightLimit = this.document.getFlag("perfect-vision", "sightLimit");

            if (sightLimit !== undefined) {
                sightLimit = Math.max(sightLimit ?? Infinity, 0) / canvas.dimensions.distance * canvas.dimensions.size;
            }

            this._pv_sightLimit = sightLimit;

            if (sightLimit !== undefined) {
                canvas._pv_limits.addRegion(`Template.${this.document.id}`, {
                    region: Region.from(this.shape, new PIXI.Matrix().translate(this.data.x, this.data.y)),
                    limit: this._pv_sightLimit,
                    mode: "min",
                    index: [2]
                });

                canvas.lighting._pv_initializeVision = true;
                canvas.perception.schedule({ lighting: { refresh: true } });
            }
        }

        return this;
    });

    patch("MeasuredTemplate.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_sightLimit !== undefined) {
            this._pv_sightLimit = undefined;

            if (canvas._pv_limits.deleteRegion(`Template.${this.document.id}`)) {
                canvas.lighting._pv_initializeVision = true;
                canvas.perception.schedule({ lighting: { refresh: true } });
            }
        }

        wrapped(options);
    });
});

Hooks.on("updateMeasuredTemplate", (document, change, options, userId, arg) => {
    const scene = document.parent;

    if (!scene?.isView) {
        return;
    }

    const template = document.object;

    if (template) {
        let updateArea = false;
        let sightLimit = document.getFlag("perfect-vision", "sightLimit");

        if (sightLimit !== undefined) {
            sightLimit = Math.max(sightLimit ?? Infinity, 0) / canvas.dimensions.distance * canvas.dimensions.size;
        }

        if (template._pv_sightLimit !== sightLimit) {
            template._pv_sightLimit = sightLimit;

            updateArea = true;
        }

        if (!updateArea && sightLimit !== undefined) {
            updateArea = updateAreaKeys.some(k => k in change);
        }

        if (updateArea) {
            if (sightLimit !== undefined) {
                canvas._pv_limits.addRegion(`Template.${document.id}`, {
                    region: Region.from(template.shape, new PIXI.Matrix().translate(template.data.x, template.data.y)),
                    limit: template._pv_sightLimit,
                    mode: "min",
                    index: [2]
                });
            } else {
                canvas._pv_limits.deleteRegion(`Template.${document.id}`);
            }

            canvas.lighting._pv_initializeVision = true;
            canvas.perception.schedule({ lighting: { refresh: true } });
        }
    }
});
