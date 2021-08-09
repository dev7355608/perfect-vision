import { Board } from "../board.js";
import { Mask } from "../mask.js";

Hooks.once("init", () => {
    const mask = Mask.create("foreground", {
        format: PIXI.FORMATS.RGBA,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        alphaMode: PIXI.ALPHA_MODES.PMA
    });

    mask.on("updateTexture", (mask) => {
        mask.resize();
    });

    Hooks.on("canvasInit", () => {
        const segment = Board.getSegment(Board.SEGMENTS.FOREGROUND);

        segment.renderTexture = Mask.getTexture("foreground");
    });
});

