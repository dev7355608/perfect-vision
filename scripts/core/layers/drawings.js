import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("DrawingsLayer.prototype.draw", "POST", async function (result) {
        await result;

        Board.place("drawings", this, Board.LAYERS.DRAWINGS, 0);

        return this;
    });

    patch("DrawingsLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("drawings");

        return await wrapped(...args);
    });
});

Hooks.on("updateDrawing", (document, change, options, userId, arg) => {
    const scene = document.parent;

    if (!scene?.isView || !document.object._pv_active && !("flags" in change && ("perfect-vision" in change.flags || "-=perfect-vision" in change.flags) || "-=flags" in change)) {
        return;
    }

    canvas.perception.schedule({ lighting: { refresh: true } });
});

Hooks.on("preDeleteDrawing", (document, options, userId) => {
    const scene = document.parent;

    if (!scene?.isView || !document.object._pv_active) {
        return;
    }

    canvas.perception.schedule({ lighting: { refresh: true } });
});
