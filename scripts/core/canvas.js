import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    patch("Canvas.prototype.createBlurFilter", "POST", function (filter) {
        filter.resolution = canvas.app.renderer.resolution;

        return new Proxy(filter, {
            get: function (target, prop, receiver) {
                if (prop === "enabled" && canvas.blurDistance === 0) {
                    return false;
                }

                return Reflect.get(...arguments);
            }
        });
    });

    patch("Canvas.prototype.updateBlur", "OVERRIDE", function (scale) {
        scale = scale || this.stage.scale.x;

        if (this.blurDistance === 0) {
            return;
        }

        this.blurDistance = Math.round(Math.abs(scale) * CONFIG.Canvas.blurStrength);

        for (const filter of this.blurFilters) {
            filter.blur = this.blurDistance;
        }
    });
});
