import { Board } from "../board.js";
import { Mask } from "../mask.js";

Hooks.once("init", () => {
    const mask = Mask.create("foreground", {
        format: PIXI.FORMATS.RGBA,
        type: PIXI.TYPES.UNSIGNED_BYTE
    });

    mask.on("updateTexture", (mask) => {
        mask.resize();
    });

    Hooks.on("canvasInit", () => {
        const segment = Board.getSegment(Board.SEGMENTS.FOREGROUND);

        segment.renderTexture = mask.texture;
    });
});

