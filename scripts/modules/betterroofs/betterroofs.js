import { Tiles } from "../../core/tiles.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("betterroofs")?.active) {
        return;
    }

    Hooks.on("updateTile", (document, change, options, userId, arg) => {
        const scene = document.parent;

        if (!scene?.isView || !("flags" in change && ("betterroofs" in change.flags || "-=betterroofs" in change.flags) || "-=flags" in change)) {
            return;
        }

        const tile = document.object;

        if (tile) {
            tile.refresh();
        }
    });

    patch("betterRoofsHelpers.prototype.computeMask", "OVERRIDE", function (tile, controlledToken) { });

    patch("betterRoofsHelpers.prototype.computeHide", "MIXED", function (wrapped, controlledToken, tile, overrideHide) {
        if (!Tiles.isOverhead(tile)) {
            this.alpha = 1;

            return overrideHide;
        }

        return wrapped(controlledToken, tile, overrideHide);
    });

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

