import { Board } from "../board.js";

Hooks.once("init", () => {
    Board.create("primary", { zIndex: Number.MIN_SAFE_INTEGER });
});

