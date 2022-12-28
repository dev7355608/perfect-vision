import { LightingSystem } from "./lighting-system.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("drawTile", tile => {
        if (tile.isPreview || !tile.document.overhead) {
            return;
        }

        updateLighting(tile);
    });

    Hooks.on("refreshTile", tile => {
        if (tile.isPreview || !tile.document.overhead) {
            return;
        }

        if (tile._lighting && tile.mesh?.shader?.uniforms) {
            tile.mesh.shader.uniforms.depthElevation = tile._lighting.depth;
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
        if (tile.isPreview || !tile.document.overhead) {
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

    if (isNewerVersion(game.version, "10.290")) {
        libWrapper.register(
            "perfect-vision",
            "OcclusionSamplerShader._packInterleavedGeometry",
            function (element, attributeBuffer, indexBuffer, aIndex, iIndex) {
                const { uint32View, float32View } = attributeBuffer;

                const activeMode = element.object.document.occlusion.mode;
                const packedVertices = aIndex / this.vertexSize;
                const uvs = element.uvs;
                const indices = element.indices;
                const occluded = element.object.object.occluded;
                const occlusionMode = (canvas.effects.visionSources.size > 0) ? activeMode
                    : (activeMode === CONST.TILE_OCCLUSION_MODES.VISION ? CONST.TILE_OCCLUSION_MODES.FADE : activeMode);
                const isModeFade = (occlusionMode === CONST.TILE_OCCLUSION_MODES.FADE);
                const vertexData = element.vertexData;
                const textureId = element._texture.baseTexture._batchLocation;
                const depthElevation = element.object.object._lighting.depth;
                const argb = element._tintRGB + ((255 * ((isModeFade && occluded) ? 0.15 : depthElevation)) << 24);

                for (let i = 0; i < vertexData.length; i += 2) {
                    float32View[aIndex++] = vertexData[i];
                    float32View[aIndex++] = vertexData[i + 1];
                    float32View[aIndex++] = uvs[i];
                    float32View[aIndex++] = uvs[i + 1];
                    uint32View[aIndex++] = argb;
                    float32View[aIndex++] = textureId;
                    float32View[aIndex++] = occlusionMode;
                }

                for (let i = 0; i < indices.length; i++) {
                    indexBuffer[iIndex++] = packedVertices + indices[i];
                }
            },
            libWrapper.OVERRIDE,
            { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
        );

        libWrapper.register(
            "perfect-vision",
            "TileMesh.prototype.renderOcclusion",
            function (renderer) {
                if (!this.object.isRoof || this.document.hidden || !this.object._lighting?.active) return;
                const isModeNone = (this.object.document.occlusion.mode === CONST.TILE_OCCLUSION_MODES.NONE);
                const occluded = this.object.occluded;

                // Forcing the batch plugin to render roof mask
                this.pluginName = OcclusionSamplerShader.classPluginName;

                // Saving the value from the mesh
                const originalTint = this.tint;
                const originalBlendMode = this.blendMode;
                const originalAlpha = this.worldAlpha;

                // Rendering the roof sprite
                this.tint = 0xFFFF00 + ((!isModeNone && occluded) ? 0xFF : 0x0);
                this.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
                this.worldAlpha = 1.0;
                if (this.visible && this.renderable) this._render(renderer);

                // Restoring original values
                this.tint = originalTint;
                this.blendMode = originalBlendMode;
                this.worldAlpha = originalAlpha;

                // Stop forcing batched plugin
                this.pluginName = null;
            },
            libWrapper.OVERRIDE,
            { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
        );
    } else {
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
    }
});

export function updateLighting(tile, { defer = false, deleted = false } = {}) {
    const document = tile.document;
    const objectId = `Tile.${document.id}`;

    if (!deleted && document.overhead) {
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
            shape: { x, y, width, height, scaleX, scaleY, rotation }, texture: tile.texture,
            height: CONFIG.Levels
                ? (document.flags.levels?.rangeTop ?? Infinity) - document.elevation
                : Infinity
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
    if (!tile.isRoof) {
        return false;
    }

    if (tile.document.hidden || !tile.texture?.baseTexture.valid) {
        return false;
    }

    if (CONFIG.Levels) {
        if (!game.user.isGM || !CONFIG.Levels.UI?.rangeEnabled || canvas.tokens.controlled.length) {
            return !!CONFIG.Levels.handlers.TileHandler.isTileVisible(tile);
        }

        const { rangeBottom, rangeTop } = CONFIG.Levels.helpers.getRangeForDocument(tile.document)

        return !!CONFIG.Levels.handlers.UIHandler.inUIRangeTile(rangeBottom, rangeTop, tile);
    }

    return true;
}
