Hooks.once("setup", () => {
    if (!game.modules.get("fogmanager")?.active) {
        return;
    }

    CONFIG.Canvas.layers.fogmanager.group = "_pv_overlays";
});
