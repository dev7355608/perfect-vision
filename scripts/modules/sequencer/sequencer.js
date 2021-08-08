import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("sequencer")?.active) {
        return;
    }

    patch("BackgroundLayer.prototype.addChild", "POST", function (result, ...objects) {
        for (const object of objects) {
            if (object.parentName === "sequencer") {
                Board.place("sequencer.background", object, Board.LAYERS.BACKGROUND + 10, 1);
            }
        }

        return result;
    });

    patch("BackgroundLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("sequencer.background");

        return await wrapped(...args);
    });
});
