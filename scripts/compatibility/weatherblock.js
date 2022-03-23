import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";
import { patch } from "../utils/patch.js";

Hooks.once("setup", () => {
    if (!game.modules.get("weatherblock")?.active) {
        return;
    }

    patch("game.WeatherBlocker.constructor.prototype.setMask", "OVERRIDE", function () { });

    patch("game.WeatherBlocker.constructor.prototype.refreshMask", "OVERRIDE", function () {
        const buffer = CanvasFramebuffer.get("weatherMask");
        const polygons = this.getPolygons();

        if (buffer.weatherblock?.destroyed) {
            buffer.weatherblock = null;
        }

        buffer.weatherblock = buffer.weatherblock ?? new PIXI.LegacyGraphics();
        buffer.weatherblock.filters = buffer.weatherblock.filters ?? [new InvertMaskFilter()];
        buffer.weatherblock.filterArea = canvas.app.renderer.screen;
        buffer.weatherblock.clear();

        if (this.inverted) {
            if (polygons.length !== 0) {
                buffer.weatherblock.filters[0].enabled = true;
            } else {
                buffer.weatherblock.filters[0].enabled = false;
                buffer.weatherblock.beginFill().drawShape(canvas.dimensions.rect).endFill();
            }
        } else {
            buffer.weatherblock.filters[0].enabled = false;
        }

        buffer.weatherblock.beginFill();

        for (const polygon of polygons) {
            buffer.weatherblock.drawPolygon(polygon);
        }

        buffer.weatherblock.endFill();

        if (this.inverted || polygons.length !== 0) {
            buffer.masks.addChild(buffer.weatherblock);
        } else {
            buffer.masks.removeChild(buffer.weatherblock);
        }

        buffer.refresh();
    });
});

export class InvertMaskFilter extends PIXI.Filter {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;

        varying vec2 vTextureCoord;

        void main() {
            vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);

            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);

            vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;

        uniform sampler2D uSampler;

        void main() {
            vec4 color = texture2D(uSampler, vTextureCoord);

            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - color.a);
        }`;

    constructor() {
        super(InvertMaskFilter.vertexSrc, InvertMaskFilter.fragmentSrc);
    }

    get resolution() {
        const renderer = canvas.app.renderer;
        const renderTexture = renderer.renderTexture;

        if (renderTexture.current) {
            return renderTexture.current.resolution;
        }

        return renderer.resolution;
    }

    set resolution(value) { }

    get multisample() {
        const renderer = canvas.app.renderer;
        const renderTexture = renderer.renderTexture;

        if (renderTexture.current) {
            return renderTexture.current.multisample;
        }

        return renderer.multisample;
    }

    set multisample(value) { }
}
