import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.FORMATS");

PIXI.FORMATS.RG = 33319;
PIXI.FORMATS.RED = 6403;
PIXI.FORMATS.RGBA_INTEGER = 36249;
PIXI.FORMATS.RGB_INTEGER = 36248;
PIXI.FORMATS.RG_INTEGER = 33320;
PIXI.FORMATS.RED_INTEGER = 36244;

Logger.debug("Patching PIXI.TYPES");

PIXI.TYPES.UNSIGNED_INT = 5125;
PIXI.TYPES.UNSIGNED_INT_10F_11F_11F_REV = 35899;
PIXI.TYPES.UNSIGNED_INT_2_10_10_10_REV = 33640;
PIXI.TYPES.UNSIGNED_INT_24_8 = 34042;
PIXI.TYPES.UNSIGNED_INT_5_9_9_9_REV = 35902;
PIXI.TYPES.BYTE = 5120;
PIXI.TYPES.SHORT = 5122;
PIXI.TYPES.INT = 5124;
PIXI.TYPES.FLOAT_32_UNSIGNED_INT_24_8_REV = 36269;

Logger.debug("Patching PIXI.TextureSystem.prototype.initTextureType (OVERRIDE)");

PIXI.TextureSystem.prototype.initTextureType = function (texture, glTexture) {
    if (!this.internalFormats) {
        const gl = this.gl;

        if ('WebGL2RenderingContext' in self && gl instanceof self.WebGL2RenderingContext) {
            this.internalFormats = {
                [PIXI.TYPES.UNSIGNED_BYTE]: {
                    [PIXI.FORMATS.RGBA]: gl.RGBA8,
                    [PIXI.FORMATS.RGB]: gl.RGB8,
                    [PIXI.FORMATS.RG]: gl.RG8,
                    [PIXI.FORMATS.RED]: gl.R8,
                    [PIXI.FORMATS.RGBA_INTEGER]: gl.RGBA8UI,
                    [PIXI.FORMATS.RGB_INTEGER]: gl.RGB8UI,
                    [PIXI.FORMATS.RG_INTEGER]: gl.RG8UI,
                    [PIXI.FORMATS.RED_INTEGER]: gl.R8UI,
                    [PIXI.FORMATS.ALPHA]: gl.ALPHA,
                    [PIXI.FORMATS.LUMINANCE]: gl.LUMINANCE,
                    [PIXI.FORMATS.LUMINANCE_ALPHA]: gl.LUMINANCE_ALPHA,
                },
                [PIXI.TYPES.BYTE]: {
                    [PIXI.FORMATS.RGBA]: gl.RGBA8_SNORM,
                    [PIXI.FORMATS.RGB]: gl.RGB8_SNORM,
                    [PIXI.FORMATS.RG]: gl.RG8_SNORM,
                    [PIXI.FORMATS.RED]: gl.R8_SNORM,
                    [PIXI.FORMATS.RGBA_INTEGER]: gl.RGBA8I,
                    [PIXI.FORMATS.RGB_INTEGER]: gl.RGB8I,
                    [PIXI.FORMATS.RG_INTEGER]: gl.RG8I,
                    [PIXI.FORMATS.RED_INTEGER]: gl.R8I,
                },
                [PIXI.TYPES.UNSIGNED_SHORT]: {
                    [PIXI.FORMATS.RGBA_INTEGER]: gl.RGBA16UI,
                    [PIXI.FORMATS.RGB_INTEGER]: gl.RGB16UI,
                    [PIXI.FORMATS.RG_INTEGER]: gl.RG16UI,
                    [PIXI.FORMATS.RED_INTEGER]: gl.R16UI,
                    [PIXI.FORMATS.DEPTH_COMPONENT]: gl.DEPTH_COMPONENT16,
                },
                [PIXI.TYPES.SHORT]: {
                    [PIXI.FORMATS.RGBA_INTEGER]: gl.RGBA16I,
                    [PIXI.FORMATS.RGB_INTEGER]: gl.RGB16I,
                    [PIXI.FORMATS.RG_INTEGER]: gl.RG16I,
                    [PIXI.FORMATS.RED_INTEGER]: gl.R16I,
                },
                [PIXI.TYPES.UNSIGNED_INT]: {
                    [PIXI.FORMATS.RGBA_INTEGER]: gl.RGBA32UI,
                    [PIXI.FORMATS.RGB_INTEGER]: gl.RGB32UI,
                    [PIXI.FORMATS.RG_INTEGER]: gl.RG32UI,
                    [PIXI.FORMATS.RED_INTEGER]: gl.R32UI,
                    [PIXI.FORMATS.DEPTH_COMPONENT]: gl.DEPTH_COMPONENT24,
                },
                [PIXI.TYPES.INT]: {
                    [PIXI.FORMATS.RGBA_INTEGER]: gl.RGBA32I,
                    [PIXI.FORMATS.RGB_INTEGER]: gl.RGB32I,
                    [PIXI.FORMATS.RG_INTEGER]: gl.RG32I,
                    [PIXI.FORMATS.RED_INTEGER]: gl.R32I,
                },
                [PIXI.TYPES.FLOAT]: {
                    [PIXI.FORMATS.RGBA]: gl.RGBA32F,
                    [PIXI.FORMATS.RGB]: gl.RGB32F,
                    [PIXI.FORMATS.RG]: gl.RG32F,
                    [PIXI.FORMATS.RED]: gl.R32F,
                    [PIXI.FORMATS.DEPTH_COMPONENT]: gl.DEPTH_COMPONENT32F,
                },
                [PIXI.TYPES.HALF_FLOAT]: {
                    [PIXI.FORMATS.RGBA]: gl.RGBA16F,
                    [PIXI.FORMATS.RGB]: gl.RGB16F,
                    [PIXI.FORMATS.RG]: gl.RG16F,
                    [PIXI.FORMATS.RED]: gl.R16F,
                },
                [PIXI.TYPES.UNSIGNED_SHORT_5_6_5]: {
                    [PIXI.FORMATS.RGB]: gl.RGB565,
                },
                [PIXI.TYPES.UNSIGNED_SHORT_4_4_4_4]: {
                    [PIXI.FORMATS.RGBA]: gl.RGBA4,
                },
                [PIXI.TYPES.UNSIGNED_SHORT_5_5_5_1]: {
                    [PIXI.FORMATS.RGBA]: gl.RGB5_A1,
                },
                [PIXI.TYPES.UNSIGNED_INT_2_10_10_10_REV]: {
                    [PIXI.FORMATS.RGBA]: gl.RGB10_A2,
                    [PIXI.FORMATS.RGBA_INTEGER]: gl.RGB10_A2UI,
                },
                [PIXI.TYPES.UNSIGNED_INT_10F_11F_11F_REV]: {
                    [PIXI.FORMATS.RGB]: gl.R11F_G11F_B10F,
                },
                [PIXI.TYPES.UNSIGNED_INT_5_9_9_9_REV]: {
                    [PIXI.FORMATS.RGB]: gl.RGB9_E5,
                },
                [PIXI.TYPES.UNSIGNED_INT_24_8]: {
                    [PIXI.FORMATS.DEPTH_STENCIL]: gl.DEPTH24_STENCIL8,
                },
                [PIXI.TYPES.FLOAT_32_UNSIGNED_INT_24_8_REV]: {
                    [PIXI.FORMATS.DEPTH_STENCIL]: gl.DEPTH32F_STENCIL8,
                },
            };
        }
        else {
            this.internalFormats = {
                [PIXI.TYPES.UNSIGNED_BYTE]: {
                    [PIXI.FORMATS.RGBA]: gl.RGBA,
                    [PIXI.FORMATS.RGB]: gl.RGB,
                    [PIXI.FORMATS.ALPHA]: gl.ALPHA,
                    [PIXI.FORMATS.LUMINANCE]: gl.LUMINANCE,
                    [PIXI.FORMATS.LUMINANCE_ALPHA]: gl.LUMINANCE_ALPHA,
                },
                [PIXI.TYPES.UNSIGNED_SHORT_5_6_5]: {
                    [PIXI.FORMATS.RGB]: gl.RGB,
                },
                [PIXI.TYPES.UNSIGNED_SHORT_4_4_4_4]: {
                    [PIXI.FORMATS.RGBA]: gl.RGBA,
                },
                [PIXI.TYPES.UNSIGNED_SHORT_5_5_5_1]: {
                    [PIXI.FORMATS.RGBA]: gl.RGBA,
                },
            };
        }
    }

    glTexture.internalFormat = this.internalFormats[texture.type]?.[texture.format] ?? texture.format;

    if (this.webGLVersion === 2 && texture.type === PIXI.TYPES.HALF_FLOAT) {
        // PIXI.TYPES.HALF_FLOAT is WebGL1 HALF_FLOAT_OES
        // we have to convert it to WebGL HALF_FLOAT
        glTexture.type = this.gl.HALF_FLOAT;
    }
    else {
        glTexture.type = texture.type;
    }
};

