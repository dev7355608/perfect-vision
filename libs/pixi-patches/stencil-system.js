import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.StencilSystem.prototype.push (OVERRIDE)");

PIXI.StencilSystem.prototype.push = function (maskData) {
    const maskObject = maskData.maskObject;
    const { gl } = this.renderer;
    const prevMaskCount = maskData._stencilCounter;

    if (prevMaskCount === 0) {
        // force use stencil texture in current framebuffer
        this.renderer.framebuffer.forceStencil();
        gl.enable(gl.STENCIL_TEST);
    }

    maskData._stencilCounter++;

    // Increment the reference stencil value where the new mask overlaps with the old ones.
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.EQUAL, prevMaskCount, this._getBitwiseMask());
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);

    maskObject.renderable = true;
    maskObject.render(this.renderer);
    this.renderer.batch.flush();
    maskObject.renderable = false;

    this._useCurrent();
};

Logger.debug("Patching PIXI.StencilSystem.prototype.pop (OVERRIDE)");

PIXI.StencilSystem.prototype.pop = function (maskObject) {
    const gl = this.renderer.gl;

    if (this.getStackLength() === 0) {
        // the stack is empty!
        gl.disable(gl.STENCIL_TEST);
        gl.clearStencil(0);
        gl.clear(gl.STENCIL_BUFFER_BIT);
    } else {
        // Decrement the reference stencil value where the popped mask overlaps with the other ones
        gl.colorMask(false, false, false, false);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);

        maskObject.renderable = true;
        maskObject.render(this.renderer);
        this.renderer.batch.flush();
        maskObject.renderable = false;

        this._useCurrent();
    }
};

Logger.debug("Patching PIXI.StencilSystem.prototype._getBitwiseMask (OVERRIDE)");

PIXI.StencilSystem.prototype._getBitwiseMask = function () {
    return 0xFFFFFFFF;
};
