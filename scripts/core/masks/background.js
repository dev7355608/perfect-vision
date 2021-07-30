import { CachedAlphaObject } from "./utils/alpha.js";
import { Mask } from "../mask.js";
import { Tiles } from "../tiles.js";

Hooks.once("init", () => {
    const mask = Mask.create("background", {
        format: PIXI.FORMATS.RED,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        clearColor: [1, 0, 0, 0],
        groups: ["tiles", "tokens"],
        dependencies: ["occlusionRadial", "occlusionSight"]
    });

    mask.stage.tokens = mask.stage.addChild(new PIXI.Container());
    mask.stage.tokens.sortableChildren = true;
    mask.stage.tiles = mask.stage.addChild(new PIXI.Container());
    mask.stage.tiles.sortableChildren = true;

    mask.on("updateStage", (mask) => {
        for (const token of canvas.tokens.placeables) {
            if (!token.visible || !token.renderable || !token.icon || !token.icon.visible || !token.renderable || token.icon.alpha === 0) {
                continue;
            }

            const alpha = CachedAlphaObject.create(token.icon, { alpha: token.icon.alpha });

            alpha.zIndex = token.zIndex;
            mask.stage.tokens.addChild(alpha);

            if (token.isVideo) {
                mask.invalidate();
            }
        }

        for (const tile of canvas.foreground.tiles) {
            if (!Tiles.isOverhead(tile) || !Tiles.isVisible(tile)) {
                continue;
            }

            const alpha = CachedAlphaObject.create(tile.tile, { alpha: [Tiles.getAlpha(tile), Tiles.getOcclusionAlpha(tile)], mask: Tiles.getOcclusionMaskTexture(tile) });

            alpha.zIndex = tile.zIndex;
            mask.stage.tiles.addChild(alpha);

            if (tile.isVideo) {
                mask.invalidate();
            }
        }
    });

    mask.on("updateTexture", (mask) => {
        mask.render();

        mask.stage.tokens.removeChildren();
        mask.stage.tiles.removeChildren();
    });
});

