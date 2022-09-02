/**
 * Extract a rectangular block of pixels from the texture.
 * @param {PIXI.Renderer} renderer - The renderer.
 * @param {PIXI.Texture} texture - The texture the pixels are extracted from.
 * @param {PIXI.Rectangle} [frame] - The rectangle the pixels are extracted from.
 * @returns {{pixels: Uint8Array, width: number, height: number}} The extracted pixel data.
 */
export function extractPixels(renderer, texture, frame) {
    const baseTexture = texture?.baseTexture;

    if (!baseTexture || !baseTexture.valid || baseTexture.parentTextureArray) {
        throw new Error("Texture is invalid");
    }

    renderer.texture.bind(texture);

    const gl = renderer.gl;
    const framebuffer = gl.createFramebuffer();

    try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            baseTexture._glTextures[renderer.CONTEXT_UID]?.texture,
            0
        );

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error("Failed to extract pixels from texture");
        }

        frame ??= texture.frame;

        const resolution = baseTexture.resolution;
        const x = Math.round(frame.left * resolution);
        const y = Math.round(frame.top * resolution);
        const width = Math.round(frame.right * resolution) - x;
        const height = Math.round(frame.bottom * resolution) - y;
        const pixels = new Uint8Array(4 * width * height);

        gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        return { pixels, x, y, width, height, resolution };
    } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
    }
}
