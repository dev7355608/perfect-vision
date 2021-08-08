import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("GridLayer.prototype.draw", "POST", async function (result) {
        await result;

        Board.place("grid", this, Board.LAYERS.GRID, 0);

        return this;
    });

    patch("GridLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("grid");

        return await wrapped(...args);
    });
});
