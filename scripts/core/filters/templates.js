import { Board } from "../board.js";

Hooks.on("canvasInit", () => {
    const layer = Board.getLayer(Board.LAYERS.TEMPLATES);

    layer.filters = [new TemplatesFilter()];
    layer.filters[0].resolution = canvas.app.renderer.resolution;
    layer.filters[0].multisample = PIXI.MSAA_QUALITY.HIGH;
    layer.filterArea = canvas.app.renderer.screen;
});

class TemplatesFilter extends PIXI.filters.AlphaFilter {
    constructor() {
        super(1.0);
    }

    get enabled() {
        return canvas.templates.placeables.length > 0;
    }

    set enabled(value) { }
}
