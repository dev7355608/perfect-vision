import { Mask, MaskData, MaskFilter } from "./mask.js";

export class Tiles {
    static isOverhead(tile) {
        return tile.data.overhead;
    }

    static getOcclusionMask(tile) {
        if (tile._original || !this.isOverhead(tile)) {
            return;
        }

        if (tile.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
            return "occlusionRadial";
        }
    }

    static getOcclusionMaskTexture(tile) {
        const name = this.getOcclusionMask(tile);

        if (!name) {
            return;
        }

        return Mask.getTexture(name);
    }

    static getOcclusionMaskData(tile) {
        const name = this.getOcclusionMask(tile);

        if (!name) {
            return null;
        }

        return new TileOcclusionMaskData(name, tile);
    }

    static getAlpha(tile, invert = false) {
        let alpha = tile.tile.alpha;

        if (this.getOcclusionMask(tile)) {
            alpha *= tile.data.alpha;
        }

        return invert ? 1.0 - alpha : alpha;
    }

    static getOcclusionAlpha(tile, invert = false) {
        let alpha = tile.tile.alpha;

        if (this.getOcclusionMask(tile)) {
            alpha *= tile.data.occlusion.alpha;
        }

        return invert ? 1.0 - alpha : alpha;
    }

    static isVisible(tile, invertAlpha = false) {
        if (!tile.visible || !tile.renderable || !tile.tile || !tile.tile.parent || !tile.tile.visible || !tile.tile.renderable) {
            return false;
        }

        const alpha = this.getAlpha(tile, invertAlpha);
        const occlusionAlpha = this.getOcclusionAlpha(tile, invertAlpha);

        return alpha > 0 || occlusionAlpha > 0;
    }
}

class TileOcclusionMaskData extends MaskData {
    constructor(name, tile) {
        super(name, new TileOcclusionMaskFilter(tile));
    }

    get enabled() {
        return canvas.tokens.controlled.length !== 0;
    }

    set enabled(value) { }
}

class TileOcclusionMaskFilter extends MaskFilter {
    static fragmentSource = `\
        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;
        uniform float uAlpha1;
        uniform float uAlpha2;

        void main()
        {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uMask, vMaskCoord);
            gl_FragColor = color * mix(uAlpha2, uAlpha1, mask.r);
        }`;

    static defaultUniforms() {
        return {
            uAlpha1: 1.0,
            uAlpha2: 0.0
        };
    }

    constructor(tile) {
        super(undefined, TileOcclusionMaskFilter.fragmentSource, TileOcclusionMaskFilter.defaultUniforms());

        this.tile = tile;
    }

    apply(filterManager, input, output, clearMode, currentState) {
        this.uniforms.uAlpha1 = this.tile.data.alpha;
        this.uniforms.uAlpha2 = this.tile.data.occlusion.alpha;

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}
