import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.Framebuffer.prototype.resize (OVERRIDE)");

PIXI.Framebuffer.prototype.resize = function (width, height) {
    width = Math.round(width);
    height = Math.round(height);

    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;

    this.dirtyId++;
    this.dirtySize++;

    for (let i = 0; i < this.colorTextures.length; i++) {
        this.colorTextures[i].setRealSize(width, height);
    }

    if (this.depthTexture) {
        this.depthTexture.setRealSize(width, height);
    }
};
