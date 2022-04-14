Hooks.once("init", () => {
    const { CONTROL } = KeyboardManager.MODIFIER_KEYS;

    game.keybindings.register("perfect-vision", "improvedGMVision", {
        name: "Toggle GM Vision",
        editable: [
            { key: "KeyG", modifiers: [CONTROL] }
        ],
        onDown: () => {
            if (canvas.ready) {
                canvas.lighting._pv_toggleGMVision();
            }

            return true;
        },
        restricted: true
    });

    game.keybindings.register("perfect-vision", "delimiters", {
        name: "Toggle Delimiters",
        editable: [
            { key: "KeyH", modifiers: [CONTROL] }
        ],
        onDown: () => {
            if (canvas.ready) {
                canvas.lighting._pv_toggleDelimiters();
            }

            return true;
        },
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

Hooks.on("renderSceneControls", (app, html, data) => {
    html[0].querySelector(`li[data-tool="perfect-vision.improvedGMVision"]`)?.addEventListener("wheel", event => {
        event.preventDefault();
        event.stopPropagation();

        if (game.settings.get("perfect-vision", "improvedGMVision")) {
            game.settings.set("perfect-vision", "improvedGMVisionBrightness",
                Math.clamped((Math.round((game.settings.get("perfect-vision", "improvedGMVisionBrightness") ?? 0.25) / 0.05) - Math.sign(event.deltaY)) * 0.05, 0.05, 0.95))
        }
    }, { passive: false });
});
