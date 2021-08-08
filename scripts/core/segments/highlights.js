import { Board } from "../board.js";
import { MaskData, MaskFilter } from "../mask.js";


Hooks.on("canvasInit", () => {
    const segment = Board.getSegment(Board.SEGMENTS.HIGHLIGHTS);

    segment.mask = new BackgroundMaskData();
    segment.mask.resolution = null;
    segment.mask.multisample = PIXI.MSAA_QUALITY.HIGH;
    segment.mask.filterArea = canvas.app.renderer.screen;
});

class BackgroundMaskData extends MaskData {
    constructor() {
        super("foreground", new BackgroundMaskFilter());
    }
}

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
    }
}
