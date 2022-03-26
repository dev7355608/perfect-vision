import { MaskFilter } from "../utils/mask-filter.js";
import { srgb2rgb } from "../utils/color.js";
import { LightingSystem } from "./lighting-system.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";

function updateMonoFilter() {
    let tint;
    let defaultTint;

    for (const source of canvas.sight.sources) {
        if (!source.active || source.destroyed) {
            continue;
        }

        if (defaultTint === undefined) {
            defaultTint = foundry.utils.colorStringToHex(game.settings.get("perfect-vision", "monoVisionColor"));
        }

        if (source._pv_tintMono !== undefined) {
            if (tint !== undefined && tint !== source._pv_tintMono) {
                tint = defaultTint;
            } else {
                tint = source._pv_tintMono;
            }
        }

        if (tint === defaultTint) {
            break;
        }
    }

    MonoFilter.instance.tint = tint ?? defaultTint ?? 0xFFFFFF;
    MonoFilter.instance.enabled = !LightingSystem.instance.getRegion("Scene").vision || !(game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision"));
}

Hooks.on("lightingRefresh", () => {
    updateMonoFilter();
});

Hooks.on("sightRefresh", () => {
    updateMonoFilter();
});

export class MonoFilter extends MaskFilter {
    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform vec3 uColor;
        uniform float uSaturation;
        uniform sampler2D uSampler;
        uniform sampler2D uSampler1;
        uniform sampler2D uSampler2;
        uniform sampler2D uSampler3;

        vec3 rgb2srgb(vec3 c) {
            vec3 a = 12.92 * c;
            vec3 b = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
            vec3 s = step(vec3(0.0031308), c);
            return mix(a, b, s);
        }

        vec3 srgb2rgb(vec3 c) {
            vec3 a = c / 12.92;
            vec3 b = pow((c + 0.055) / 1.055, vec3(2.4));
            vec3 s = step(vec3(0.04045), c);
            return mix(a, b, s);
        }

        float rgb2y(vec3 c) {
            vec3 w = vec3(0.2126, 0.7152, 0.0722);
            return dot(c, w);
        }

        vec3 y2mono(float y, vec3 tint) {
            float tintY = rgb2y(tint);
            return mix(
                mix(tint, vec3(1.0), (y - tintY) / (1.0 - mix(tintY, 0.0, step(1.0, tintY)))),
                tint * (y / mix(tintY, 1.0, step(tintY, 0.0))),
                step(y, tintY)
            );
        }

        void main() {
            vec4 color = texture2D(uSampler, vTextureCoord);
            float a = color.a;

            if (a != 0.0) {
                vec4 v = texture2D(uSampler1, vMaskCoord);
                vec4 w = texture2D(uSampler2, vMaskCoord);
                vec4 u = texture2D(uSampler3, vMaskCoord);
                vec3 srgb = color.rgb / a;
                vec3 rgb = srgb2rgb(srgb);
                float y = rgb2y(rgb);
                float s = min(min(v.r, v.g), u.b);
                float t2 = max(min(s, max(w.g, v.b)), u.g);
                float t1 = 1.0 - s;
                gl_FragColor = vec4(rgb2srgb(mix(mix(y2mono(y, uColor), vec3(y), t1), rgb, t2)), 1.0) * a;
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
        super(undefined, MonoFilter.fragmentSrc, {
            uColor: new Float32Array(3),
            uSampler1: PIXI.Texture.EMPTY,
            uSampler2: PIXI.Texture.EMPTY,
            uSampler3: PIXI.Texture.EMPTY
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

    apply(filterManager, input, output, clearMode, currentState) {
        const uniforms = this.uniforms;

        if (this._colorDirty) {
            this._colorDirty = false;

            const tint = this._tint;
            const color = this.uniforms.uColor;

            color[0] = ((tint >> 16) & 0xFF) / 255;
            color[1] = ((tint >> 8) & 0xFF) / 255;
            color[2] = (tint & 0xFF) / 255;

            srgb2rgb(color, color);
        }

        const textures = CanvasFramebuffer.get("lighting").textures;

        uniforms.uSampler1 = textures[0];
        uniforms.uSampler2 = textures[1];
        uniforms.uSampler3 = textures[2];

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}
