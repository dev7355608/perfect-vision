import { Board } from "../board.js";
import { Mask } from "../mask.js";
import { RenderTargetData } from "../../display/render-target.js";

Hooks.once("init", () => {
    const mask = Mask.create("foreground", {
        format: PIXI.FORMATS.RGBA,
        type: PIXI.TYPES.UNSIGNED_BYTE
    });

    const renderTargetData = new RenderTargetData(new PIXI.Sprite(mask.texture));

    mask.on("updateTexture", (mask) => {
        mask.resize();
    });

    Hooks.on("canvasInit", () => {
        const segment = Board.getSegment(Board.SEGMENTS.FOREGROUND);

        segment.renderTarget = renderTargetData;
    });
});

