import { Board } from "../board.js";
import { Mask } from "../mask.js";

Hooks.once("init", () => {
    Mask.create("background", {
        format: PIXI.FORMATS.RGBA,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        alphaMode: PIXI.ALPHA_MODES.PMA,
        lazy: (mask) => {
            mask.on("updateTexture", (mask) => {
                mask.resize();
            });

            Hooks.on("canvasInit", () => {
                const segment = Board.getSegment(Board.SEGMENTS.BACKGROUND);

                segment.renderTexture = mask.texture;
            });

            if (Board.stage.parent) {
                const segment = Board.getSegment(Board.SEGMENTS.BACKGROUND);

                segment.renderTexture = mask.texture;
            }
        }
    });
});

