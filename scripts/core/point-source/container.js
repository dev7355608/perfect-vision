import { CanvasFramebuffer } from "../../utils/canvas-framebuffer.js";
import { ViewportTextureContainer } from "../../utils/viewport-texture.js";

export const PointSourceContainer = ViewportTextureContainer;

export class IlluminationPointSourceContainer extends PointSourceContainer {
    #lastBlendMode;

    _render(renderer) {
        this.#lastBlendMode = undefined;

        super._render(renderer);
    }

    _getViewportTexture(renderer, object, skipUpdate) {
        const blendMode = object?.blendMode;
        const texture = super._getViewportTexture(renderer, undefined,
            skipUpdate ?? (blendMode !== undefined && (this.#lastBlendMode ?? blendMode) === blendMode)
        ) ?? CanvasFramebuffer.get("lighting").textures[3];

        this.#lastBlendMode = blendMode;

        return texture;
    }
}
