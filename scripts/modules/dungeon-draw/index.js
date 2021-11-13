import { Board } from "../../core/board.js";

Hooks.once("init", () => {
    if (!game.modules.get("dungeon-draw")?.active) {
        return;
    }

    Hooks.on("canvasReady", () => {
        Board.place("dungeon-draw", canvas.dungeon, Board.LAYERS.BACKGROUND, canvas.dungeon.options.zIndex < 0 ? -1 : +1);
    });
});
