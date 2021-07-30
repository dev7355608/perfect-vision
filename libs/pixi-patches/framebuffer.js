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
        const texture = this.colorTextures[i];
        const resolution = texture.resolution;

        // take into account the fact the texture may have a different resolution..
        texture.setSize(width / resolution, height / resolution);
    }

    if (this.depthTexture) {
        const resolution = this.depthTexture.resolution;

        this.depthTexture.setSize(width / resolution, height / resolution);
    }
};
