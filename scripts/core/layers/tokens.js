import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("TokenLayer.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: SightLayer.layerOptions.zIndex + 100
        });
    });

    patch("Token.prototype.draw", "POST", async function (result) {
        await result;

        Board.place(`Token#${this.id}.icon`, this.id && !this._original ? this.icon : null, Board.LAYERS.TOKENS, function () { return this.parent.zIndex; });

        return this;
    });

    patch("Token.prototype.refresh", "PRE", function () {
        if (this._hover) {
            Board.unplace(`Token#${this.id}.border`);
        } else {
            Board.place(`Token#${this.id}.border`, this.id && !this._original ? this.border : null, Board.LAYERS.TOKEN_BORDERS, function () { return this.parent.zIndex; });
        }

        return arguments;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.icon`);

        return arguments;
    });
});
