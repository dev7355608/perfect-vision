import { Board } from "../board.js";
import { Mask, MaskFilter } from "../mask.js";

Hooks.on("canvasInit", () => {
    const layer = Board.getLayer(Board.LAYERS.WEATHER);

    layer.filters.unshift(new WeatherMaskFilter());
    layer.filters[0].resolution = canvas.app.renderer.resolution;
    layer.filters[0].multisample = PIXI.MSAA_QUALITY.NONE;
    layer.filterArea = canvas.app.renderer.screen;
});

class WeatherMaskFilter extends MaskFilter {
    static fragmentSource = `\
        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;

        void main()
        {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uMask, vMaskCoord);
            gl_FragColor = color * mask.r;
        }`;

    constructor() {
        super(undefined, WeatherMaskFilter.fragmentSource);

        this.uniforms.uMask = Mask.getTexture("weather");
    }

    get enabled() {
        const layer = Board.getLayer(Board.LAYERS.WEATHER);

        for (const child of layer.children) {
            if (child.children.length !== 0) {
                return true;
            }
        }

        return false;
    }

    set enabled(value) { }
}
