import { CachedAlphaObject } from "../../../core/masks/utils/alpha.js";
import { Elevation } from "../../../core/elevation.js";
import { Mask } from "../../../core/mask.js";
import { patch } from "../../../utils/patch.js";
import { Tiles } from "../../../core/tiles.js";

Hooks.once("init", () => {
    if (!game.modules.get("levels")?.active) {
        return;
    }

    const mask = Mask.create("elevation", {
        format: PIXI.FORMATS.RED,
        type: PIXI.TYPES.FLOAT,
        dependencies: ["occlusionRadial", "occlusionSight"],
        groups: ["tiles", "tokens"]
    });

    mask.stage.sortableChildren = true;

    mask.on("updateStage", (mask) => {
        if (canvas.background.bg) {
            mask.stage.addChild(CachedAlphaObject.create(canvas.background.bg, { threshold: 1.0 }));

            if (canvas.background.isVideo && !canvas.background.bgSource.paused) {
                mask.invalidate();
            }
        }

        for (const token of canvas.tokens.placeables) {
            if (!token.visible || !token.renderable || !token.icon || !token.icon.visible || !token.renderable || token.icon.alpha < 1) {
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
            if (!tile.visible || !tile.renderable || !tile.tile || !tile.tile.visible || !tile.tile.renderable || Tiles.getAlpha(tile) < 1 && Tiles.getOcclusionAlpha(tile) < 1) {
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

    patch("Levels.prototype._onElevationChangeUpdate", "POST", function (result) {
        mask.invalidate();

        return result;
    });
});
