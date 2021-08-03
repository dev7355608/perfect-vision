import { Mask } from "../../core/mask.js";
import { Tiles } from "../../core/tiles.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("betterroofs")?.active) {
        return;
    }

    Hooks.on("updateTile", (document, change, options, userId, arg) => {
        const scene = document.parent;

        if (!scene?.isView || !hasProperty(change, "flags.betterroofs")) {
            return;
        }

        const tile = canvas.foreground.get(document.id);

        if (tile) {
            tile.refresh();
        }
    });

    patch("betterRoofsHelpers.prototype.computeMask", "OVERRIDE", function (tile, controlledToken) { });

    Hooks.once("betterRoofsReady", () => {
        if (game.settings.get("betterroofs", "forceFallback")) {
            return;
        }

        Tiles.getOcclusionMask = function (tile) {
            if (tile._original || tile.dontMask || !this.isOverhead(tile)) {
                return;
            }

            let texture;

            if (tile.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
                texture = "occlusionRadial";
            } else if (_betterRoofs.foregroundSightMaskContainers[tile.id] /* tile.document.getFlag("betterroofs", "brMode") === 3 */) {
                texture = "occlusionSight";
            }

            return texture;
        };
    });
});