Logger.debug("Patching PIXI.TextureSystem.prototype.bind (OVERRIDE)");

PIXI.TextureSystem.prototype.bind = function (texture, location = 0) {
    const { gl } = this;

    texture = texture?.castToBaseTexture();

    // cannot bind partial texture
    // TODO: report a warning
    if (texture && texture.valid && !texture.parentTextureArray) {
        texture.touched = this.renderer.textureGC.count;

        const glTexture = texture._glTextures[this.CONTEXT_UID] || this.initTexture(texture);

        if (this.boundTextures[location] !== texture) {
            if (this.currentLocation !== location) {
                this.currentLocation = location;
                gl.activeTexture(gl.TEXTURE0 + location);
            }

            gl.bindTexture(texture.target, glTexture.texture);
        }

        if (glTexture.dirtyId !== texture.dirtyId) {
            if (this.currentLocation !== location) {
                this.currentLocation = location;
                gl.activeTexture(gl.TEXTURE0 + location);
            }
            this.updateTexture(texture);
        }

        this.boundTextures[location] = texture;
    }
    else {
        if (this.currentLocation !== location) {
            this.currentLocation = location;
            gl.activeTexture(gl.TEXTURE0 + location);
        }

        gl.bindTexture(gl.TEXTURE_2D, this.emptyTextures[gl.TEXTURE_2D].texture);
        this.boundTextures[location] = null;
    }
};
