import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.FilterSystem.prototype.push (OVERRIDE)");

PIXI.FilterSystem.prototype.push = function (target, filters) {
    const renderer = this.renderer;
    const filterStack = this.defaultFilterStack;
    const state = this.statePool.pop() || new PIXI.FilterState();
    const renderTextureSystem = this.renderer.renderTexture;

    let resolution = filters[0].resolution;
    let multisample = filters[0].multisample;
    let padding = filters[0].padding;
    let autoFit = filters[0].autoFit;
    let legacy = filters[0].legacy;

    for (let i = 1; i < filters.length; i++) {
        const filter = filters[i];

        // let's use the lowest resolution
        resolution = Math.min(resolution, filter.resolution);
        // let's use the lowest number of samples
        multisample = Math.min(multisample, filter.multisample);
        // figure out the padding required for filters
        padding = this.useMaxPadding
            // old behavior: use largest amount of padding!
            ? Math.max(padding, filter.padding)
            // new behavior: sum the padding
            : padding + filter.padding;
        // only auto fit if all filters are autofit
        autoFit = autoFit && filter.autoFit;

        legacy = legacy || filter.legacy;
    }

    if (filterStack.length === 1) {
        this.defaultFilterStack[0].renderTexture = renderTextureSystem.current;
    }

    filterStack.push(state);

    state.resolution = resolution;
    state.multisample = multisample;

    state.legacy = legacy;

    state.target = target;
    state.sourceFrame.copyFrom(target.filterArea || target.getBounds(true));

    state.sourceFrame.pad(padding);

    if (autoFit) {
        const sourceFrameProjected = this.tempRect.copyFrom(renderTextureSystem.sourceFrame);

        // Project source frame into world space (if projection is applied)
        if (renderer.projection.transform) {
            this.transformAABB(
                tempMatrix.copyFrom(renderer.projection.transform).invert(),
                sourceFrameProjected
            );
        }

        state.sourceFrame.fit(sourceFrameProjected);
    }

    // Round sourceFrame in screen space based on render-texture.
    this.roundFrame(
        state.sourceFrame,
        renderTextureSystem.current ? renderTextureSystem.current.resolution : renderer.resolution,
        renderTextureSystem.sourceFrame,
        renderTextureSystem.destinationFrame,
        renderer.projection.transform,
    );

    state.renderTexture = this.getOptimalFilterTexture(state.sourceFrame.width, state.sourceFrame.height,
        resolution, multisample);
    state.filters = filters;

    state.destinationFrame.width = state.renderTexture.width;
    state.destinationFrame.height = state.renderTexture.height;

    const destinationFrame = this.tempRect;

    destinationFrame.x = 0;
    destinationFrame.y = 0;
    destinationFrame.width = state.sourceFrame.width;
    destinationFrame.height = state.sourceFrame.height;

    state.renderTexture.filterFrame = state.sourceFrame;
    state.bindingSourceFrame.copyFrom(renderTextureSystem.sourceFrame);
    state.bindingDestinationFrame.copyFrom(renderTextureSystem.destinationFrame);

    state.transform = renderer.projection.transform;
    renderer.projection.transform = null;
    renderTextureSystem.bind(state.renderTexture, state.sourceFrame, destinationFrame);
    renderer.framebuffer.clear(0, 0, 0, 0);
};

Logger.debug("Patching PIXI.FilterSystem.prototype.pop (OVERRIDE)");

PIXI.FilterSystem.prototype.pop = function () {
    const filterStack = this.defaultFilterStack;
    const state = filterStack.pop();
    const filters = state.filters;

    this.activeState = state;

    const globalUniforms = this.globalUniforms.uniforms;

    globalUniforms.outputFrame = state.sourceFrame;
    globalUniforms.resolution = state.resolution;

    const inputSize = globalUniforms.inputSize;
    const inputPixel = globalUniforms.inputPixel;
    const inputClamp = globalUniforms.inputClamp;

    inputSize[0] = state.destinationFrame.width;
    inputSize[1] = state.destinationFrame.height;
    inputSize[2] = 1.0 / inputSize[0];
    inputSize[3] = 1.0 / inputSize[1];

    inputPixel[0] = Math.round(inputSize[0] * state.resolution);
    inputPixel[1] = Math.round(inputSize[1] * state.resolution);
    inputPixel[2] = 1.0 / inputPixel[0];
    inputPixel[3] = 1.0 / inputPixel[1];

    inputClamp[0] = 0.5 * inputPixel[2];
    inputClamp[1] = 0.5 * inputPixel[3];
    inputClamp[2] = (state.sourceFrame.width * inputSize[2]) - (0.5 * inputPixel[2]);
    inputClamp[3] = (state.sourceFrame.height * inputSize[3]) - (0.5 * inputPixel[3]);

    // only update the rect if its legacy..
    if (state.legacy) {
        const filterArea = globalUniforms.filterArea;

        filterArea[0] = state.destinationFrame.width;
        filterArea[1] = state.destinationFrame.height;
        filterArea[2] = state.sourceFrame.x;
        filterArea[3] = state.sourceFrame.y;

        globalUniforms.filterClamp = globalUniforms.inputClamp;
    }

    this.globalUniforms.update();

    const lastState = filterStack[filterStack.length - 1];

    this.renderer.framebuffer.blit();

    if (filters.length === 1) {
        filters[0].apply(this, state.renderTexture, lastState.renderTexture, PIXI.CLEAR_MODES.BLEND, state);

        this.returnFilterTexture(state.renderTexture);
    }
    else {
        let flip = state.renderTexture;
        let flop = this.getOptimalFilterTexture(
            flip.width,
            flip.height,
            state.resolution
        );

        flop.filterFrame = flip.filterFrame;

        let i = 0;

        for (i = 0; i < filters.length - 1; ++i) {
            if (i === 1 && state.multisample > 1) {
                flop = this.getOptimalFilterTexture(
                    flip.width,
                    flip.height,
                    state.resolution
                );

                flop.filterFrame = flip.filterFrame;
            }

            filters[i].apply(this, flip, flop, PIXI.CLEAR_MODES.CLEAR, state);

            const t = flip;

            flip = flop;
            flop = t;
        }

        filters[i].apply(this, flip, lastState.renderTexture, PIXI.CLEAR_MODES.BLEND, state);

        if (i > 1 && state.multisample > 1) {
            this.returnFilterTexture(state.renderTexture);
        }

        this.returnFilterTexture(flip);
        this.returnFilterTexture(flop);
    }

    // lastState.renderTexture is blitted when lastState is popped

    state.clear();
    this.statePool.push(state);
};

Logger.debug("Patching PIXI.FilterSystem.prototype.getOptimalFilterTexture (OVERRIDE)");

PIXI.FilterSystem.prototype.getOptimalFilterTexture = function (minWidth, minHeight, resolution = 1, multisample = PIXI.MSAA_QUALITY.NONE) {
    return this.texturePool.getOptimalTexture(minWidth, minHeight, resolution, multisample);
};

Logger.debug("Patching PIXI.FilterSystem.prototype.getFilterTexture (OVERRIDE)");

PIXI.FilterSystem.prototype.getFilterTexture = function (input, resolution, multisample) {
    if (typeof input === 'number') {
        const swap = input;

        input = resolution;
        resolution = swap;
    }

    input = input || this.activeState.renderTexture;

    const filterTexture = this.texturePool.getOptimalTexture(input.width, input.height, resolution || input.resolution,
        multisample || PIXI.MSAA_QUALITY.NONE);

    filterTexture.filterFrame = input.filterFrame;

    return filterTexture;
};
