import { patch } from "../utils/patch.js";
import { TransformedShape } from "../utils/transformed-shape.js";

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
                const fov = new TransformedShape(this.shape, new PIXI.Matrix().translate(this.data.x, this.data.y));

                canvas._pv_raySystem.addArea(`Template.${this.document.id}`, fov, undefined, this._pv_sightLimit, 1, 2);

                canvas.lighting._pv_initializeVision = true;
                canvas.perception.schedule({ lighting: { refresh: true } });
            }
        }

        return this;
    });

    patch("MeasuredTemplate.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_sightLimit !== undefined) {
            this._pv_sightLimit = undefined;

            if (canvas._pv_raySystem.deleteArea(`Template.${this.document.id}`)) {
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
                const fov = new TransformedShape(template.shape, new PIXI.Matrix().translate(template.data.x, template.data.y));

                canvas._pv_raySystem.addArea(`Template.${document.id}`, fov, undefined, template._pv_sightLimit, 1, 2);
            } else {
                canvas._pv_raySystem.deleteArea(`Template.${document.id}`);
            }

            canvas.lighting._pv_initializeVision = true;
            canvas.perception.schedule({ lighting: { refresh: true } });
        }
    }
});
