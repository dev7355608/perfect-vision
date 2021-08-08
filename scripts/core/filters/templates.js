import { Board } from "../board.js";

Hooks.on("canvasInit", () => {
    const layer = Board.getLayer(Board.LAYERS.TEMPLATES);

    layer.filters = [new PIXI.filters.AlphaFilter()];
    layer.filters[0].resolution = canvas.app.renderer.resolution;
    layer.filters[0].multisample = PIXI.MSAA_QUALITY.HIGH;
    layer.filterArea = canvas.app.renderer.screen;
});
