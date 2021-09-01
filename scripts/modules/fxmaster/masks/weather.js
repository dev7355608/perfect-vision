import { Mask } from "../../../core/mask.js";
import { patch } from "../../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    const mask = Mask.get("weather");

    Hooks.on("canvasInit", () => {
        if (mask.stage.fxmaster) {
            mask.stage.fxmaster.destroy(true);
            mask.stage.fxmaster = null;
        }
    });

    patch("Canvas.layers.fxmaster.prototype.updateMask", "OVERRIDE", function () {
        this.visible = true;

        if (mask.stage.fxmaster) {
            mask.stage.fxmaster.destroy(true);
            mask.stage.fxmaster = null;
        }

        mask.stage.fxmaster = canvas.scene.getFlag("fxmaster", "invert") ? canvas.fxmaster._createMask() : canvas.fxmaster._createInvertMask();
        mask.stage.addChild(mask.stage.fxmaster);

        mask.invalidate();
    });
});

