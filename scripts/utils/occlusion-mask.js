const occlusionMaskStatePool = [];
const tempRect = new PIXI.Rectangle();

export const OcclusionMaskMixin = Base => class extends Base {
    occlusionObjects = null;

    _render(renderer) {
        renderer.batch.flush();

        const occlusionMaskState = this.#renderOcclusionMask(renderer);

        super._render(renderer);

        this.#returnOcclusionMask(renderer, occlusionMaskState);
    }

    #renderOcclusionMask(renderer) {
        const shader = this.shader;

        if (!("occlusionMask" in shader)) {
            return;
        }

        const renderTextureSystem = renderer.renderTexture;
        const currentRenderTexture = renderTextureSystem.current;

        let bounds;
        let occlusionMaskState;
        let activeOcclusionObjects;
        let occlusionSourceFrame;
        let noMultisample = true;

        const occlusionObjects = this.occlusionObjects;

        if (occlusionObjects) {
            for (const occlusionObject of occlusionObjects) {
                if (occlusionObject.destroyed || !occlusionObject.visible || !occlusionObject.renderable || occlusionObject.worldAlpha <= 0) {
                    continue;
                }

                bounds = bounds ?? this.getBounds(true, tempRect).fit(renderTextureSystem.sourceFrame);

                const occlusionObjectBounds = occlusionObject.getBounds(true);

                if (!occlusionObjectBounds.intersects(bounds)) {
                    continue;
                }

                if (occlusionMaskState) {
                    occlusionSourceFrame.enlarge(occlusionObjectBounds);
                } else {
                    occlusionMaskState = occlusionMaskStatePool.pop() ?? new OcclusionMaskState();
                    occlusionSourceFrame = occlusionMaskState.occlusionSourceFrame.copyFrom(occlusionObjectBounds);
                    activeOcclusionObjects = occlusionMaskState.occlusionObjects;
                }

                activeOcclusionObjects.push(occlusionObject);

                noMultisample = noMultisample && occlusionObject.isSprite;
            }
        }

        if (!occlusionMaskState) {
            shader.occlusionMask = PIXI.Texture.WHITE;

            return;
        }

        renderer.batch.flush();

        const filterStack = renderer.filter.defaultFilterStack;

        const currentSourceFrame = occlusionMaskState.currentSourceFrame.copyFrom(renderTextureSystem.sourceFrame);
        const currentDestinationFrame = occlusionMaskState.currentDestinationFrame.copyFrom(renderTextureSystem.destinationFrame);

        const resolution = currentRenderTexture ? currentRenderTexture.resolution : renderer.resolution;
        const multisample = noMultisample ? PIXI.MSAA_QUALITY.NONE : (currentRenderTexture ? currentRenderTexture.multisample : renderer.multisample);

        occlusionSourceFrame.fit(bounds);
        occlusionSourceFrame.ceil(resolution);

        const padding = 1 / resolution;
        const occlusionDestinationFrame = occlusionMaskState.occlusionDestinationFrame;

        occlusionDestinationFrame.x = padding;
        occlusionDestinationFrame.y = padding;
        occlusionDestinationFrame.width = occlusionSourceFrame.width;
        occlusionDestinationFrame.height = occlusionSourceFrame.height;

        occlusionSourceFrame.pad(padding);

        const occlusionTexture = occlusionMaskState.occlusionTexture = renderer.filter.texturePool.getOptimalTexture(
            occlusionSourceFrame.width,
            occlusionSourceFrame.height,
            resolution,
            multisample);

        occlusionTexture.filterFrame = occlusionSourceFrame;

        renderTextureSystem.bind(occlusionTexture, occlusionSourceFrame, occlusionDestinationFrame);
        renderer.framebuffer.clear(1, 1, 1, 1);

        if (filterStack.length > 1) {
            filterStack[filterStack.length - 1].renderTexture = occlusionTexture;
        }

        for (const occlusionObject of activeOcclusionObjects) {
            occlusionObject.render(renderer);
        }

        renderer.batch.flush();
        renderer.framebuffer.blit();

        if (filterStack.length > 1) {
            filterStack[filterStack.length - 1].renderTexture = currentRenderTexture;
        }

        renderTextureSystem.bind(currentRenderTexture, currentSourceFrame, currentDestinationFrame);

        shader.occlusionMask = occlusionTexture;

        return occlusionMaskState;
    }

    #returnOcclusionMask(renderer, occlusionMaskState) {
        if (occlusionMaskState) {
            this.shader.occlusionMask = PIXI.Texture.WHITE;

            renderer.filter.texturePool.returnTexture(occlusionMaskState.occlusionTexture);

            occlusionMaskState.occlusionTexture.filterFrame = null;
            occlusionMaskState.occlusionTexture = null;
            occlusionMaskState.occlusionObjects.length = 0;

            occlusionMaskStatePool.push(occlusionMaskState);
        }
    }

    destroy(options) {
        this.occlusionObjects = null;

        super.destroy(options);
    }
}

class OcclusionMaskState {
    occlusionTexture = null;
    occlusionObjects = [];
    occlusionSourceFrame = new PIXI.Rectangle();
    occlusionDestinationFrame = new PIXI.Rectangle();
    currentSourceFrame = new PIXI.Rectangle();
    currentDestinationFrame = new PIXI.Rectangle();
}
