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
                Board.place(`specials.sprite#${counter++}`, object, Board.LAYERS.OVERHEAD_EFFECTS, Board.Z_INDICES.THIS);
            }
        }

        return result;
    });

    patch("Canvas.layers.specials.prototype.tearDown", "POST", function (result, ...objects) {
        Board.unplace(/^specials\.sprite#\d+$/);

        return result;
    });
});
