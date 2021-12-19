Hooks.once("init", () => {
    const { CONTROL } = KeyboardManager.MODIFIER_KEYS;

    game.keybindings.register("perfect-vision", "improvedGMVision", {
        name: "Toggle GM Vision",
        editable: [
            { key: "KeyG", modifiers: [CONTROL] }
        ],
        onDown: () => canvas.lighting._pv_toggleGMVision(),
        restricted: true
    });

    game.keybindings.register("perfect-vision", "delimiters", {
        name: "Toggle Delimiters",
        editable: [
            { key: "KeyH", modifiers: [CONTROL] }
        ],
        onDown: () => canvas.lighting._pv_toggleDelimiters(),
        restricted: true
    });
});

Hooks.on("getSceneControlButtons", controls => {
    const lightingControl = controls.find(c => c.name === "lighting");

    if (lightingControl) {
        const index = lightingControl.tools.findIndex(t => t.name === "clear");

        lightingControl.tools.splice(index, 0, {
            name: "perfect-vision.delimiters",
            title: "Toggle Delimiters",
            icon: "far fa-circle",
            toggle: true,
            active: !!game.settings.get("perfect-vision", "delimiters"),
            onClick: toggled => game.settings.set("perfect-vision", "delimiters", toggled)
        });

        lightingControl.tools.splice(index + 1, 0, {
            name: "perfect-vision.improvedGMVision",
            title: "Toggle GM Vision",
            icon: "far fa-eye",
            toggle: true,
            active: !!game.settings.get("perfect-vision", "improvedGMVision"),
            onClick: toggled => game.settings.set("perfect-vision", "improvedGMVision", toggled)
        });
    }
});
