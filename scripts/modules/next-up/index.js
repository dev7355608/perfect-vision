import { Mask, MaskFilter } from "../../core/mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("Next-Up")?.active) {
        return;
    }

    patch("BackgroundLayer.prototype.addChild", "POST", function (result, ...children) {
        setTimeout(() => {
            for (const child of children) {
                if (child.isShadow) {
                    child.mask = new PIXI.MaskData(new PIXI.Sprite(Mask.getTexture("background")));
                    child.mask.filter = new MaskFilter();
                    child.mask.resolution = null;
                    child.mask.multisample = PIXI.MSAA_QUALITY.NONE;
                }
            }
        }, 0);

        return result;
    });

    patch("Token.prototype.addChild", "POST", function (result, ...children) {
        setTimeout(() => {
            for (const child of children) {
                if (child.NUMaker) {
                    child.mask = new PIXI.MaskData(new PIXI.Sprite(Mask.getTexture("background")));
                    child.mask.filter = new MaskFilter();
                    child.mask.resolution = null;
                    child.mask.multisample = PIXI.MSAA_QUALITY.NONE;
                }
            }
        }, 0);

        return result;
    });
});
