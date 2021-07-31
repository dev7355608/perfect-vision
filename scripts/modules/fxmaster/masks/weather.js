import { Mask } from "../../../core/mask.js";
import { patch } from "../../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    const mask = Mask.get("weather");

    mask.on("updateStage", (mask) => {
        mask.stage.fxmaster = canvas.scene.getFlag("fxmaster", "invert") ? canvas.fxmaster._createMask() : canvas.fxmaster._createInvertMask();
        mask.stage.addChild(mask.stage.fxmaster);
    });

    mask.on("updateTexture", (mask) => {
        if (mask.stage.fxmaster) {
            mask.stage.fxmaster.destroy(true);
            mask.stage.fxmaster = null;
        }
    });

    patch("Canvas.layers.fxmaster.prototype.updateMask", "OVERRIDE", function () {
        this.visible = true;

        mask.invalidate();
    });
});

