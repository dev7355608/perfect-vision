Hooks.once("setup", () => {
    if (!game.modules.get("enhanced-terrain-layer")?.active) {
        return;
    }

    CONFIG.Canvas.layers.terrain.group = "_pv_overlays";
});
