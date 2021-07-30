import { Board } from "../../core/board.js";
import { Mask, MaskFilter } from "../../core/mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("turnmarker")?.active) {
        return;
    }

    patch("Tile.prototype.draw", "POST", async function (result) {
        await result;

        if (this.data.flags?.startMarker || this.data.flags?.turnMarker) {
            Board.unplace(this.document?.uuid);
        }

        return this;
    });

    patch("Tile.prototype.refresh", "POST", function () {
        if (this.tile && (this.data.flags?.startMarker || this.data.flags?.turnMarker)) {
            if (!this._original) {
                this.tile.mask = new PIXI.MaskData(new PIXI.Sprite(Mask.getTexture("background")));
                this.tile.mask.filter = new MaskFilter();
                this.tile.mask.resolution = null;
                this.tile.mask.multisample = PIXI.MSAA_QUALITY.NONE;
            } else {
                this.tile.mask = null;
            }
        }

        return this;
    });
});
