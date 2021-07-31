import { MaskData } from "../mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("GridLayer.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: SightLayer.layerOptions.zIndex - 25
        });
    });

    patch("GridLayer.prototype.draw", "POST", async function (result) {
        await result;

        this.mask = new MaskData("background");
        this.mask.multisample = PIXI.MSAA_QUALITY.HIGH;

        return this;
    });
});
