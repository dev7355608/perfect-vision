import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

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

            Board.get("highlight").place(`Token#${this.id}.monks-little-details.turnmarker`, value, "tokens-2");
        }
    })
});
