const framePool = [];

export const RenderTargetMixin = Base => class extends Base {
    render(renderer) {
        let renderTargetData = this.renderTarget;
        let renderTargetObject;

        if (renderTargetData) {
            if (renderTargetData.isRenderTargetData) {
                renderTargetObject = renderTargetData.renderTargetObject;
            } else {
                renderTargetObject = renderTargetData;
                renderTargetData = null;
            }
        }

        if (renderTargetObject && (!renderTargetData || renderTargetData.enabled)) {
            let renderTargetType;

            if (!renderTargetData || renderTargetData.autoDetect) {
                if (renderTargetObject.isSprite) {
                    renderTargetType = RENDER_TARGET_TYPES.SPRITE;
                } else {
                    renderTargetType = RENDER_TARGET_TYPES.TEXTURE;
                }
            } else {
                renderTargetType = renderTargetData.type;
            }

            const rt = renderer.renderTexture;
            const fs = renderer.filter.defaultFilterStack;

            const currentRenderTexture = rt.current;
            const currentSourceFrame = (framePool.pop() ?? new PIXI.Rectangle()).copyFrom(rt.sourceFrame);
            const currentDestinationFrame = (framePool.pop() ?? new PIXI.Rectangle()).copyFrom(rt.destinationFrame);

            let renderTargetTexture;

            if (renderTargetType === RENDER_TARGET_TYPES.SPRITE) {
                renderTargetTexture = renderTargetObject.texture;

                if (!renderTargetTexture || renderTargetTexture === PIXI.Texture.EMPTY) {
                    const { width, height } = currentDestinationFrame;
                    const resolution = currentRenderTexture ? currentRenderTexture.resolution : renderer.resolution;
                    const multisample = currentRenderTexture ? currentRenderTexture.multisample : renderer.multisample;

                    renderTargetTexture = renderer.filter.getOptimalFilterTexture(width, height, resolution, multisample);
                }
            } else {
                renderTargetTexture = renderTargetObject;
            }

            renderer.batch.flush();

            rt.bind(renderTargetTexture, renderTargetData.sourceFrame ?? currentSourceFrame, renderTargetData.destinationFrame);
            rt.clear(renderTargetData?.clearColor, renderTargetData?.clearMask);

            if (fs.length > 1) {
                fs[fs.length - 1].renderTexture = renderTargetTexture;
            }

            super.render(renderer);

            renderer.batch.flush();
            renderer.framebuffer.blit();

            if (fs.length > 1) {
                fs[fs.length - 1].renderTexture = currentRenderTexture;
            }

            rt.bind(currentRenderTexture, currentSourceFrame, currentDestinationFrame);

            framePool.push(currentSourceFrame, currentDestinationFrame);

            if (renderTargetType === RENDER_TARGET_TYPES.SPRITE) {
                if (!renderTargetObject.texture || renderTargetObject.texture === PIXI.Texture.EMPTY) {
                    const cacheTexture = renderTargetObject.texture;

                    renderTargetObject.texture = renderTargetTexture;

                    const cacheParent = renderTargetObject.enableTempParent();

                    renderTargetObject.updateTransform();
                    renderTargetObject.disableTempParent(cacheParent);
                    renderTargetObject.render(renderer);
                    renderTargetObject.texture = cacheTexture;

                    renderer.filter.returnFilterTexture(renderTargetTexture);
                } else {
                    renderTargetObject.render(renderer);
                }
            }
        } else {
            super.render(renderer);
        }
    }

    destroy(options) {
        this.renderTarget = null;

        super.destroy(options);
    }
};

export class RenderTargetData {
    constructor(renderTargetObject) {
        this.isRenderTargetData = true;
        this.renderTargetObject = renderTargetObject;
        this.type = RENDER_TARGET_TYPES.NONE;
        this.autoDetect = true;
        this.enabled = true;
        this.clearColor = undefined;
        this.clearMask = PIXI.BUFFER_BITS.COLOR | PIXI.BUFFER_BITS.DEPTH;
        this.sourceFrame = null;
        this.destinationFrame = null;
    }
}

const RENDER_TARGET_TYPES = Object.freeze({
    NONE: 0,
    TEXTURE: 1,
    SPRITE: 2
});
