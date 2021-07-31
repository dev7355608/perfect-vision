import { Mask, MaskFilter } from "../../core/mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-auras")?.active) {
        return;
    }

    patch("Token.prototype.drawAuras", "POST", function () {
        if (!this._original) {
            this.auras.mask = new PIXI.MaskData(new PIXI.Sprite(Mask.getTexture("background")));
            this.auras.mask.filter = new MaskFilter();
            this.auras.mask.resolution = null;
            this.auras.mask.multisample = null;
        }

        return this;
    });
});
