import { extend } from "./extend.js";
import { patch } from "./patch.js";

const mask = new PIXI.Container();

mask.background = mask.addChild(new PIXI.Graphics());
mask.layers = [
    new PIXI.Container(),
    new PIXI.Container(),
    new PIXI.Container()
];
mask.addChild(
    mask.layers[0],
    mask.layers[1],
    mask.layers[2]
);

mask.msk = mask.addChild(new PIXI.Graphics());
mask.mask = mask.msk;

var dirty;

export const texture = PIXI.RenderTexture.create();

export function visualize() {
    const dataUrl = canvas.app.renderer.extract.canvas(texture).toDataURL("image/png");
    const w = window.open();
    w.document.open();
    w.document.write(`<html><body style="margin:0;background-image:linear-gradient(45deg, #ccc 25%, transparent 25%),linear-gradient(135deg, #ccc 25%, transparent 25%),linear-gradient(45deg, transparent 75%, #ccc 75%),linear-gradient(135deg, transparent 75%, #ccc 75%);background-size: 2em 2em;background-position:0 0, 1em 0, 1em -1em, 0 -1em;"><iframe src="${dataUrl}" width="100%" height="100%" frameborder="0" scrolling="no"></iframe></body></html>`);
    w.document.close();
}

export class BaseFilter extends PIXI.Filter {
    constructor(fragmentSource, ...args) {
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
            }`,
            fragmentSource, ...args
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

export class Filter extends BaseFilter {
    constructor(channel = "mask", bg = "vec4(0.0)", ...args) {
        super(
            `\
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
    }
}

function render() {
    if (dirty && canvas?.ready) {
        dirty = false;

        const stage = canvas.stage;

        mask.position.copyFrom(stage.position);
        mask.pivot.copyFrom(stage.pivot);
        mask.scale.copyFrom(stage.scale);
        mask.skew.copyFrom(stage.skew);
        mask.rotation = stage.rotation;

        const renderer = canvas.app.renderer;
        const screen = renderer.screen;
        const resolution = Math.pow(2, Math.floor(Math.log2(renderer.resolution)));
        const width = screen.width;
        const height = screen.height;

        if (texture.resolution !== resolution) {
            texture.setResolution(resolution);
        }

        if (texture.width !== width || texture.height !== height) {
            texture.resize(width, height);
        }

        if (mask.filter instanceof GlowFilter)
            mask.filter.uniforms.uStrength = canvas.sight.filter.blur / 4;

        canvas.app.renderer.render(mask, texture, true, undefined, false);
    }
}

Hooks.once("init", () => {
    patch("PointSource.prototype.drawLight", "POST", function (c) {
        const this_ = extend(this);

        const ilm = canvas.lighting.illumination;
        const ilm_ = extend(ilm);

        const c_ = extend(c);

        if (this.sourceType === "sight" || this_.isVision) {
            if (this_.fovMono) {
                if (!c_.fovMono)
                    c_.fovMono = new PIXI.Graphics();

                c_.fovMono.clear().beginFill(0x00FF00, 1.0).drawPolygon(this_.fovMono).endFill();
            } else if (c_.fovMono) {
                c_.fovMono.destroy();
                c_.fovMono = null;
            }

            if (this_.fovColor) {
                if (!c_.fovColor) {
                    c_.fovColor = new PIXI.Graphics();
                    c_.fovColor.blendMode = PIXI.BLEND_MODES.ADD;
                }

                c_.fovColor.clear().beginFill(0xFF0000, 1.0).drawPolygon(this_.fovColor).endFill();
            } else if (c_.fovColor) {
                c_.fovColor.destroy();
                c_.fovColor = null;
            }

            if (this_.fovDimToBright) {
                if (!c_.fovDimToBright) {
                    c_.fovDimToBright = new PIXI.Graphics();
                    c_.fovDimToBright.blendMode = PIXI.BLEND_MODES.ADD;
                }

                c_.fovDimToBright.clear().beginFill(0x0000FF, 1.0).drawPolygon(this_.fovDimToBright).endFill();
            } else if (c_.fovDimToBright) {
                c_.fovDimToBright.destroy();
                c_.fovDimToBright = null;
            }
        } else {
            if (this !== ilm_.globalLight2) {
                if (!c_.fovLight)
                    c_.fovLight = new PIXI.Graphics();

                c_.fovLight.clear();

                if (this.radius > 0)
                    c_.fovLight.beginFill(0xFF0000, 1.0).drawPolygon(this.fov).endFill();
            } else if (c_.fovLight) {
                c_.fovLight.destroy();
                c_.fovLight = null;
            }
        }

        dirty = true;
        return c;
    });
});

