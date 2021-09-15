import { ShapeShader } from "../../display/shape.js";
import { StencilMaskData, StencilMaskShader } from "../../display/stencil-mask.js";
import { Mask } from "../mask.js";

Hooks.once("init", () => {
    const mask = Mask.create("illumination", {
        format: PIXI.FORMATS.RGB,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        groups: ["areas"],
        dependencies: ["elevation"]
    });

    mask.on("updateTexture", (mask) => {
        mask.render();
    });

    Hooks.on("canvasInit", () => {
        mask.clearColor.set([1, 1, 1]);
        mask.stage.removeChildren().forEach(c => c.destroy(true));
    });

    Hooks.on("lightingRefresh", () => {
        mask.clearColor.set(canvas.lighting._pv_channels.background.rgb);

        mask.stage.removeChildren().forEach(c => c.destroy(true));

        const areas = canvas.lighting._pv_areas;

        if (areas?.length > 0) {
            for (const area of areas) {
                const color = area._pv_channels.background.hex;
                const fov = mask.stage.addChild(area._pv_fov.createMesh(new ShapeShader({ tint: color })));

                if (area._pv_los) {
                    fov.mask = new StencilMaskData(mask.stage.addChild(area._pv_los.createMesh(StencilMaskShader.instance)));
                }
            }
        }

        mask.invalidate();
    });
});

