import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("turnmarker")?.active) {
        return;
    }

    patch("Tile.prototype.draw", "POST", async function (result) {
        await result;

        if (this.data.flags?.startMarker || this.data.flags?.turnMarker || this.data.flags?.deckMarker) {
            this._pv_highlight = true;

            Board.place(`Tile#${this.id}.tile`, this.id && !this._original ? this.tile : null, Board.LAYERS.TOKEN_MARKERS, this.data.flags.turnMarker ? 2 : (this.data.flags.deckMarker ? 1 : 0));
        }

        return this;
    });

    patch("Tile.prototype.refresh", "POST", function () {
        if (this.tile && (this.data.flags?.startMarker || this.data.flags?.turnMarker || this.data.flags?.deckMarker)) {
            this.tile.mask = null;
            this._pv_highlight = true;
        }

        return this;
    });
});
