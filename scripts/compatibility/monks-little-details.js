import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("monks-little-details")?.active) {
        return;
    }

    patch("Token.prototype.addChildAt", "MIXED", function (wrapped, object, index) {
        if (object === this.ldmarker) {
            if (!this._pv_ldmarker) {
                this._pv_ldmarker = new ObjectHUD(this);
            } else {
                this._pv_ldmarker.removeChildren();
            }

            canvas._pv_highlights_underfoot.markers.turn.addChild(this._pv_ldmarker);

            this._pv_ldmarker.addChild(object);

            return object;
        }

        return wrapped(object, index);
    });

    patch("Token.prototype.removeChild", "MIXED", function (wrapped, ...objects) {
        if (objects[0] === this.ldmarker && this.ldmarker?.parent === this._pv_ldmarker) {
            if (this._pv_ldmarker && !this._pv_ldmarker.destroyed) {
                this._pv_ldmarker.destroy();
            }

            this._pv_ldmarker = null;

            if (objects.length > 1) {
                wrapped(...objects.slice(1));
            }

            return objects[0];
        }

        return wrapped(...objects);
    });

    patch("Token.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_ldmarker && !this._pv_ldmarker.destroyed) {
            this._pv_ldmarker.destroy();
        }

        this._pv_ldmarker = null;

        wrapped(options);
    });
});
