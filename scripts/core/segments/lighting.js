import { Board } from "../board.js";

Hooks.on("canvasInit", () => {
    const segment = Board.getSegment(Board.SEGMENTS.LIGHTING);

    segment.filterArea = canvas.app.renderer.screen;
});
