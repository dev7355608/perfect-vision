import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("Next-Up")?.active) {
        return;
    }

    let counter = 1;

    patch("BackgroundLayer.prototype.addChild", "POST", function (result, ...objects) {
        setTimeout(() => {
            for (const object of objects) {
                if (object.parent === this && object.isShadow) {
                    Board.place(`background.next-up#${counter++}`, object, Board.LAYERS.UNDERFOOT_EFFECTS, -1);
                }
            }
        }, 0);

        return result;
    });

    patch("BackgroundLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace(/^background\.next-up#\d+$/);

        return await wrapped(...args);
    });

    patch("Token.prototype.addChild", "POST", function (result, ...objects) {
        setTimeout(() => {
            for (const object of objects) {
                if (object.parent === this && object.NUMaker && game.settings.get("Next-Up", "iconLevel") === false) {
                    Board.place(`Token#${this.id}.next-up#${counter++}`, object, Board.LAYERS.TOKEN_MARKERS, 2);
                }
            }
        }, 0);

        return result;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(new RegExp(`^Token#${this.id}\\.next-up#\\d+$`));

        return arguments;
    });
});
