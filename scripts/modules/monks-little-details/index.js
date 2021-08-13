import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("monks-little-details")?.active) {
        return;
    }

    patch("Token.prototype.addChild", "POST", function (result, ...objects) {
        for (const object of objects) {
            if (object === this.turnmarker) {
                Board.place(`Token#${this.id}.monks-little-details.turnmarker`, object, Board.LAYERS.TOKEN_MARKERS, 2);
            } else if (object === this.bloodsplat) {
                Board.place(`Token#${this.id}.monks-little-details.bloodsplat`, object, Board.LAYERS.OVERHEAD_EFFECTS, 0);
            }
        }

        return result;
    });

    patch("Token.prototype.addChildAt", "POST", function (result, object, index) {
        if (object === this.turnmarker) {
            Board.place(`Token#${this.id}.monks-little-details.turnmarker`, object, Board.LAYERS.TOKEN_MARKERS, 2);
        } else if (object === this.bloodsplat) {
            Board.place(`Token#${this.id}.monks-little-details.bloodsplat`, object, Board.LAYERS.OVERHEAD_EFFECTS, 0);
        }

        return result;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.monks-little-details.turnmarker`);
        Board.unplace(`Token#${this.id}.monks-little-details.bloodsplat`);

        return arguments;
    });
});
