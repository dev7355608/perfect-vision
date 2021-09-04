import { CachedAlphaObject } from "../../../core/masks/utils/alpha.js";
import { Elevation } from "../../../core/elevation.js";
import { Mask } from "../../../core/mask.js";
import { patch } from "../../../utils/patch.js";
import { Tiles } from "../../../core/tiles.js";
import { Tokens } from "../../../core/tokens.js";

Hooks.once("init", () => {
    if (!game.modules.get("levels")?.active) {
        return;
    }

    const mask = Mask.create("elevation", {
        format: PIXI.FORMATS.RED,
        type: PIXI.TYPES.FLOAT,
        clearColor: [-1, 0, 0, 0],
        dependencies: ["occlusionRadial", "occlusionSight"],
        groups: ["tiles", "tokens"]
    });

    mask.stage.sortableChildren = true;

    mask.on("updateStage", (mask) => {
        for (const token of canvas.tokens.placeables) {
            if (Tokens.isOverhead(token) === false || !token.visible || !token.renderable || !token.icon || !token.icon.parent || !token.icon.visible || !token.renderable || token.icon.alpha < 1) {
                continue;
            }

            const elevation = Elevation.getTokenElevation(token);
            const alpha = CachedAlphaObject.create(token.icon, { tint: [elevation, 0, 0], threshold: 1.0 });

            alpha.zIndex = elevation;
            mask.stage.addChild(alpha);

            const source = token.texture?.baseTexture.resource.source;

            if (source?.tagName === "VIDEO" && !source.paused) {
                mask.invalidate();
            }
        }

        for (const tile of canvas.foreground.tiles) {
            if (!Tiles.isOverhead(tile) || !tile.visible || !tile.renderable || !tile.tile || !tile.tile.parent || !tile.tile.visible || !tile.tile.renderable || Tiles.getAlpha(tile) < 1 && Tiles.getOcclusionAlpha(tile) < 1) {
                continue;
            }

            const elevation = Elevation.getTileElevation(tile);
            const alpha = CachedAlphaObject.create(tile.tile, { tint: [elevation, 0, 0], threshold: 1.0, mask: Tiles.getOcclusionMaskTexture(tile) });

            alpha.zIndex = elevation;
            mask.stage.addChild(alpha);

            if (tile.isVideo && !tile.sourceElement.paused) {
                mask.invalidate();
            }
        }
    });

    mask.on("updateTexture", (mask) => {
        mask.render();

        mask.stage.removeChildren();
    });

    Hooks.on("sightRefresh", () => {
        mask.invalidate();
    });

    patch("Levels.prototype._onElevationChangeUpdate", "POST", function (result) {
        mask.invalidate();

        return result;
    });

    patch("Levels.prototype.compute3DCollisionsForToken", "POST", function (result) {
        mask.invalidate();

        return result;
    });
});
