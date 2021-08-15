// import "./background.js";
import "./foreground.js";
import "./illumination.js";
import "./lighting.js";
import "./occlusion.js";
import "./vision.js";
import "./weather.js";

import { Mask } from "../mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("ForegroundLayer.prototype.refresh", "POST", function () {
        Mask.invalidateAll("tiles");

        return this;
    });

    patch("Tile.prototype.refresh", "POST", function () {
        if (!this._original) {
            Mask.invalidateAll("tiles");
        }

        return this;
    });

    patch("Token.prototype.refresh", "POST", function () {
        if (!this._original) {
            Mask.invalidateAll("tokens");
        }

        return this;
    });

    patch("Token.prototype.setPosition", "POST", async function (result) {
        await result;

        if (!this._original) {
            Mask.invalidateAll("tokens");
        }

        return this;
    });

    patch("Drawing.prototype.refresh", "POST", function () {
        if (this._pv_active) {
            Mask.invalidateAll("areas");
        }

        return this;
    });

    patch("Canvas.prototype.updateBlur", "POST", function () {
        Mask.invalidateAll("blur");
    });
});

