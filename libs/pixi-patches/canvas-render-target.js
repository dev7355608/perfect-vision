import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.utils.CanvasRenderTarget.prototype.resize (OVERRIDE)");

PIXI.utils.CanvasRenderTarget.prototype.resize = function (desiredWidth, desiredHeight) {
    this.canvas.width = Math.round(desiredWidth * this.resolution);
    this.canvas.height = Math.round(desiredHeight * this.resolution);
};

Logger.debug("Patching PIXI.utils.CanvasRenderTarget.prototype.width (OVERRIDE)");

Object.defineProperty(PIXI.utils.CanvasRenderTarget.prototype, "width", {
    get() {
        return this.canvas.width;
    },
    set(value) {
        this.canvas.width = Math.round(value);
    }
});

Logger.debug("Patching PIXI.utils.CanvasRenderTarget.prototype.height (OVERRIDE)");

Object.defineProperty(PIXI.utils.CanvasRenderTarget.prototype, "height", {
    get() {
        return this.canvas.height;
    },
    set(value) {
        this.canvas.height = Math.round(value);
    }
});
