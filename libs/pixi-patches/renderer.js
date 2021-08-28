import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.Renderer.prototype.resize (OVERRIDE)");

PIXI.Renderer.prototype.resize = function (screenWidth, screenHeight) {
    PIXI.AbstractRenderer.prototype.resize.call(this, screenWidth, screenHeight);

    this.runners.resize.emit(this.screen.width, this.screen.height);
};

Logger.debug("Patching PIXI.Renderer.prototype.contextChange");

PIXI.Renderer.prototype.contextChange = function () {
    const gl = this.gl;

    let samples;

    if (this.context.webGLVersion === 1) {
        const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        samples = gl.getParameter(gl.SAMPLES);

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    } else {
        const framebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);

        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

        samples = gl.getParameter(gl.SAMPLES);

        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
    }

    if (samples >= PIXI.MSAA_QUALITY.HIGH) {
        this._multisample = PIXI.MSAA_QUALITY.HIGH;
    } else if (samples >= PIXI.MSAA_QUALITY.MEDIUM) {
        this._multisample = PIXI.MSAA_QUALITY.MEDIUM;
    } else if (samples >= PIXI.MSAA_QUALITY.LOW) {
        this._multisample = PIXI.MSAA_QUALITY.LOW;
    } else {
        this._multisample = PIXI.MSAA_QUALITY.NONE;
    }
};

Logger.debug("Patching PIXI.Renderer.prototype.multisample");

Object.defineProperty(PIXI.Renderer.prototype, "multisample", {
    get() {
        if (this._multisample === undefined) {
            this.contextChange();
            this.runners.contextChange.add(this);
        }

        return this._multisample;
    }
});
