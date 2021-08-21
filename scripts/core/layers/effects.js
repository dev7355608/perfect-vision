import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("EffectsLayer.layerOptions", "POST", function (options) {
        return foundry.utils.mergeObject(options, {
            zIndex: LightingLayer.layerOptions.zIndex - 10
        });
    });

    patch("EffectsLayer.prototype.draw", "POST", async function (result) {
        await result;

        Board.place("effects.weather", this.weather, Board.LAYERS.WEATHER, 0);

        return this;
    });

    patch("EffectsLayer.prototype.drawWeather", "POST", function (result) {
        if (this.weather) {
            const index = this.weather.filters?.indexOf(this.weatherOcclusionFilter);

            if (index >= 0) {
                this.weather.filters.splice(index, 1);
            }

            this.weather.mask = null;
        }

        return result;
    });

    patch("EffectsLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("effects.weather");

        return await wrapped(...args);
    });
});
