Hooks.on("getSceneControlButtons", controls => {
    const lightingControl = controls.find(c => c.name === "lighting");

    if (lightingControl) {
        const index = lightingControl.tools.findIndex(t => t.name === "clear");

        lightingControl.tools.splice(index, 0, {
            name: "perfect-vision.displayDelimiter",
            title: "Display Delimiter",
            icon: "far fa-circle",
            toggle: true,
            active: canvas.lighting?._pv_delimiter.visible,
            onClick: toggled => canvas.lighting._pv_toggleDelimiters(toggled)
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
