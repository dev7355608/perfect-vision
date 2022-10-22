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

    libWrapper.register(
        "perfect-vision",
        "TileMesh.prototype.renderOcclusion",
        function (renderer) {
            if (!this.object.isRoof || !this.object._lighting?.active) return;
            const isModeNone = (this.object.document.occlusion.mode === CONST.TILE_OCCLUSION_MODES.NONE);
            const isModeFade = (this.object.document.occlusion.mode === CONST.TILE_OCCLUSION_MODES.FADE);
            const occluded = this.object.occluded;

            // Forcing the batch plugin to render roof mask and alphaMode to NPM
            this.pluginName = OcclusionSamplerShader.classPluginName;
            this.alphaMode = PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA;

            // Saving the value from the mesh
            const originalTint = this.tint;
            const originalAlpha = this.worldAlpha;
            const originalBlendMode = this.blendMode;

            // Rendering the roof sprite
            this.tint = 0xFFFF00 + ((!isModeNone && occluded) ? 0xFF : 0x0);
            this.worldAlpha = (isModeFade && occluded) ? 0.15 : this.object._lighting.depth;
            this.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
            this.render(renderer);

            // Restoring original values
            this.tint = originalTint;
            this.worldAlpha = originalAlpha;
            this.blendMode = originalBlendMode;

            // Stop forcing alphaMode and batched plugin
            this.alphaMode = null;
            this.pluginName = null;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );
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
            tile._lighting = LightingSystem.instance.createRegion(objectId, data);
        } else if (!LightingSystem.instance.updateRegion(objectId, data)) {
            defer = true;
        }
    } else {
        if (!LightingSystem.instance.destroyRegion(objectId)) {
            defer = true;
        }

        tile._lighting = null;
    }

    if (!defer) {
        canvas.perception.update({ refreshLighting: true }, true);
    }
};

function isActive(tile) {
    if (tile.document.hidden || !tile.texture?.baseTexture.valid) {
        return false;
    }

    if (CONFIG.Levels) {
        if (!game.user.isGM || !CONFIG.Levels.UI?.rangeEnabled || CONFIG.Levels.currentToken) {
            return !!CONFIG.Levels.handlers.TileHandler.isTileVisible(tile);
        }

        const { rangeBottom, rangeTop } = CONFIG.Levels.helpers.getRangeForDocument(tile.document)

        return !!CONFIG.Levels.handlers.UIHandler.inUIRangeTile(rangeBottom, rangeTop, tile);
    }

    return true;
}
