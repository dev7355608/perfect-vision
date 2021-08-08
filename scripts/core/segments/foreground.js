import { Board } from "../board.js";
import { Mask } from "../mask.js";

Hooks.on("canvasInit", () => {
    const segment = Board.getSegment(Board.SEGMENTS.FOREGROUND);

    segment.renderTexture = Mask.getTexture("foreground");
});
