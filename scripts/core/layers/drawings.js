import { MaskData } from "../mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("DrawingsLayer.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: GridLayer.layerOptions.zIndex + 10
        });
    });

    patch("DrawingsLayer.prototype.draw", "POST", async function (result) {
        await result;

        this.mask = new MaskData("background");
        this.mask.multisample = null;

        return this;
    });
});
