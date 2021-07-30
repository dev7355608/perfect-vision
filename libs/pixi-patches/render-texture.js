import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.RenderTexture.prototype.resize (OVERRIDE)");

PIXI.RenderTexture.prototype.resize = function (desiredWidth, desiredHeight, resizeBaseTexture = true) {
    const resolution = this.baseTexture.resolution;
    const width = Math.round(desiredWidth * resolution) / resolution;
    const height = Math.round(desiredHeight * resolution) / resolution;

    // TODO - could be not required..
    this.valid = (width > 0 && height > 0);

    this._frame.width = this.orig.width = width;
    this._frame.height = this.orig.height = height;

    if (resizeBaseTexture) {
        this.baseTexture.resize(width, height);
    }

    this.updateUvs();
};

Logger.debug("Patching PIXI.RenderTexture.prototype.multisample");

Object.defineProperty(PIXI.RenderTexture.prototype, "multisample", {
    get() {
        return this.framebuffer.multisample;
    },
    set(value) {
        this.framebuffer.multisample = value;
    }
});

Logger.debug("Patching PIXI.RenderTexture.create (WRAPPER)");

const create = PIXI.RenderTexture.create;
PIXI.RenderTexture.create = function (options) {
    const renderTexture = create.apply(this, arguments);

    if (options !== undefined && typeof options !== 'number') {
        renderTexture.multisample = options.multisample !== undefined ? options.multisample : PIXI.MSAA_QUALITY.NONE;
    }

    return renderTexture;
};
