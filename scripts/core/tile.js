import { LightingSystem } from "./lighting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("drawTile", tile => {
        if (tile.isPreview || !tile.isRoof) {
            return;
        }

        updateLighting(tile);
    });

    Hooks.on("refreshTile", tile => {
        if (tile.isPreview || !tile.isRoof) {
            return;
        }

        setTimeout(() => {
            const document = tile.document;
            const objectId = `Tile.${document.id}`;

            if (LightingSystem.instance.hasRegion(objectId)
                && LightingSystem.instance.updateRegion(objectId, {
                    active: isActive(tile), elevation: document.elevation,
                    occluded: tile.occluded, occlusionMode: document.occlusion.mode
                })) {
                canvas.perception.update({ refreshLighting: true }, true);
            }
        }, 0);
    });

    Hooks.on("destroyTile", tile => {
        if (tile.isPreview || !tile.isRoof) {
            return;
        }

        updateLighting(tile, { deleted: true });
    });

    Hooks.on("updateTile", document => {
        if (!document.rendered) {
            return;
        }

        updateLighting(document.object);
    });
});

export function updateLighting(tile, { defer = false, deleted = false } = {}) {
    const document = tile.document;
    const objectId = `Tile.${document.id}`;

    if (!deleted && tile.isRoof) {
        const active = isActive(tile);
        let prototype = document.flags["perfect-vision"]?.lighting;

        if (prototype) {
            prototype = `Drawing.${prototype}`;
        } else {
            prototype = "globalLight";
        }

        const { x, y, width, height, rotation, texture: { scaleX, scaleY }, elevation, sort } = document;
        const data = {
            object: tile, active, prototype, elevation, sort, occluded: tile.occluded, occlusionMode: document.occlusion.mode,
            shape: { x, y, width, height, scaleX, scaleY, rotation }, texture: tile.texture
        };

        if (!LightingSystem.instance.hasRegion(objectId)) {
            LightingSystem.instance.createRegion(objectId, data);
        } else if (!LightingSystem.instance.updateRegion(objectId, data)) {
            defer = true;
        }
    } else if (!LightingSystem.instance.destroyRegion(objectId)) {
        defer = true;
    }

    if (!defer) {
        canvas.perception.update({ refreshLighting: true }, true);
    }
};

function isActive(tile) {
    return !tile.document.hidden && !!tile.texture?.baseTexture.valid
        && CONFIG.Levels?.handlers?.TileHandler?.isTileVisible?.(tile) !== false;
}
