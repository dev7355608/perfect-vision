const framePool = [];

export const RenderTargetMixin = Base => class extends Base {
    renderTarget = null;

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
            renderer.batch.flush();

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

            const renderTextureSystem = renderer.renderTexture;
            const filterStack = renderer.filter.defaultFilterStack;

            const currentRenderTexture = renderTextureSystem.current;
            const currentSourceFrame = (framePool.pop() ?? new PIXI.Rectangle()).copyFrom(renderTextureSystem.sourceFrame);
            const currentDestinationFrame = (framePool.pop() ?? new PIXI.Rectangle()).copyFrom(renderTextureSystem.destinationFrame);

            const destinationFrame = renderTargetData?.destinationFrame;

            let renderTargetTexture;
            let renderTexturePool;

            if (renderTargetType === RENDER_TARGET_TYPES.SPRITE) {
                renderTargetTexture = renderTargetObject.texture;
                renderTexturePool = renderTargetData?.texturePool ?? renderer.filter.texturePool;

                if (!renderTargetTexture || renderTargetTexture === PIXI.Texture.EMPTY) {
                    const { width, height } = destinationFrame;
                    const resolution = currentRenderTexture ? currentRenderTexture.resolution : renderer.resolution;
                    const multisample = currentRenderTexture ? currentRenderTexture.multisample : renderer.multisample;

                    renderTargetTexture = renderTexturePool.getOptimalTexture(width, height, resolution, multisample);
                }
            } else {
                renderTargetTexture = renderTargetObject;
            }

            const cachedFilterFrame = renderTargetTexture.filterFrame;
            const sourceFrame = renderTargetTexture.filterFrame ?? renderTargetData?.sourceFrame ?? currentSourceFrame;

            renderTargetTexture.filterFrame = sourceFrame;

            renderTextureSystem.bind(renderTargetTexture, sourceFrame, destinationFrame);
            renderTextureSystem.clear(renderTargetData?.clearColor, renderTargetData?.clearMask);

            if (filterStack.length > 1) {
                filterStack[filterStack.length - 1].renderTexture = renderTargetTexture;
            }

            super.render(renderer);

            renderer.batch.flush();
            renderer.framebuffer.blit();

            if (filterStack.length > 1) {
                filterStack[filterStack.length - 1].renderTexture = currentRenderTexture;
            }

            renderTextureSystem.bind(currentRenderTexture, currentSourceFrame, currentDestinationFrame);

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

                    renderTexturePool.returnTexture(renderTargetTexture);
                } else {
                    renderTargetObject.render(renderer);
                }
            }

            renderTargetTexture.filterFrame = cachedFilterFrame;
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
    isRenderTargetData = true;
    renderTargetObject;
    type = RENDER_TARGET_TYPES.NONE;
    autoDetect = true;
    enabled = true;
    clearColor = undefined;
    clearMask = PIXI.BUFFER_BITS.COLOR | PIXI.BUFFER_BITS.DEPTH;
    sourceFrame = null;
    destinationFrame = null;
    texturePool = null;

    constructor(renderTargetObject) {
        this.renderTargetObject = renderTargetObject;
    }
}

export const RENDER_TARGET_TYPES = Object.freeze({
    NONE: 0,
    TEXTURE: 1,
    SPRITE: 2
});
