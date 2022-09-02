Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("updateToken", (document, changes) => {
        if (document.rendered && "elevation" in changes) {
            document.object.updateSource();
        }
    });
});
