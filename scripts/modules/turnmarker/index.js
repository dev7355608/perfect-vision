import { Board } from "../../core/board.js";
import { MaskData } from "../../core/mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("turnmarker")?.active) {
        return;
    }

    patch("Tile.prototype.draw", "POST", async function (result) {
        await result;

        if (this.data.flags?.startMarker || this.data.flags?.turnMarker || this.data.flags?.deckMarker) {
            Board.get("primary").unplace(`Tile[${this.id}].tile`);
        }

        return this;
    });

    patch("Tile.prototype.refresh", "POST", function () {
        if (this.tile && (this.data.flags?.startMarker || this.data.flags?.turnMarker || this.data.flags?.deckMarker)) {
            if (!this._original) {
                this.tile.mask = new MaskData("background");
            } else {
                this.tile.mask = null;
            }
        }

        return this;
    });
});
