import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.RenderTextureSystem.prototype.clear (OVERRIDE)");

PIXI.RenderTextureSystem.prototype.clear = function (clearColor, mask) {
    if (this.current) {
        clearColor = clearColor || this.current.baseTexture.clearColor;
    }
    else {
        clearColor = clearColor || this.clearColor;
    }

    const destinationFrame = this.destinationFrame;
    const baseFrame = this.current ? this.current.baseTexture : this.renderer.screen;
    const clearMask = destinationFrame.width !== baseFrame.width || destinationFrame.height !== baseFrame.height;

    if (clearMask) {
        let { x, y, width, height } = this.viewportFrame;

        x = Math.round(x);
        y = Math.round(y);
        width = Math.round(width);
        height = Math.round(height);

        // TODO: ScissorSystem should cache whether the scissor test is enabled or not.
        this.renderer.gl.enable(this.renderer.gl.SCISSOR_TEST);
        this.renderer.gl.scissor(x, y, width, height);
    }

    this.renderer.framebuffer.clear(clearColor[0], clearColor[1], clearColor[2], clearColor[3], mask);

    if (clearMask) {
        // Restore the scissor box
        this.renderer.scissor.pop();
    }
};

Logger.debug("Patching PIXI.RenderTextureSystem.prototype.bind (OVERRIDE)");

const tempRect = new PIXI.Rectangle();
const tempRect2 = new PIXI.Rectangle();

PIXI.RenderTextureSystem.prototype.bind = function (renderTexture = null, sourceFrame, destinationFrame) {
    const renderer = this.renderer;

    this.current = renderTexture;

    let baseTexture;
    let framebuffer;
    let resolution;

    if (renderTexture) {
        baseTexture = renderTexture.baseTexture;

        resolution = baseTexture.resolution;

        if (!sourceFrame) {
            tempRect.width = renderTexture.frame.width;
            tempRect.height = renderTexture.frame.height;

            sourceFrame = tempRect;
        }

        if (!destinationFrame) {
            tempRect2.x = renderTexture.frame.x;
            tempRect2.y = renderTexture.frame.y;
            tempRect2.width = sourceFrame.width;
            tempRect2.height = sourceFrame.height;

            destinationFrame = tempRect2;
        }

        framebuffer = baseTexture.framebuffer;
    }
    else {
        resolution = renderer.resolution;

        if (!sourceFrame) {
            tempRect.width = renderer.screen.width;
            tempRect.height = renderer.screen.height;

            sourceFrame = tempRect;
        }

        if (!destinationFrame) {
            destinationFrame = tempRect;

            destinationFrame.width = sourceFrame.width;
            destinationFrame.height = sourceFrame.height;
        }
    }

    const viewportFrame = this.viewportFrame;

    viewportFrame.x = destinationFrame.x * resolution;
    viewportFrame.y = destinationFrame.y * resolution;
    viewportFrame.width = destinationFrame.width * resolution;
    viewportFrame.height = destinationFrame.height * resolution;

    if (!renderTexture) {
        viewportFrame.y = renderer.view.height - (viewportFrame.y + viewportFrame.height);
    }

    viewportFrame.ceil();

    this.renderer.framebuffer.bind(framebuffer, viewportFrame);
    this.renderer.projection.update(destinationFrame, sourceFrame, resolution, !framebuffer);

    if (renderTexture) {
        this.renderer.mask.setMaskStack(baseTexture.maskStack);
    }
    else {
        this.renderer.mask.setMaskStack(this.defaultMaskStack);
    }

    this.sourceFrame.copyFrom(sourceFrame);
    this.destinationFrame.copyFrom(destinationFrame);
};
