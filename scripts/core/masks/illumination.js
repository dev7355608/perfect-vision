import { TexturelessMeshMaterial } from "../../display/mesh.js";
import { Elevation, ElevationFilter } from "../elevation.js";
import { Mask } from "../mask.js";

Hooks.once("init", () => {
    const mask = Mask.create("illumination", {
        format: PIXI.FORMATS.RGB,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        groups: ["areas", "blur"],
        dependencies: ["elevation"]
    });

    mask.on("updateTexture", (mask) => {
        mask.render();
    });

    Hooks.on("canvasInit", () => {
        mask.clearColor = [1, 1, 1];
        mask.stage.filter = canvas.createBlurFilter();
        mask.stage.filter.repeatEdgePixels = true;
        mask.stage.filter.resolution = mask.texture.resolution;
        mask.stage.filter.multisample = PIXI.MSAA_QUALITY.NONE;
        mask.stage.filters = [mask.stage.filter];
        mask.stage.filterArea = canvas.app.renderer.screen;
    });

    Hooks.on("lightingRefresh", () => {
        mask.clearColor = canvas.lighting._pv_channels.background.rgb;

        mask.stage.removeChildren().forEach(c => c.destroy(true));

        const areas = canvas.lighting._pv_areas;

        if (areas?.length > 0) {
            const elevation = Mask.get("elevation");

            for (const area of areas) {
                if (area.skipRender) {
                    continue;
                }

                const color = area._pv_channels.background.hex;

                const fov = area._pv_fov.createMesh(new TexturelessMeshMaterial({ tint: color }));

                if (area._pv_los) {
                    const los = area._pv_los.createMaskData();

                    fov.mask = los;

                    mask.stage.addChild(los.maskObject);
                }

                if (elevation) {
                    fov.filters = [new ElevationFilter(Elevation.getElevationRange(area))];
                }

                mask.stage.addChild(fov);
            }
        }

        mask.invalidate();
    });
});

