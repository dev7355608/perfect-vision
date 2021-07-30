import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.BaseRenderTexture.prototype.framebuffer (OVERRIDE)");

Object.defineProperty(PIXI.BaseRenderTexture.prototype, "framebuffer", {
    get() {
        return this._framebuffer;
    },

    set(value) {
        if (this._framebuffer === undefined) {
            value.width = this.realWidth;
            value.height = this.realHeight;
        }

        this._framebuffer = value ?? null;
    }
});

Logger.debug("Patching PIXI.BaseRenderTexture.prototype.resize (OVERRIDE)");

PIXI.BaseRenderTexture.prototype.resize = function (desiredWidth, desiredHeight) {
    this.framebuffer.resize(desiredWidth * this.resolution, desiredHeight * this.resolution);
    this.setRealSize(this.framebuffer.width, this.framebuffer.height);
};
