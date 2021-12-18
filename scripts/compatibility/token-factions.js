import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-factions")?.active) {
        return;
    }

    Object.defineProperty(Token.prototype, "factions", {
        get() {
            return this._pv_factions_;
        },
        set(value) {
            if (value) {
                this._pv_factions = this._pv_factions ?? canvas._pv_highlights_underfoot.bases.addChild(new ObjectHUD(this));
                this._pv_factions.removeChildren();
                this._pv_factions.addChild(value);
            } else {
                if (this._pv_factions && !this._pv_factions.destroyed) {
                    this._pv_factions.destroy();
                }

                this._pv_factions = null;
            }

            this._pv_factions_ = value;
        }
    });

    patch("Token.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_factions && !this._pv_factions.destroyed) {
            this._pv_factions.destroy();
        }

        this._pv_factions = null;

        wrapped(options);
    });
});
