import { ShapeShader } from "../../display/shape.js";
import { StencilMaskData, StencilMaskShader } from "../../display/stencil-mask.js";
import { Mask } from "../mask.js";

Hooks.once("init", () => {
    const mask = Mask.create("lighting", {
        format: PIXI.FORMATS.RG,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        groups: ["areas"],
        dependencies: ["elevation"]
    });

    mask.on("updateTexture", (mask) => {
        mask.render();
    });

    Hooks.on("canvasInit", () => {
        mask.clearColor.set([0, 1]);
        mask.stage.removeChildren().forEach(c => c.destroy(true));
    });

    Hooks.on("lightingRefresh", () => {
        mask.clearColor[0] = canvas.lighting._pv_darknessLevel;
        mask.clearColor[1] = canvas.lighting._pv_saturationLevel;

        mask.stage.removeChildren().forEach(c => c.destroy(true));

        const areas = canvas.lighting._pv_areas;

        if (areas?.length > 0) {
            for (const area of areas) {
                const darkness = area._pv_darknessLevel;
                const saturation = area._pv_saturationLevel;
                const color = (Math.clamped(Math.round(darkness * 255), 0, 255) << 16) | (Math.clamped(Math.round(saturation * 255), 0, 255) << 8);
                const fov = mask.stage.addChild(area._pv_fov.createMesh(new ShapeShader({ tint: color })));

                if (area._pv_los) {
                    fov.mask = new StencilMaskData(mask.stage.addChild(area._pv_los.createMesh(StencilMaskShader.instance)));
                }
            }
        }

        mask.invalidate();
    });
});

