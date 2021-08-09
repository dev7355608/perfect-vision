import { Board } from "../board.js";
import { Mask, MaskFilter } from "../mask.js";
import { srgb2rgb } from "../../utils/color.js";

Hooks.on("canvasInit", () => {
    MonoFilter.instance.resolution = canvas.app.renderer.resolution;
    MonoFilter.instance.multisample = PIXI.MSAA_QUALITY.NONE;

    const segment = Board.getSegment(Board.SEGMENTS.LIGHTING);

    segment.filters.push(MonoFilter.instance);
    segment.filterArea = canvas.app.renderer.screen;
});

Hooks.on("lightingRefresh", () => {
    if (canvas.sight.sources.size === 0 && game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision")) {
        MonoFilter.instance.saturation = 1;
    } else {
        MonoFilter.instance.saturation = canvas.lighting._pv_saturationLevel;
    }
});

Hooks.on("sightRefresh", () => {
    let tint;

    if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
        for (const source of canvas.sight.sources) {
            if (!source.active) {
                continue;
            }

            if (source._pv_tintMono !== undefined) {
                if (tint !== undefined && tint !== source._pv_tintMono) {
                    tint = 0xFFFFFF;
                } else {
                    tint = source._pv_tintMono;
                }
            }

            if (tint === 0xFFFFFF) {
                break;
            }
        }
    }

    MonoFilter.instance.tint = tint ?? 0xFFFFFF;
});

export class MonoFilter extends MaskFilter {
    static defaultFragmentSource = `\
        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uIllumination;
        uniform vec3 uColor;
        uniform float uSaturation;

        vec3 rgb2srgb(vec3 c)
        {
            vec3 a = 12.92 * c;
            vec3 b = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
            vec3 s = step(vec3(0.0031308), c);
            return mix(a, b, s);
        }

        vec3 srgb2rgb(vec3 c)
        {
            vec3 a = c / 12.92;
            vec3 b = pow((c + 0.055) / 1.055, vec3(2.4));
            vec3 s = step(vec3(0.04045), c);
            return mix(a, b, s);
        }

        float rgb2y(vec3 c)
        {
            vec3 w = vec3(0.2126, 0.7152, 0.0722);
            return dot(c, w);
        }

        vec3 y2mono(float y, vec3 tint)
        {
            float tintY = rgb2y(tint);
            return mix(
                mix(tint, vec3(1.0), (y - tintY) / (1.0 - mix(tintY, 0.0, step(1.0, tintY)))),
                tint * (y / mix(tintY, 1.0, step(tintY, 0.0))),
                step(y, tintY)
            );
        }

        void main()
        {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uIllumination, vMaskCoord);
            float a = color.a;

            if (a != 0.0) {
                vec3 srgb = color.rgb / a;
                vec3 rgb = srgb2rgb(srgb);
                float y = rgb2y(rgb);
                gl_FragColor = vec4(rgb2srgb(mix(mix(vec3(y), y2mono(y, uColor), mask.g), rgb, max(mask.r, uSaturation))), 1.0) * a;
            } else {
                gl_FragColor = vec4(0.0);
            }
        }`;

    static get instance() {
        if (!this._instance) {
            this._instance = new MonoFilter();
        }

        return this._instance;
    }

    constructor() {
        super(undefined, MonoFilter.defaultFragmentSource, {
            uIllumination: Mask.getTexture("illumination"),
            uColor: new Float32Array(3),
            uSaturation: 1.0
        });

        this._colorDirty = false;

        this.tint = 0xFFFFFF;
    }

    get tint() {
        return this._tint;
    }

    set tint(value) {
        if (this._tint === value) {
            return;
        }

        this._tint = value;
        this._colorDirty = true;
    }

    get saturation() {
        return this.uniforms.uSaturation;
    }

    set saturation(value) {
        this.uniforms.uSaturation = value;
    }

    apply(filterManager, input, output, clearMode, currentState) {
        if (this._colorDirty) {
            this._colorDirty = false;

            const tint = this._tint;
            const color = this.uniforms.uColor;

            color[0] = ((tint >> 16) & 0xFF) / 255;
            color[1] = ((tint >> 8) & 0xFF) / 255;
            color[2] = (tint & 0xFF) / 255;

            srgb2rgb(color, color);
        }

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}
