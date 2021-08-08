import { Board } from "../../core/board.js";

Hooks.once("init", () => {
    if (!game.modules.get("monks-little-details")?.active) {
        return;
    }

    Object.defineProperty(Token.prototype, "turnmarker", {
        configurable: true,
        get() {
            return this._monks_little_details_turnmarker;
        },
        set(value) {
            this._monks_little_details_turnmarker = value;

            Board.place(`Token#${this.id}.monks-little-details.turnmarker`, value, Board.LAYERS.TOKEN_MARKERS, 2);
        }
    })
});
