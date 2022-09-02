const quad = new PIXI.Quad();
const state = new PIXI.State();

state.blend = false;

/**
 * Blurs render textures.
 */
export class TextureBlur {
    /**
     * @type {PIXI.filters.BlurFilterPass}
     * @readonly
     */
    #blurXFilter;
    /**
     * @type {PIXI.filters.BlurFilterPass}
     * @readonly
     */
    #blurYFilter;

    /**
     * @param {number} [strength=8] - The blur strength.
     * @param {number} [quality=4] - The blur quality.
     * @param {number} [kernelSize=5] - The size of the blur kernel.
     */
    constructor(strength = 8, quality = 4, kernelSize = 5) {
        this.#blurXFilter = new PIXI.filters.BlurFilterPass(true, strength, quality, 1, kernelSize);
        this.#blurYFilter = new PIXI.filters.BlurFilterPass(false, strength, quality, 1, kernelSize);
    }

    /**
     * The blur strength.
     * @type {number}
     */
    get blur() {
        return this.#blurXFilter.blur;
    }

    set blur(value) {
        this.#blurXFilter.blur = this.#blurYFilter.blur = value;
    }

    /**
     * The blur quality.
     * @type {number}
     */
    get quality() {
        return this.#blurXFilter.quality;
    }

    set quality(value) {
        this.#blurXFilter.quality = this.#blurYFilter.quality = value;
    }

    /**
     * Apply the blur to the render texture.
     * @param {PIXI.Renderer} renderer - The renderer.
     * @param {PIXI.RenderTexture} texture - The render texture.
     */
    apply(renderer, texture) {
        const baseTexture = texture.baseTexture;

        let flip = texture;
        let flop = renderer.filter.getOptimalFilterTexture(baseTexture.realWidth, baseTexture.realHeight);

        flop.setResolution(baseTexture.resolution);

        renderer.state.set(state);

        [flip, flop] = this.#applyPass(renderer, this.#blurXFilter, flip, flop, texture.frame);
        [flip, flop] = this.#applyPass(renderer, this.#blurYFilter, flip, flop, texture.frame);

        renderer.filter.returnFilterTexture(flop);
    }

    /**
     * Apply the blur pass filter.
     * @param {PIXI.Renderer} renderer - The renderer.
     * @param {PIXI.filters.BlurFilterPass} filter - The filter pass.
     * @param {PIXI.RenderTexture} flip - The flip texture.
     * @param {PIXI.RenderTexture} flop - The flop texture.
     * @param {PIXI.Rectangle} sourceFrame - The source frame.
     */
    #applyPass(renderer, filter, flip, flop, sourceFrame) {
        const strengthPerPass = filter.strength / filter.passes;

        for (let i = 0; i < filter.passes; i++) {
            filter.uniforms.uSampler = flip;
            filter.uniforms.outputFrame = sourceFrame;
            filter.uniforms.strength = strengthPerPass / (filter.horizontal ? flip.width : flip.height);

            const inputSize = filter.uniforms.inputSize ??= new Float32Array(4);

            inputSize[0] = flip.width;
            inputSize[1] = flip.height;
            inputSize[2] = 1.0 / inputSize[0];
            inputSize[3] = 1.0 / inputSize[1];

            renderer.renderTexture.bind(flop, sourceFrame);
            renderer.shader.bind(filter);
            renderer.geometry.bind(quad, filter);
            renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLE_STRIP);

            [flip, flop] = [flop, flip];
        }

        filter.uniforms.uSampler = null;

        return [flip, flop];
    }
}
