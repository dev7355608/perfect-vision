import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-auras")?.active) {
        return;
    }

    patch("Token.prototype.drawAuras", "POST", function () {
        Board.place(`Token#${this.id}.auras`, this.id && !this._original ? this.auras : null, Board.LAYERS.TOKEN_AURAS, function () { return this.parent.zIndex; });

        return this;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.auras`);

        return arguments;
    });
});
