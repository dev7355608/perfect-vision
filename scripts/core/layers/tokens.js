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

        Board.place(`Token[${this.id}].icon`, !this._original ? this.icon : null, "tokens");

        return this;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token[${this.id}].icon`);

        return arguments;
    });
});
