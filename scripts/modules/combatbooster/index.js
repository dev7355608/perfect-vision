import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("combatbooster")?.active) {
        return;
    }

    patch("Token.prototype.addChild", "POST", function (result, ...objects) {
        for (const object of objects) {
            if (object.name === "CBTurnMarker" && !game.settings.get("combatbooster", "markerAbove")) {
                Board.place(`Token#${this.id}.combatbooster`, object, Board.LAYERS.TOKEN_MARKERS, 2);
                break;
            }
        }

        return result;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.combatbooster`);

        return arguments;
    });
});
