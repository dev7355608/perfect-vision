import { Mask } from "../../../core/mask.js";
import { patch } from "../../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("weatherblock")?.active) {
        return;
    }

    const mask = Mask.get("weather");

    mask.on("updateStage", (mask) => {
        mask.stage.weatherblock = _weatherBlock.createMask(!canvas.scene.getFlag("weatherblock", "invertMask"));
        mask.stage.addChild(mask.stage.weatherblock);
    });

    mask.on("updateTexture", (mask) => {
        if (mask.stage.weatherblock) {
            mask.stage.weatherblock.destroy(true);
            mask.stage.weatherblock = null;
        }
    });

    patch("_weatherBlock.updateMask", "OVERRIDE", function () {
        mask.invalidate();
    });
});

