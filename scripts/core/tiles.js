import { Mask, MaskFilter } from "./mask.js";

export class Tiles {
    static isOverhead(tile) {
        return tile.data.overhead;
    }

    static getOcclusionMaskTexture(tile) {
        if (tile._original || !this.isOverhead(tile)) {
            return;
        }

        if (tile.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
            return Mask.getTexture("occlusionRadial");
        }
    }

    static getOcclusionMask(tile) {
        let maskData = null;

        const mask = this.getOcclusionMaskTexture(tile);

        if (mask) {
            maskData = new PIXI.MaskData(new PIXI.Sprite(mask));
            maskData.filter = new TileOcclusionMaskFilter(tile);
            maskData.resolution = null;
            maskData.multisample = PIXI.MSAA_QUALITY.NONE;
        }

        return maskData;
    }

    static getAlpha(tile, invert = false) {
        let alpha = tile.tile.alpha;

        if (this.getOcclusionMaskTexture(tile)) {
            alpha *= tile.data.alpha;
        }

        return invert ? 1.0 - alpha : alpha;
    }

    static getOcclusionAlpha(tile, invert = false) {
        let alpha = tile.tile.alpha;

        if (this.getOcclusionMaskTexture(tile)) {
            alpha *= tile.data.occlusion.alpha;
        }

        return invert ? 1.0 - alpha : alpha;
    }

    static isVisible(tile, invertAlpha = false) {
        if (!tile.visible || !tile.renderable || !tile.tile || !tile.tile.visible || !tile.tile.renderable) {
            return false;
        }

        const alpha = this.getAlpha(tile, invertAlpha);
        const occlusionAlpha = this.getOcclusionAlpha(tile, invertAlpha);

        return alpha !== 0 || occlusionAlpha !== 0;
    }
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

    get enabled() {
        return canvas.tokens.controlled?.length > 0;
    }

    set enabled(value) { }

    apply(filterManager, input, output, clearMode) {
        this.uniforms.uAlpha1 = this.tile.data.alpha;
        this.uniforms.uAlpha2 = this.tile.data.occlusion.alpha;

        super.apply(filterManager, input, output, clearMode);
    }
}
