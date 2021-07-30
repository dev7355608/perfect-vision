import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.ArrayResource.prototype.upload (OVERRIDE)");

PIXI.ArrayResource.prototype.upload = function (renderer, texture, glTexture) {
    const { length, itemDirtyIds, items } = this;
    const { gl } = renderer;

    if (glTexture.dirtyId < 0) {
        gl.texImage3D(
            gl.TEXTURE_2D_ARRAY,
            0,
            glTexture.internalFormat,
            this._width,
            this._height,
            length,
            0,
            texture.format,
            glTexture.type,
            null
        );
    }

    for (let i = 0; i < length; i++) {
        const item = items[i];

        if (itemDirtyIds[i] < item.dirtyId) {
            itemDirtyIds[i] = item.dirtyId;
            if (item.valid) {
                gl.texSubImage3D(
                    gl.TEXTURE_2D_ARRAY,
                    0,
                    0, // xoffset
                    0, // yoffset
                    i, // zoffset
                    item.resource.width,
                    item.resource.height,
                    1,
                    texture.format,
                    glTexture.type,
                    item.resource.source
                );
            }
        }
    }

    return true;
};
