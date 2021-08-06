import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-auras")?.active) {
        return;
    }

    patch("Token.prototype.drawAuras", "POST", function () {
        Board.get("highlight").place(`Token#${this.id}.auras`, this.id && !this._original ? this.auras : null, "tokens-3");

        return this;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.auras`);

        return arguments;
    });
});
