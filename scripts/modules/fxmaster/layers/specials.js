import { Board } from "../../../core/board.js";
import { patch } from "../../../utils/patch.js";

Hooks.once("setup", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    let counter = 1;

    patch("Canvas.layers.specials.prototype.addChild", "POST", function (result, ...objects) {
        for (const object of objects) {
            if (object instanceof PIXI.Sprite) {
                Board.place(`specials.sprite#${counter++}`, object, Board.LAYERS.OVERHEAD_EFFECTS);
            }
        }

        return result;
    });
});
