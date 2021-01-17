import { extend } from "./extend.js";
import { texture } from "./mask.js";

class MaskFilter extends PIXI.Filter {
    constructor(channel = "mask", bg = "vec4(0.0)", ...args) {
        super(
            `\
            precision mediump float;

            attribute vec2 aVertexPosition;

            uniform mat3 projectionMatrix;
            uniform vec4 inputSize;
            uniform vec4 outputFrame;
            uniform vec4 uMaskSize;

            varying vec2 vTextureCoord;
            varying vec2 vMaskCoord;

            void main(void)
            {
                vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
                gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
                vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
                vMaskCoord = position * uMaskSize.zw;
            }`, `\
            precision mediump float;

            varying vec2 vTextureCoord;
            varying vec2 vMaskCoord;

            uniform sampler2D uSampler;
            uniform sampler2D uMask;

            void main(void)
            {
                vec4 color = texture2D(uSampler, vTextureCoord);
                vec4 mask = texture2D(uMask, vMaskCoord);
                float r = mask.r;
                float g = mask.g;
                float b = mask.b;
                float a = mask.a;
                gl_FragColor = mix((${bg}), color, (${channel}));
            }`,
            ...args
        );

        this.uniforms.uMaskSize = new Float32Array(4);
    }

    apply(filterManager, input, output, clearMode) {
        this.uniforms.uMask = texture;

        const maskSize = this.uniforms.uMaskSize;
        maskSize[0] = texture.width;
        maskSize[1] = texture.height;
        maskSize[2] = 1 / texture.width;
        maskSize[3] = 1 / texture.height;

        filterManager.applyFilter(this, input, output, clearMode);
    }
}

class MonoFilter extends PIXI.Filter {
    constructor(...args) {
        super(
            `\
            precision mediump float;

            attribute vec2 aVertexPosition;

            uniform mat3 projectionMatrix;
            uniform vec4 inputSize;
            uniform vec4 outputFrame;
            uniform vec4 uMaskSize;

            varying vec2 vTextureCoord;
            varying vec2 vMaskCoord;

            void main(void)
            {
                vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
                gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
                vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
                vMaskCoord = position * uMaskSize.zw;
            }`, `\
            precision mediump float;

            uniform sampler2D uSampler;
            uniform sampler2D uMask;
            uniform vec3 uTint;
            uniform float uSaturation;

            varying vec2 vTextureCoord;
            varying vec2 vMaskCoord;

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

            void main(void)
            {
                vec4 mask = texture2D(uMask, vMaskCoord);
                vec4 srgba = texture2D(uSampler, vTextureCoord);
                vec3 srgb = srgba.rgb;
                vec3 rgb = srgb2rgb(srgb);
                float a = srgba.a;
                float y = rgb2y(rgb);
                vec3 tint = srgb2rgb(uTint);
                gl_FragColor = vec4(rgb2srgb(mix(mix(vec3(y), y2mono(y, tint), mask.a), rgb, max(mask.r, uSaturation))), a);
            }`,
            ...args
        );

        this.uniforms.uMaskSize = new Float32Array(4);
        this.uniforms.uTint = new Float32Array(3);
        this.uniforms.uSaturation = 1;
    }

    apply(filterManager, input, output, clearMode) {
        this.uniforms.uMask = texture;

        const maskSize = this.uniforms.uMaskSize;
        maskSize[0] = texture.width;
        maskSize[1] = texture.height;
        maskSize[2] = 1 / texture.width;
        maskSize[3] = 1 / texture.height;

        filterManager.applyFilter(this, input, output, clearMode);
    }
}

export const background = new MaskFilter("step(1.0, 1.0 - r)");

export const vision = new MaskFilter("step(1.0, g)");

export const visionMax = new MaskFilter("step(1.0, g)");

export const visionMin = new MaskFilter("step(1.0, g)", "vec4(1.0)");

export const light = new MaskFilter("step(1.0, b)");

export const sight = new MaskFilter("max(r, g)");

export const fog = new MaskFilter("1.0 - max(r, g)");

export const mono = new MonoFilter();
// Remove as soon as pixi.js fixes the auto fit bug.
export const mono_noAutoFit = new Proxy(mono, {
    get(target, prop, receiver) {
        if (prop === "autoFit")
            return false;
        return Reflect.get(...arguments);
    }
});

Hooks.on("canvasInit", () => {
    visionMax.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    visionMin.blendMode = PIXI.BLEND_MODES.MIN_COLOR;
    light.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    background.resolution = canvas.app.renderer.resolution;
    vision.resolution = canvas.app.renderer.resolution;
    visionMax.resolution = canvas.app.renderer.resolution;
    visionMin.resolution = canvas.app.renderer.resolution;
    light.resolution = canvas.app.renderer.resolution;
    sight.resolution = canvas.app.renderer.resolution;
    fog.resolution = canvas.app.renderer.resolution;
    mono.resolution = canvas.app.renderer.resolution;
});

Hooks.on("lightingRefresh", () => {
    if (canvas.sight.sources.size === 0 && game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision")) {
        mono.uniforms.uSaturation = 1;
    } else {
        mono.uniforms.uSaturation = 1 - canvas.lighting.darknessLevel;
    }
});

const DEFAULT_VISION_COLOR = [1, 1, 1];

Hooks.on("sightRefresh", () => {
    let monoVisionColor;

    if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
        for (const source of canvas.sight.sources) {
            if (!source.active) continue;

            const source_ = extend(source);

            if (source_.monoVisionColor) {
                if (monoVisionColor && !(
                    monoVisionColor[0] === source_.monoVisionColor[0] &&
                    monoVisionColor[1] === source_.monoVisionColor[1] &&
                    monoVisionColor[2] === source_.monoVisionColor[2])) {
                    monoVisionColor = DEFAULT_VISION_COLOR;
                } else {
                    monoVisionColor = source_.monoVisionColor;
                }
            }
        }

        sight.enabled = true;
    } else {
        sight.enabled = false;
    }

    monoVisionColor = monoVisionColor ?? DEFAULT_VISION_COLOR;

    mono.uniforms.uTint[0] = monoVisionColor[0];
    mono.uniforms.uTint[1] = monoVisionColor[1];
    mono.uniforms.uTint[2] = monoVisionColor[2];
});
