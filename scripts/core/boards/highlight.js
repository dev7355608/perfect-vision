import { Board } from "../board.js";
import { MaskData } from "../mask.js";

Hooks.once("init", () => {
    Board.create("highlight", { zIndex: Number.MIN_SAFE_INTEGER + 1 });
});

Hooks.on("canvasInit", () => {
    const board = Board.get("highlight");

    board.mask = new MaskData("background");
    board.mask.multisample = PIXI.MSAA_QUALITY.HIGH;
});
