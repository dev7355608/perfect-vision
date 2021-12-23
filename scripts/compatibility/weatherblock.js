import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("weatherblock")?.active) {
        return;
    }

    patch("_weatherBlock.updateMask", "OVERRIDE", function () {
        if (canvas.weather._pv_weatherblock_mask) {
            canvas.weather._pv_weatherblock_mask.destroy(true);
            canvas.weather._pv_weatherblock_mask = null;
        }

        const inverted = !!canvas.scene.getFlag("weatherblock", "invertMask");

        canvas.weather._pv_weatherblock_mask = _weatherBlock.createMask(inverted);
        canvas.weather._pv_weatherblock_mask.filters = [new InvertMaskFilter()];
        canvas.weather._pv_weatherblock_mask.filterArea = canvas.app.renderer.screen;

        if (inverted) {
            if (canvas.weather._pv_weatherblock_mask?.geometry?.graphicsData?.length > 0) {
                canvas.weather._pv_stage.masks.addChild(canvas.weather._pv_weatherblock_mask);
            }
        } else {
            if (canvas.weather._pv_weatherblock_mask?.geometry?.graphicsData?.[0]?.holes?.length > 0) {
                canvas.weather._pv_stage.masks.addChild(canvas.weather._pv_weatherblock_mask);
            }
        }

        canvas.weather._pv_refreshBuffer();
    });
});

class InvertMaskFilter extends PIXI.Filter {
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
