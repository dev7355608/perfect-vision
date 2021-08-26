import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.BaseTexture.prototype.realWidth (OVERRIDE)");

Object.defineProperty(PIXI.BaseTexture.prototype, "realWidth", {
    get() {
        return Math.round(this.width * this.resolution);
    }
});

Logger.debug("Patching PIXI.BaseTexture.prototype.realHeight (OVERRIDE)");

Object.defineProperty(PIXI.BaseTexture.prototype, "realHeight", {
    get() {
        return Math.round(this.height * this.resolution);
    }
});

Logger.debug("Patching PIXI.BaseTexture.prototype.setResource (OVERRIDE)");

PIXI.BaseTexture.prototype.setResource = function (resource) {
    if (this._pv_size === undefined) {
        this.width = Math.round(this.width * this.resolution) / this.resolution;
        this.height = Math.round(this.height * this.resolution) / this.resolution;
        this._refreshPOT();

        if (this instanceof PIXI.BaseRenderTexture) {
            this._pv_size = { width: this.width, height: this.height };
        } else {
            this._pv_size = null;
        }
    }

    if (this.resource === resource) {
        return this;
    }

    if (this.resource) {
        throw new Error('Resource can be set only once');
    }

    resource.bind(this);

    this.resource = resource;

    return this;
};

Logger.debug("Patching PIXI.BaseTexture.prototype.setSize (OVERRIDE)");

PIXI.BaseTexture.prototype.setSize = function (desiredWidth, desiredHeight, resolution) {
    resolution = resolution || this.resolution;

    return this.setRealSize(desiredWidth * resolution, desiredHeight * resolution, resolution);
};

Logger.debug("Patching PIXI.BaseTexture.prototype.setRealSize (OVERRIDE)");

PIXI.BaseTexture.prototype.setRealSize = function (realWidth, realHeight, resolution) {
    this.resolution = resolution || this.resolution;
    this.width = Math.round(realWidth) / this.resolution;
    this.height = Math.round(realHeight) / this.resolution;
    this._refreshPOT();
    this.update();

    return this;
};

Logger.debug("Patching PIXI.BaseTexture.prototype.setResolution (OVERRIDE)");

PIXI.BaseTexture.prototype.setResolution = function (resolution) {
    const oldResolution = this.resolution;

    if (oldResolution === resolution) {
        return this;
    }

    this.resolution = resolution;

    if (this.valid) {
        this.width = Math.round(this.width * oldResolution) / resolution;
        this.height = Math.round(this.height * oldResolution) / resolution;
        this.emit('update', this);
    }

    this._refreshPOT();

    return this;
};
