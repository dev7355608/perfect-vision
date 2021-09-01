import { CachedAlphaObject } from "./utils/alpha.js";
import { Mask } from "../mask.js";
import { Tiles } from "../tiles.js";

Hooks.once("init", () => {
    const mask = Mask.create("weather", {
        format: PIXI.FORMATS.RED,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        clearColor: [1, 0, 0, 0],
        groups: ["tiles"],
        dependencies: ["occlusionRadial", "occlusionSight"]
    });

    mask.stage.roofs = mask.stage.addChild(new PIXI.Container());
    mask.stage.roofs.sortableChildren = true;

    mask.on("updateStage", (mask, invalid) => {
        if (invalid.groups.tiles || invalid.masks.occlusionRadial || invalid.masks.occlusionSight) {
            mask.stage.roofs.removeChildren();

            if (canvas.foreground.displayRoofs) {
                for (const roof of canvas.foreground.roofs) {
                    if (!Tiles.isOverhead(roof) || !Tiles.isVisible(roof, true)) {
                        continue;
                    }

                    const alpha = CachedAlphaObject.create(roof.tile, { alpha: [Tiles.getAlpha(roof, true), Tiles.getOcclusionAlpha(roof, true)], mask: Tiles.getOcclusionMaskTexture(roof) });

                    alpha.zIndex = roof.zIndex;
                    mask.stage.roofs.addChild(alpha);

                    if (roof.isVideo && !roof.sourceElement.paused) {
                        mask.invalidate();
                    }
                }
            }
        }
    });

    mask.on("updateTexture", (mask) => {
        mask.render();
    });

    Hooks.on("canvasInit", () => {
        mask.stage.roofs.removeChildren();
    });
});

