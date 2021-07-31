import { Board } from "../../../core/board.js";
import { MaskData } from "../../../core/mask.js";
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
            this.weather.mask = new MaskData("weather");
        }

        return this;
    });

    patch("Canvas.layers.fxmaster.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("fxmaster.weather");

        return await wrapped(...args);
    });
});
