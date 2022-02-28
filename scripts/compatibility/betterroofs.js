import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("betterroofs")?.active) {
        return;
    }

    patch("betterRoofsHelpers.prototype.computeMask", "OVERRIDE", function (tile, controlledToken) { });

    Hooks.on("updateTile", (document, change, options, userId, arg) => {
        const scene = document.parent;

        if (!scene?.isView || !canvas.ready || !("flags" in change && ("betterroofs" in change.flags || "-=betterroofs" in change.flags) || "-=flags" in change)) {
            return;
        }

        const tile = document.object;

        if (tile) {
            tile.refresh({ refreshPerception: tile.isRoof });
        }
    });
});
