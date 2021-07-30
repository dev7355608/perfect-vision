import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("BackgroundLayer.prototype.getZIndex", "OVERRIDE", function () {
        return MapLayer.prototype.getZIndex.call(this);
    });
});
