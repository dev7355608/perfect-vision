import { Board } from "../board.js";

Hooks.once("init", () => {
    Board.create("primary", { zIndex: 0 });
});

