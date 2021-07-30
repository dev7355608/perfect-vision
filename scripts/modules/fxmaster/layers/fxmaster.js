import { Board } from "../../../core/board.js";
import { Mask, MaskFilter } from "../../../core/mask.js";
import { patch } from "../../../utils/patch.js";

Hooks.once("setup", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    patch("Canvas.layers.fxmaster.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: LightingLayer.layerOptions.zIndex - 10
        });
    });

    patch("Canvas.layers.fxmaster.prototype.drawWeather", "POST", async function (result) {
        await result;

        Board.place("fxmaster.weather", this.weather, "weather");

        if (this.weather) {
            this.weather.mask = new PIXI.MaskData(new PIXI.Sprite(Mask.getTexture("weather")));
            this.weather.mask.filter = new MaskFilter();
            this.weather.mask.resolution = null;
            this.weather.mask.multisample = PIXI.MSAA_QUALITY.NONE;
        }

        return this;
    });

    patch("Canvas.layers.fxmaster.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("fxmaster.weather");

        return await wrapped(...args);
    });
});
