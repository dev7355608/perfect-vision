import { Board } from "../../core/board.js";
import { Mask, MaskFilter } from "../../core/mask.js";

Hooks.once("init", () => {
    if (!game.modules.get("levels")?.active) {
        return;
    }

    Hooks.on("canvasInit", () => {
        const layer = Board.getLayer(Board.LAYERS.TOKENS - 1);

        layer.filters.unshift(new BackgroundTokenMaskFilter());
        layer.filters[0].resolution = canvas.app.renderer.resolution;
        layer.filters[0].multisample = PIXI.MSAA_QUALITY.NONE;
        layer.filterArea = canvas.app.renderer.screen;
    });
});

class BackgroundTokenMaskFilter extends MaskFilter {
    static fragmentSource = `\
        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uBackground;
        uniform sampler2D uElevation;
        uniform float uCurrentElevation;

        void main()
        {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 background = texture2D(uBackground, vMaskCoord);
            vec4 mask = texture2D(uElevation, vMaskCoord);
            gl_FragColor = mix(color, background * color.a, step(uCurrentElevation, mask.r));
        }`;

    constructor() {
        super(undefined, BackgroundTokenMaskFilter.fragmentSource);

        this.uniforms.uBackground = Mask.getTexture("background");
        this.uniforms.uElevation = Mask.getTexture("elevation");
        this.uniforms.uCurrentElevation = 0;
    }

    get enabled() {
        return canvas.tokens.controlled?.length > 0;
    }

    set enabled(value) { }

    apply(filterManager, input, output, clearMode, currentState) {
        this.uniforms.uCurrentElevation = canvas.tokens.controlled[0].data.elevation;

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}
