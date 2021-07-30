import { Mask, MaskFilter } from "../mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("DrawingsLayer.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: GridLayer.layerOptions.zIndex + 10
        });
    });

    patch("DrawingsLayer.prototype.draw", "POST", async function (result) {
        await result;

        this.mask = new PIXI.MaskData(new PIXI.Sprite(Mask.getTexture("background")));
        this.mask.filter = new MaskFilter();
        this.mask.resolution = null;
        this.mask.multisample = null;

        return this;
    });
});
