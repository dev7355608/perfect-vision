Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("renderDrawingHUD", (hud, html) => {
        if (!game.user.isGM) {
            return;
        }

        const toggle = document.createElement("div");

        toggle.classList.add("control-icon");

        if (hud.object.document.getFlag("perfect-vision", "enabled")) {
            toggle.classList.add("active");
        }

        toggle.setAttribute("title", "Toggle Lighting");
        toggle.dataset.action = "perfect-vision.toggle";
        toggle.innerHTML = `<i class="far fa-lightbulb"></i>`;

        html[0].querySelector(".col.left").appendChild(toggle);
        html[0].querySelector(`.control-icon[data-action="perfect-vision.toggle"]`)
            .addEventListener("click", event => {
                event.preventDefault();

                hud.object.document.setFlag(
                    "perfect-vision",
                    "enabled",
                    !hud.object.document.getFlag("perfect-vision", "enabled")
                ).then(() => hud.render(true));
            });
    });
});
