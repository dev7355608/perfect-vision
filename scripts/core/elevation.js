import { Mask, MaskFilter } from "./mask.js";
import { Tiles } from "./tiles.js";

export class Elevation {
    static _normalize(elevation) {
        return ((Number.isFinite(elevation) ? elevation / (1 + Math.abs(elevation)) : Math.sign(elevation)) + 1) * 0.5;
    }

    static getElevation(placeable) {
        let elevation;

        if (placeable instanceof Token) {
            elevation = this.getTokenElevation(placeable);
        } else if (placeable instanceof Tile) {
            elevation = this.getTileElevation(placeable);
        } else if (placeable instanceof MeasuredTemplate) {
            elevation = this.getTemplateElevation(placeable);
        } else {
            elevation = 0.5;
        }

        return elevation;
    }

    static getTokenElevation(token) {
        return this._normalize(token.data.elevation ?? 0);
    }

    static getTileElevation(tile) {
        return Tiles.isOverhead(tile) ? 1 : 0;
    }

    static getTemplateElevation(template) {
        return 0.5;
    }

    static getElevationRange(object, out = undefined) {
        if (!out) {
            out = [0, 1];
        } else {
            out[0] = 0;
            out[1] = 1;
        }

        return out;
    }
}

export class ElevationFilter extends MaskFilter {
    static fragmentSource = `\
        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uElevation;
        uniform vec2 uElevationRange;

        void main()
        {
            float elevation = texture2D(uElevation, vMaskCoord).r;

            if (elevation < 0.0 || uElevationRange.x <= elevation && elevation < uElevationRange.y) {
                gl_FragColor = texture2D(uSampler, vTextureCoord);
            } else {
                gl_FragColor = vec4(0.0);
            }
        }`;

    constructor(object) {
        super(undefined, ElevationFilter.fragmentSource, {
            uElevationRange: new Float32Array(2)
        });

        this.uniforms.uElevation = Mask.getTexture("elevation");

        if (typeof object[0] === "number") {
            this.uniforms.uElevationRange[0] = object[0];
            this.uniforms.uElevationRange[1] = object[1];

            this.object = null;
        } else {
            this.object = object;
        }
    }

    apply(filterManager, input, output, clearMode, currentState) {
        if (this.object) {
            Elevation.getElevationRange(this.object, this.uniforms.uElevationRange);
        }

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}
