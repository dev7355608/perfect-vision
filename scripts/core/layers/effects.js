import { Board } from "../board.js";
import { Mask, MaskFilter } from "../mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("EffectsLayer.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: LightingLayer.layerOptions.zIndex - 10
        });
    });

    patch("EffectsLayer.prototype.draw", "POST", async function (result) {
        await result;

        Board.place("effects.weather", this.weather, "weather");

        return this;
    });

    patch("EffectsLayer.prototype.drawWeather", "POST", function (result) {
        if (this.weather) {
            const index = this.weather.filters?.indexOf(this.weatherOcclusionFilter);

            if (index >= 0) {
                this.weather.filters.splice(index, 1);
            }

            if (this.weatherOcclusionFilter.enabled) {
                this.weather.mask = new PIXI.MaskData(new PIXI.Sprite(Mask.getTexture("weather")));
                this.weather.mask.filter = new MaskFilter();
                this.weather.mask.resolution = null;
                this.weather.mask.multisample = PIXI.MSAA_QUALITY.NONE;
            } else {
                this.weather.mask = null;
            }
        }

        return result;
    });

    patch("EffectsLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("effects.weather");

        return await wrapped(...args);
    });
});