Hooks.on("canvasInit", () => {
    const blurStrength = CONFIG.Canvas.blurStrength;
    const blurDistance = game.settings.get("core", "softShadows") ? Math.max(blurStrength / 2, 1) : 0;

    mask.filter = blurDistance > 0 ?
        new GlowFilter(blurStrength / 4, 2.0, 4 / 5, blurDistance) :
        new PIXI.filters.AlphaFilter(1.0);
    mask.filter.resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));
    mask.filters = [mask.filter];
    mask.filterArea = canvas.app.renderer.screen;

    dirty = true;
});

Hooks.on("canvasPan", () => {
    dirty = true;
});

Hooks.on("ready", () => {
    dirty = true;

    canvas.app.ticker.add(render, globalThis, PIXI.UPDATE_PRIORITY.LOW + 1);
});

Hooks.on("lightingRefresh", () => {
    mask.background.clear();

    if (canvas.lighting.globalLight)
        mask.background.beginFill(0x00FF00, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();

    for (const layer of mask.layers)
        layer.removeChildren();

    for (const source of canvas.lighting.sources) {
        if (!source.active) continue;

        const sc = source.illumination;
        const sc_ = extend(sc);

        if (sc_.fovLight)
            mask.layers[1].addChild(sc_.fovLight);
    }

    for (const source of canvas.sight.sources) {
        if (!source.active) continue;

        const sc = source.illumination;
        const sc_ = extend(sc);

        if (sc_.fovMono)
            mask.layers[0].addChild(sc_.fovMono);

        if (sc_.fovColor)
            mask.layers[1].addChild(sc_.fovColor);

        if (sc_.fovDimToBright)
            mask.layers[2].addChild(sc_.fovDimToBright);
    }

    dirty = true;
});

Hooks.on("sightRefresh", () => {
    mask.msk.clear();

    if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
        mask.msk.beginFill(0xFFFFFF, 1.0);

        for (const source of canvas.sight.sources) {
            if (!source.active) continue;

            mask.msk.drawPolygon(source.los);
        }

        for (const source of canvas.lighting.sources) {
            if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL)
                continue;

            mask.msk.drawPolygon(source.fov);
        }

        mask.msk.endFill();

        mask.mask = mask.msk;
    } else {
        mask.mask = null;
    }

    dirty = true;
});

// Based on PixiJS Filters' GlowFilter
class GlowFilter extends PIXI.Filter {
    constructor(strength = 1.0, intensity = 1.0, quality = 1.0, distance = 2) {
        distance = Math.round(distance);

        super(`\
            precision mediump float;

            attribute vec2 aVertexPosition;

            uniform mat3 projectionMatrix;
            uniform vec4 inputSize;
            uniform vec4 outputFrame;

            varying vec2 vTextureCoord;

            void main(void)
            {
                vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
                gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
                vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
            }`, `\
            precision mediump float;

            uniform sampler2D uSampler;
            uniform vec4 inputSize;
            uniform vec4 inputClamp;
            uniform float uStrength;
            uniform float uIntensity;

            varying vec2 vTextureCoord;

            const float PI = 3.14159265358979323846264;
            const float DIST = __DIST__;
            const float ANGLE_STEP_SIZE = min(__ANGLE_STEP_SIZE__, PI * 2.0);
            const float ANGLE_STEP_NUM = ceil(PI * 2.0 / ANGLE_STEP_SIZE);
            const float MAX_TOTAL_ALPHA = ANGLE_STEP_NUM * DIST * (DIST + 1.0) / 2.0;

            void main(void) {
                vec2 px = inputSize.zw * uStrength;
                vec4 totalAlpha = vec4(0.0);
                vec2 direction;
                vec2 displaced;
                vec4 color;

                for (float angle = 0.0; angle < PI * 2.0; angle += ANGLE_STEP_SIZE) {
                    direction = vec2(cos(angle), sin(angle)) * px;

                    for (float curDistance = 0.0; curDistance < DIST; curDistance++) {
                        displaced = clamp(vTextureCoord + direction *
                                (curDistance + 1.0), inputClamp.xy, inputClamp.zw);

                        color = texture2D(uSampler, displaced);
                        totalAlpha += (DIST - curDistance) * color;
                    }
                }

                color = texture2D(uSampler, vTextureCoord);

                vec4 alphaRatio = totalAlpha / MAX_TOTAL_ALPHA;
                vec4 glowAlpha = (1.0 - pow(1.0 - alphaRatio, vec4(uIntensity))) * (1.0 - color);
                vec4 glowColor = min(1.0 - color, glowAlpha);

                gl_FragColor = color + glowColor;
                }`.replace(/__ANGLE_STEP_SIZE__/gi, "" + (Math.PI / Math.round(quality * (distance + 1))).toFixed(7))
            .replace(/__DIST__/gi, distance.toFixed(0) + ".0"));

        this.uniforms.uStrength = strength;
        this.uniforms.uIntensity = intensity;
    }
}
