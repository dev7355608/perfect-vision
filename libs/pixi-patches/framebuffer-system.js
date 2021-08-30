import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.FramebufferSystem.prototype.bind (OVERRIDE)");

PIXI.FramebufferSystem.prototype.bind = function (framebuffer, frame, mipLevel = 0) {
    const { gl } = this;

    if (framebuffer) {
        // TODO caching layer!

        const fbo = framebuffer.glFramebuffers[this.CONTEXT_UID] || this.initFramebuffer(framebuffer);

        if (this.current !== framebuffer) {
            this.current = framebuffer;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
        }
        // make sure all textures are unbound..

        if (fbo.mipLevel !== mipLevel) {
            framebuffer.dirtyId++;
            framebuffer.dirtyFormat++;
            fbo.mipLevel = mipLevel;
        }

        // now check for updates...
        if (fbo.dirtyId !== framebuffer.dirtyId) {
            fbo.dirtyId = framebuffer.dirtyId;

            if (fbo.dirtyFormat !== framebuffer.dirtyFormat) {
                fbo.dirtyFormat = framebuffer.dirtyFormat;
                fbo.dirtySize = framebuffer.dirtySize;
                this.updateFramebuffer(framebuffer, mipLevel);
            }
            else if (fbo.dirtySize !== framebuffer.dirtySize) {
                fbo.dirtySize = framebuffer.dirtySize;
                this.resizeFramebuffer(framebuffer);
            }
        }

        for (let i = 0; i < framebuffer.colorTextures.length; i++) {
            const tex = framebuffer.colorTextures[i];

            this.renderer.texture.unbind(tex.parentTextureArray || tex);
        }

        if (framebuffer.depthTexture) {
            this.renderer.texture.unbind(framebuffer.depthTexture);
        }

        if (frame) {
            const mipWidth = (frame.width >> mipLevel);
            const mipHeight = (frame.height >> mipLevel);

            const scale = mipWidth / frame.width;

            this.setViewport(
                frame.x * scale,
                frame.y * scale,
                mipWidth,
                mipHeight
            );
        }
        else {
            const mipWidth = (framebuffer.width >> mipLevel);
            const mipHeight = (framebuffer.height >> mipLevel);

            this.setViewport(0, 0, mipWidth, mipHeight);
        }
    }
    else {
        if (this.current) {
            this.current = null;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }

        if (frame) {
            this.setViewport(frame.x, frame.y, frame.width, frame.height);
        }
        else {
            this.setViewport(0, 0, this.renderer.width, this.renderer.height);
        }
    }
};

Logger.debug("Patching PIXI.FramebufferSystem.prototype.setViewport (OVERRIDE)");

PIXI.FramebufferSystem.prototype.setViewport = function (x, y, width, height) {
    const v = this.viewport;

    x = Math.round(x);
    y = Math.round(y);
    width = Math.round(width);
    height = Math.round(height);

    if (v.width !== width || v.height !== height || v.x !== x || v.y !== y) {
        v.x = x;
        v.y = y;
        v.width = width;
        v.height = height;

        this.gl.viewport(x, y, width, height);
    }
};

Logger.debug("Patching PIXI.FramebufferSystem.prototype.setViewport (OVERRIDE)");

PIXI.FramebufferSystem.prototype.forceStencil = function () {
    const framebuffer = this.current;

    if (!framebuffer) {
        return;
    }

    const fbo = framebuffer.glFramebuffers[this.CONTEXT_UID];

    if (!fbo || fbo.stencil) {
        return;
    }

    framebuffer.stencil = true;

    const w = framebuffer.width;
    const h = framebuffer.height;
    const gl = this.gl;
    const stencil = gl.createRenderbuffer();

    gl.bindRenderbuffer(gl.RENDERBUFFER, stencil);

    if (fbo.msaaBuffer) {
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, fbo.multisample, gl.DEPTH24_STENCIL8, w, h);
    }
    else {
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, w, h);
    }

    fbo.stencil = stencil;
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencil);
};

Logger.debug("Patching PIXI.FramebufferSystem.prototype.disposeFramebuffer (OVERRIDE)");

PIXI.FramebufferSystem.prototype.disposeFramebuffer = function (framebuffer, contextLost) {
    const fbo = framebuffer.glFramebuffers[this.CONTEXT_UID];
    const gl = this.gl;

    if (!fbo) {
        return;
    }

    delete framebuffer.glFramebuffers[this.CONTEXT_UID];

    const index = this.managedFramebuffers.indexOf(framebuffer);

    if (index >= 0) {
        this.managedFramebuffers.splice(index, 1);
    }

    framebuffer.disposeRunner.remove(this);

    if (!contextLost) {
        gl.deleteFramebuffer(fbo.framebuffer);

        if (fbo.msaaBuffer) {
            gl.deleteRenderbuffer(fbo.msaaBuffer);
        }

        if (fbo.stencil) {
            gl.deleteRenderbuffer(fbo.stencil);
        }
    }

    if (fbo.blitFramebuffer) {
        fbo.blitFramebuffer.dispose();
    }
};

Logger.debug("Patching PIXI.FramebufferSystem.prototype.blit (OVERRIDE)");

const tempRectangle = new PIXI.Rectangle();

PIXI.FramebufferSystem.prototype.blit = function (framebuffer, sourcePixels, destPixels) {
    const { current, renderer, gl, CONTEXT_UID } = this;

    if (renderer.context.webGLVersion !== 2) {
        return;
    }

    if (!current) {
        return;
    }
    const fbo = current.glFramebuffers[CONTEXT_UID];

    if (!fbo) {
        return;
    }
    if (!framebuffer) {
        if (!fbo.msaaBuffer) {
            return;
        }

        const colorTexture = current.colorTextures[0];

        if (!colorTexture) {
            return;
        }

        if (!fbo.blitFramebuffer) {
            fbo.blitFramebuffer = new PIXI.Framebuffer(current.width, current.height);
            fbo.blitFramebuffer.addColorTexture(0, colorTexture);
        }

        framebuffer = fbo.blitFramebuffer;

        if (framebuffer.colorTextures[0] !== colorTexture) {
            framebuffer.colorTextures[0] = colorTexture;
            framebuffer.dirtyId++;
            framebuffer.dirtyFormat++;
        }

        if (framebuffer.width !== current.width || framebuffer.height !== current.height) {
            framebuffer.width = current.width;
            framebuffer.height = current.height;
            framebuffer.dirtyId++;
            framebuffer.dirtySize++;
        }
    }

    if (!sourcePixels) {
        sourcePixels = tempRectangle;
        sourcePixels.width = current.width;
        sourcePixels.height = current.height;
    }
    if (!destPixels) {
        destPixels = sourcePixels;
    }

    const sameSize = sourcePixels.width === destPixels.width && sourcePixels.height === destPixels.height;

    this.bind(framebuffer);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo.framebuffer);
    gl.blitFramebuffer(sourcePixels.x, sourcePixels.y, sourcePixels.width, sourcePixels.height,
        destPixels.x, destPixels.y, destPixels.width, destPixels.height,
        gl.COLOR_BUFFER_BIT, sameSize ? gl.NEAREST : gl.LINEAR
    );
};

Logger.debug("Patching PIXI.FramebufferSystem.prototype.canMultisampleFramebuffer (OVERRIDE)");

PIXI.FramebufferSystem.prototype.canMultisampleFramebuffer = function (framebuffer) {
    return this.renderer.context.webGLVersion !== 1
        && framebuffer.colorTextures.length <= 1 && !framebuffer.depthTexture;
};

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
