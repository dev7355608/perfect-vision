import { Board } from "../../core/board.js";

Hooks.once("init", () => {
    if (!game.modules.get("world-explorer")?.active) {
        return;
    }

    Hooks.on("canvasReady", () => {
        Board.place("worldExplorer", canvas.worldExplorer, Board.LAYERS.BACKGROUND, 10);
    });
});
