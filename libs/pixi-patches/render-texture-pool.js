import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.RenderTexturePool.prototype.createTexture (OVERRIDE)");

PIXI.RenderTexturePool.prototype.createTexture = function (realWidth, realHeight, multisample = PIXI.MSAA_QUALITY.NONE) {
    const baseRenderTexture = new PIXI.BaseRenderTexture(Object.assign({
        width: realWidth,
        height: realHeight,
        resolution: 1,
    }, this.textureOptions));

    baseRenderTexture.framebuffer.multisample = multisample;

    return new PIXI.RenderTexture(baseRenderTexture);
};

Logger.debug("Patching PIXI.RenderTexturePool.SCREEN_KEY (OVERRIDE)");

PIXI.RenderTexturePool.SCREEN_KEY = -1;

Logger.debug("Patching PIXI.RenderTexturePool.prototype.getOptimalTexture (OVERRIDE)");

PIXI.RenderTexturePool.prototype.getOptimalTexture = function (minWidth, minHeight, resolution = 1, multisample = PIXI.MSAA_QUALITY.NONE) {
    let key;

    minWidth = Math.ceil(minWidth * resolution);
    minHeight = Math.ceil(minHeight * resolution);

    if (!this.enableFullScreen || minWidth !== this._pixelsWidth || minHeight !== this._pixelsHeight) {
        minWidth = PIXI.utils.nextPow2(minWidth);
        minHeight = PIXI.utils.nextPow2(minHeight);
        key = (((minWidth & 0xFFFF) << 16) | (minHeight & 0xFFFF)) >>> 0;

        if (multisample > 1) {
            key += multisample * 0x100000000;
        }
    } else {
        key = multisample > 1 ? -multisample : -1;
    }

    if (!this.texturePool[key]) {
        this.texturePool[key] = [];
    }

    let renderTexture = this.texturePool[key].pop();

    if (!renderTexture) {
        renderTexture = this.createTexture(minWidth, minHeight, multisample);
    }

    renderTexture.filterPoolKey = key;
    renderTexture.setResolution(resolution);

    return renderTexture;
};

Logger.debug("Patching PIXI.RenderTexturePool.prototype.setScreenSize (OVERRIDE)");

PIXI.RenderTexturePool.prototype.setScreenSize = function (size) {
    if (size.width === this._pixelsWidth
        && size.height === this._pixelsHeight) {
        return;
    }

    this.enableFullScreen = size.width > 0 && size.height > 0;

    for (const i in this.texturePool) {
        if (!(Number(i) < 0)) {
            continue;
        }

        const textures = this.texturePool[i];

        if (textures) {
            for (let j = 0; j < textures.length; j++) {
                textures[j].destroy(true);
            }
        }

        this.texturePool[i] = [];
    }

    this._pixelsWidth = size.width;
    this._pixelsHeight = size.height;
}

Logger.debug("Patching PIXI.RenderTexturePool.prototype.getFilterTexture (OVERRIDE)");

PIXI.RenderTexturePool.prototype.getFilterTexture = function (input, resolution, multisample) {
    const filterTexture = this.getOptimalTexture(input.width, input.height, resolution || input.resolution,
        multisample || PIXI.MSAA_QUALITY.NONE);

    filterTexture.filterFrame = input.filterFrame;

    return filterTexture;
};
