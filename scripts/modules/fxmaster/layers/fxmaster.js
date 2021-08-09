import { Board } from "../../../core/board.js";
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

        Board.place("fxmaster.weather", this.weather, Board.LAYERS.WEATHER, 1);

        this.weather.mask = null;

        return this;
    });

    patch("Canvas.layers.fxmaster.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("fxmaster.weather");

        return await wrapped(...args);
    });
});
