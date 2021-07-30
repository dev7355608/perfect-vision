import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.BaseImageResource.prototype.upload (OVERRIDE)");

PIXI.BaseImageResource.prototype.upload = function (renderer, baseTexture, glTexture, source) {
    const gl = renderer.gl;
    const width = baseTexture.realWidth;
    const height = baseTexture.realHeight;

    source = source || this.source;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, baseTexture.alphaMode === PIXI.ALPHA_MODES.UNPACK);

    if (!this.noSubImage
        && baseTexture.target === gl.TEXTURE_2D
        && glTexture.width === width
        && glTexture.height === height) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, baseTexture.format, glTexture.type, source);
    }
    else {
        glTexture.width = width;
        glTexture.height = height;

        gl.texImage2D(baseTexture.target, 0, glTexture.internalFormat, baseTexture.format, glTexture.type, source);
    }

    return true;
};
