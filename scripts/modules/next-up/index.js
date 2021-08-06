import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("Next-Up")?.active) {
        return;
    }

    let counter = 1;

    patch("BackgroundLayer.prototype.addChild", "POST", function (result, ...objects) {
        setTimeout(() => {
            const board = Board.get("highlight");

            for (const object of objects) {
                if (object.parent === this && object.isShadow) {
                    board.place(`background.next-up#${counter++}`, object, "background+2");
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
            const board = Board.get("highlight");

            for (const object of objects) {
                if (object.parent === this && object.NUMaker) {
                    board.place(`Token#${this.id}.next-up#${counter++}`, object, "tokens-2");
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
