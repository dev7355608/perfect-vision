import { ShapeDataShader } from "../../display/shape-data.js";
import { StencilMaskData, StencilMaskShader } from "../../display/stencil-mask.js";
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
        mask.stage.removeChildren().forEach(c => c.destroy(true));
    });

    Hooks.on("lightingRefresh", () => {
        mask.clearColor = canvas.lighting._pv_channels.background.rgb;

        mask.stage.removeChildren().forEach(c => c.destroy(true));

        const areas = canvas.lighting._pv_areas;

        if (areas?.length > 0) {
            for (const area of areas) {
                const color = area._pv_channels.background.hex;
                const fov = mask.stage.addChild(area._pv_fov.createMesh(new ShapeDataShader({ tint: color })));

                if (area._pv_los) {
                    fov.mask = new StencilMaskData(mask.stage.addChild(area._pv_los.createMesh(StencilMaskShader.instance)));
                }
            }
        }

        mask.invalidate();
    });
});

