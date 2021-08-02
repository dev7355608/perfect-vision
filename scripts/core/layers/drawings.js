import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("DrawingsLayer.prototype.draw", "POST", async function (result) {
        await result;

        Board.get("highlight").place("drawings", this, "background+1");

        return this;
    });

    patch("DrawingsLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("drawings");

        return await wrapped(...args);
    });
});
