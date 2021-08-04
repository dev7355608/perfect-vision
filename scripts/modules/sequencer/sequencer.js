import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("sequencer")?.active) {
        return;
    }

    patch("BackgroundLayer.prototype.addChild", "POST", function (result, ...objects) {
        const board = Board.get("primary");

        for (const object of objects) {
            if (object.parentName === "sequencer") {
                board.place("sequencer.background", object, "background+10");
            }
        }

        return result;
    });

    patch("BackgroundLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("sequencer.background");

        return await wrapped(...args);
    });
});
