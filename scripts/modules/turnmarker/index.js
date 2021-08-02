import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("turnmarker")?.active) {
        return;
    }

    patch("Tile.prototype.draw", "POST", async function (result) {
        await result;

        if (this.data.flags?.startMarker || this.data.flags?.turnMarker || this.data.flags?.deckMarker) {
            Board.get("highlight").place(`Tile#${this.id}.tile`, this.id && !this._original ? this.tile : null, "background+2");
        }

        return this;
    });

    patch("Tile.prototype.refresh", "POST", function () {
        if (this.tile && (this.data.flags?.startMarker || this.data.flags?.turnMarker || this.data.flags?.deckMarker)) {
            this.tile.mask = null;
        }

        return this;
    });
});
