import { Elevation, ElevationFilter } from "../elevation.js";
import { Mask } from "../mask.js";

Hooks.once("init", () => {
    const mask = Mask.create("illumination", {
        format: PIXI.FORMATS.RGB,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        groups: ["areas", "blur"],
        dependencies: ["elevation"]
    });

    mask.stage.illumination = mask.stage.addChild(new PIXI.Graphics());

    mask.on("updateStage", (mask) => {
        mask.clearColor = canvas.lighting.channels?.background.rgb ?? [1, 1, 1];
    });

    mask.on("updateTexture", (mask) => {
        mask.render();
    });

    Hooks.on("canvasInit", () => {
        mask.stage.filter = canvas.createBlurFilter();
        mask.stage.filter.repeatEdgePixels = true;
        mask.stage.filter.resolution = mask.texture.resolution;
        mask.stage.filter.multisample = PIXI.MSAA_QUALITY.NONE;
        mask.stage.filters = [mask.stage.filter];
        mask.stage.filterArea = canvas.app.renderer.screen;
    });

    Hooks.on("lightingRefresh", () => {
        mask.stage.removeChildren().forEach(c => c.destroy(true));

        const areas = canvas.lighting._pv_areas;

        if (areas?.length !== 0) {
            const elevation = Mask.get("elevation");

            for (const area of areas) {
                if (area.skipRender) {
                    continue;
                }

                const fov = new PIXI.Graphics()
                    .beginFill(area._pv_channels.background.hex)
                    .drawShape(area._pv_fov)
                    .endFill();

                if (area._pv_los) {
                    const los = new PIXI.Graphics()
                        .beginFill()
                        .drawShape(area._pv_los)
                        .endFill();

                    mask.stage.addChild(los);

                    fov.mask = los;
                }

                if (elevation) {
                    fov.filter = new ElevationFilter(Elevation.getElevationRange(area));
                    fov.filters = [fov.filter];
                }

                mask.stage.addChild(fov);
            }
        }

        mask.invalidate();
    });
});

