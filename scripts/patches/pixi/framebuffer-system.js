import { Logger } from "../../utils/logger.js";

Logger.debug("Patching PIXI.FramebufferSystem.prototype.updateFramebuffer (OVERRIDE)");

PIXI.FramebufferSystem.prototype.updateFramebuffer = function (framebuffer, mipLevel) {
    const { gl } = this;

    const fbo = framebuffer.glFramebuffers[this.CONTEXT_UID];

    // bind the color texture
    const colorTextures = framebuffer.colorTextures;

    let count = colorTextures.length;

    if (!gl.drawBuffers) {
        count = Math.min(count, 1);
    }

    if (fbo.multisample > 1 && this.canMultisampleFramebuffer(framebuffer)) {
        fbo.msaaBuffer = fbo.msaaBuffer || gl.createRenderbuffer();
    } else if (fbo.msaaBuffer) {
        gl.deleteRenderbuffer(fbo.msaaBuffer);
        fbo.msaaBuffer = null;

        if (fbo.blitFramebuffer) {
            fbo.blitFramebuffer.dispose();
            fbo.blitFramebuffer = null;
        }
    }

    const activeTextures = [];

    for (let i = 0; i < count; i++) {
        const texture = colorTextures[i];
        const parentTexture = texture.parentTextureArray || texture;

        this.renderer.texture.bind(parentTexture, 0);

        if (i === 0 && fbo.msaaBuffer) {
            gl.bindRenderbuffer(gl.RENDERBUFFER, fbo.msaaBuffer);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, fbo.multisample,
                parentTexture._glTextures[this.CONTEXT_UID].internalFormat, framebuffer.width, framebuffer.height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, fbo.msaaBuffer);
        }
        else {
            gl.framebufferTexture2D(gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0 + i,
                texture.target,
                parentTexture._glTextures[this.CONTEXT_UID].texture,
                mipLevel);

            activeTextures.push(gl.COLOR_ATTACHMENT0 + i);
        }
    }

    if (activeTextures.length > 1) {
        gl.drawBuffers(activeTextures);
    }

    if (framebuffer.depthTexture && this.writeDepthTexture) {
        const depthTexture = framebuffer.depthTexture;

        this.renderer.texture.bind(depthTexture, 0);

        gl.framebufferTexture2D(gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.TEXTURE_2D,
            depthTexture._glTextures[this.CONTEXT_UID].texture,
            mipLevel);
    }

    if ((framebuffer.stencil || framebuffer.depth) && !(framebuffer.depthTexture && this.writeDepthTexture)) {
        fbo.stencil = fbo.stencil || gl.createRenderbuffer();

        gl.bindRenderbuffer(gl.RENDERBUFFER, fbo.stencil);

        if (fbo.msaaBuffer) {
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, fbo.multisample,
                gl.DEPTH24_STENCIL8, framebuffer.width, framebuffer.height);
        }
        else {
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, framebuffer.width, framebuffer.height);
        }

        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, fbo.stencil);
    }
    else if (fbo.stencil) {
        gl.deleteRenderbuffer(fbo.stencil);
        fbo.stencil = null;
    }
};

Logger.debug("Patching PIXI.FramebufferSystem.prototype.resizeFramebuffer (OVERRIDE)");

PIXI.FramebufferSystem.prototype.resizeFramebuffer = function (framebuffer) {
    const { gl } = this;

    const fbo = framebuffer.glFramebuffers[this.CONTEXT_UID];

    if (fbo.stencil) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, fbo.stencil);

        if (fbo.msaaBuffer) {
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, fbo.multisample,
                gl.DEPTH24_STENCIL8, framebuffer.width, framebuffer.height);
        }
        else {
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, framebuffer.width, framebuffer.height);
        }
    }

    const colorTextures = framebuffer.colorTextures;

    let count = colorTextures.length;

    if (!gl.drawBuffers) {
        count = Math.min(count, 1);
    }

    for (let i = 0; i < count; i++) {
        const texture = colorTextures[i];
        const parentTexture = texture.parentTextureArray || texture;

        this.renderer.texture.bind(parentTexture, 0);

        if (i === 0 && fbo.msaaBuffer) {
            gl.bindRenderbuffer(gl.RENDERBUFFER, fbo.msaaBuffer);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, fbo.multisample,
                parentTexture._glTextures[this.CONTEXT_UID].internalFormat, framebuffer.width, framebuffer.height);
        }
    }

    if (framebuffer.depthTexture && this.writeDepthTexture) {
        this.renderer.texture.bind(framebuffer.depthTexture, 0);
    }
};
