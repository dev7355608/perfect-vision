import { Board } from "../board.js";
import { Mask, MaskFilter } from "../mask.js";

Hooks.on("canvasInit", () => {
    const segment = Board.getSegment(Board.SEGMENTS.HIGHLIGHTS);

    segment.filters.unshift(new BackgroundMaskFilter());
    segment.filters[0].resolution = canvas.app.renderer.resolution;
    segment.filters[0].multisample = PIXI.MSAA_QUALITY.NONE;
    segment.filterArea = canvas.app.renderer.screen;
});

class BackgroundMaskFilter extends MaskFilter {
    static fragmentSource = `\
        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;

        void main()
        {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uMask, vMaskCoord);
            gl_FragColor = color * (1.0 - mask.a);
        }`;

    constructor() {
        super(undefined, BackgroundMaskFilter.fragmentSource);

        this.uniforms.uMask = Mask.getTexture("foreground");
    }
}
