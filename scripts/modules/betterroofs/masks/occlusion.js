import { Mask } from "../../../core/mask.js";

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

        mask.stage.los = mask.stage.addChild(new PIXI.Graphics());

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
            mask.stage.los.clear();
        }

        if (canvas) {
            canvasInit();
        }

        Hooks.on("canvasInit", canvasInit);

        Hooks.on("sightRefresh", () => {
            mask.stage.los.clear();

            if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
                mask.stage.los.beginFill();

                for (const source of canvas.sight.sources) {
                    if (!source.active) {
                        continue;
                    }

                    mask.stage.los.drawPolygon(source.los);
                }

                for (const source of canvas.lighting.sources) {
                    if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL) {
                        continue;
                    }

                    mask.stage.los.drawPolygon(source.fov);
                }

                mask.stage.los.endFill();
            }

            mask.invalidate();
        });
    });
});

