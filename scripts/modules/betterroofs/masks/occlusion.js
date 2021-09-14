import { Mask } from "../../../core/mask.js";
import { ShapeShader } from "../../../display/shape.js";
import { StencilMask, StencilMaskData, StencilMaskShader } from "../../../display/stencil-mask.js";

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

        mask.stage.fov = mask.stage.addChild(new PIXI.Container());
        mask.stage.los = mask.stage.addChild(new StencilMask());
        mask.stage.msk = new StencilMaskData(mask.stage.los);
        mask.stage.mask = null;

        const shaderBlack = new ShapeShader({ tint: 0x000000 });
        const shaderRed = new ShapeShader({ tint: 0xFF0000 });

        mask.on("updateTexture", (mask) => {
            mask.render();
        });

        function canvasInit() {
            if (game.settings.get("core", "softShadows")) {
                mask.stage.filter = canvas.createBlurFilter();
                mask.stage.filter.repeatEdgePixels = true;
                mask.stage.filter.resolution = mask.texture.resolution;
                mask.stage.filter.multisample = PIXI.MSAA_QUALITY.NONE;
            } else {
                if (mask.stage.filter) {
                    mask.reset();
                }

                mask.stage.filter = null;
            }

            if (mask.stage.filter) {
                mask.stage.filters = [mask.stage.filter];
            } else {
                mask.stage.filters = null;
            }

            mask.stage.filterArea = canvas.app.renderer.screen;
            mask.stage.fov.removeChildren().forEach(c => c.destroy(true));
            mask.stage.los.clear();
            mask.stage.mask = null;
        }

        if (canvas) {
            canvasInit();
        }

        Hooks.on("canvasInit", canvasInit);

        Hooks.on("lightingRefresh", () => {
            mask.stage.fov.removeChildren().forEach(c => c.destroy(true));

            if (canvas.lighting._pv_globalLight || canvas.lighting._pv_vision) {
                mask.stage.fov.addChild(canvas.lighting._pv_fov.createMesh(shaderBlack));
            }

            const areas = canvas.lighting._pv_areas;

            if (areas?.length > 0) {
                for (const area of areas) {
                    const fov = mask.stage.fov.addChild(area._pv_fov.createMesh(area._pv_globalLight || area._pv_vision ? shaderBlack : shaderRed));

                    if (area._pv_los) {
                        fov.mask = new StencilMaskData(mask.stage.fov.addChild(area._pv_los.createMesh(StencilMaskShader.instance)));
                    }
                }
            }

            for (const source of canvas.sight.sources) {
                if (!source.active) {
                    continue;
                }

                if (source._pv_fov) {
                    mask.stage.fov.addChild(source._pv_fov.createMesh(shaderBlack));
                }
            }

            for (const source of canvas.lighting.sources) {
                if (!source.active) {
                    continue;
                }

                if (source.radius > 0 && source._pv_fov) {
                    mask.stage.fov.addChild(source._pv_fov.createMesh(shaderBlack));
                }
            }

            mask.invalidate();
        });

        Hooks.on("sightRefresh", () => {
            mask.stage.los.clear();

            if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
                const areas = canvas.lighting._pv_areas;

                if (areas?.length > 0) {
                    for (const area of areas) {
                        mask.stage.los.drawShape(area._pv_fov, area._pv_los ? [area._pv_los] : null, !area._pv_vision);
                    }
                }

                for (const source of canvas.sight.sources) {
                    if (!source.active) {
                        continue;
                    }

                    mask.stage.los.drawShape(source._pv_los);
                }

                for (const source of canvas.lighting.sources) {
                    if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL) {
                        continue;
                    }

                    if (source.radius > 0 && source._pv_fov) {
                        mask.stage.los.drawShape(source._pv_fov);
                    }
                }

                mask.stage.mask = mask.stage.msk;
            } else {
                mask.stage.mask = null;
            }

            mask.invalidate();
        });
    });
});

