import { MaskData } from "../../core/mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-auras")?.active) {
        return;
    }

    patch("Token.prototype.drawAuras", "POST", function () {
        if (!this._original) {
            this.auras.mask = new MaskData("background");
            this.auras.mask.multisample = null;
        }

        return this;
    });
});
