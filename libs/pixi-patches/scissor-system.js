import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.ScissorSystem.prototype._useCurrent (OVERRIDE)");

PIXI.ScissorSystem.prototype._useCurrent = function () {
    const rect = this.maskStack[this.maskStack.length - 1]._scissorRect;
    const rt = this.renderer.renderTexture.current;
    const { transform, sourceFrame, destinationFrame } = this.renderer.projection;
    const resolution = rt ? rt.resolution : this.renderer.resolution;
    const sx = destinationFrame.width / sourceFrame.width;
    const sy = destinationFrame.height / sourceFrame.height;

    let x = (((rect.x - sourceFrame.x) * sx) + destinationFrame.x) * resolution;
    let y = (((rect.y - sourceFrame.y) * sy) + destinationFrame.y) * resolution;
    let width = rect.width * sx * resolution;
    let height = rect.height * sy * resolution;

    if (transform) {
        x += transform.tx * resolution;
        y += transform.ty * resolution;
    }
    if (!rt) {
        // flipY. In future we'll have it over renderTextures as an option
        y = this.renderer.height - height - y;
    }

    x = Math.round(x);
    y = Math.round(y);
    width = Math.round(width);
    height = Math.round(height);

    this.renderer.gl.scissor(x, y, width, height);
};
