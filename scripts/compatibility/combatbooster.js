import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("combatbooster")?.active) {
        return;
    }

    patch("Token.prototype.addChild", "MIXED", function (wrapped, ...objects) {
        const object = objects[0];

        if (object?.name === "CBTurnMarker") {
            if (!this._pv_combatbooster) {
                this._pv_combatbooster = new ObjectHUD(this);
            } else {
                this._pv_combatbooster.removeChildren();
            }

            let markers;

            if (game.settings.get("combatbooster", "markerAbove")) {
                markers = canvas._pv_highlights_overhead.markers.turn;
            } else {
                markers = canvas._pv_highlights_underfoot.markers.turn;
            }

            markers.addChild(this._pv_combatbooster);

            this._pv_combatbooster.addChild(object);

            if (objects.length > 1) {
                wrapped(...objects.slice(1));
            }

            return object;
        }

        return wrapped(...objects);
    });

    patch("Token.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_combatbooster && !this._pv_combatbooster.destroyed) {
            this._pv_combatbooster.destroy();
        }

        this._pv_combatbooster = null;

        wrapped(options);
    });
});
