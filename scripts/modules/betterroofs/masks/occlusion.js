import { Mask } from "../../../core/mask.js";
import { ShapeDataShader } from "../../../display/shape-data.js";
import { StencilMaskData, StencilMaskShader } from "../../../display/stencil-mask.js";

Hooks.once("init", () => {
    if (!game.modules.get("betterroofs")?.active) {
        return;
    }

    Hooks.once("betterRoofsReady", () => {
        if (game.settings.get("betterroofs", "forceFallback")) {
            return;
        }

        const mask = Mask.create("occlusionSight", {
            format: PIXI.FORMATS.RED,
            type: PIXI.TYPES.UNSIGNED_BYTE,
            clearColor: [1, 0, 0, 0],
            group: ["blur"]
        });

        const shaderBlack = new ShapeDataShader({ tint: 0x000000 });
        const shaderRed = new ShapeDataShader({ tint: 0xFF0000 });

        mask.on("updateTexture", (mask) => {
            mask.render();
        });

        function canvasInit() {
            mask.stage.filter = canvas.createBlurFilter();
            mask.stage.filter.repeatEdgePixels = true;
            mask.stage.filter.resolution = mask.texture.resolution;
            mask.stage.filter.multisample = PIXI.MSAA_QUALITY.NONE;
            mask.stage.filters = [mask.stage.filter];
            mask.stage.filterArea = canvas.app.renderer.screen;
            mask.stage.removeChildren().forEach(c => c.destroy(true));
        }

        if (canvas) {
            canvasInit();
        }

        Hooks.on("canvasInit", canvasInit);

        Hooks.on("sightRefresh", () => {
            mask.stage.removeChildren().forEach(c => c.destroy(true));

            if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
                const areas = canvas.lighting._pv_areas;

                if (areas?.length > 0) {
                    for (const area of areas) {
                        if (area.skipRender) {
                            continue;
                        }

                        const fov = mask.stage.addChild(area._pv_fov.createMesh(area._pv_vision ? shaderBlack : shaderRed));

                        if (area._pv_los) {
                            fov.mask = new StencilMaskData(mask.stage.addChild(area._pv_los.createMesh(StencilMaskShader.instance)));
                        }
                    }
                }

                for (const source of canvas.sight.sources) {
                    if (!source.active) {
                        continue;
                    }

                    mask.stage.addChild(source._pv_fov.createMesh(shaderBlack));
                }

                for (const source of canvas.lighting.sources) {
                    if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL) {
                        continue;
                    }

                    mask.stage.addChild(source._pv_fov.createMesh(shaderBlack));
                }
            }

            mask.invalidate();
        });
    });
});

