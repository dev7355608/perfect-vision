import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-auras")?.active) {
        return;
    }

    patch("Token.prototype.drawAuras", "POST", function () {
        if (this.id && !this._original) {
            Board.place(`Token#${this.id}.auras`, this.auras, Board.LAYERS.TOKEN_AURAS, Board.Z_INDICES.PARENT);
        }

        return this;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.auras`);

        return arguments;
    });
});
