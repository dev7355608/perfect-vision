import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-auras")?.active) {
        return;
    }

    Object.defineProperty(Token.prototype, "auras", {
        get() {
            return this._pv_auras_;
        },
        set(value) {
            if (value) {
                this._pv_auras = this._pv_auras ?? canvas._pv_highlights_underfoot.auras.addChild(new ObjectHUD(this));
                this._pv_auras.removeChildren();
                this._pv_auras.addChild(value);
            } else {
                if (this._pv_auras && !this._pv_auras.destroyed) {
                    this._pv_auras.destroy();
                }

                this._pv_auras = null;
            }

            this._pv_auras_ = value;
        }
    });

    patch("Token.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_auras && !this._pv_auras.destroyed) {
            this._pv_auras.destroy();
        }

        this._pv_auras = null;

        wrapped(options);
    });
});
