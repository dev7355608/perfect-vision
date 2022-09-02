Hooks.on("renderTileConfig", sheet => {
    const { document, form } = sheet;

    // TODO: remove once the Parallaxia bug is fixed
    if (form.querySelector(`select[name="flags.perfect-vision.lighting"]`)) {
        return;
    }

    const scene = document.parent;
    const value = document.getFlag("perfect-vision", "lighting") || "";
    const drawings = new Map();

    drawings.set("", { enabled: true, title: "" });

    for (const drawing of Array.from(scene.drawings.values()).sort((a, b) => a.id.localeCompare(b.id))) {
        const enabled = isDrawingEnabled(scene, drawing.id);

        if (!enabled && value !== drawing.id) {
            continue;
        }

        drawings.set(drawing.id, {
            enabled,
            title: drawing.text || ""
        });
    }

    form.querySelector(`.tab[data-tab="overhead"]`)
        .insertAdjacentHTML("beforeend", `\
            <div class="form-group">
                <label>${game.i18n.localize("SCENES.HeaderVision")}</label>
                <div class="form-fields">
                    <select name="flags.perfect-vision.lighting" style="font-family: monospace;"></select>
                </div>
                <p class="notes">${game.i18n.localize("PERFECTVISION.RoofLightingHint")}</p>
            </div>`);

    const select = form.querySelector(`select[name="flags.perfect-vision.lighting"]`);

    select.style.color = "unset";

    const black = window.getComputedStyle(select).getPropertyValue("color") || "black";

    select.style.color = drawings.get(value)?.enabled ? black : "red";

    for (const [id, data] of drawings.entries()) {
        select.insertAdjacentHTML("beforeend", `<option value="${id}" title="${data.title}" style="color: ${data.enabled ? black : "red"};">${id}</id>`);
    }

    select.value = value;
    select.addEventListener("change", event => {
        event.preventDefault();

        select.style.color = drawings.get(form.elements["flags.perfect-vision.lighting"].value || "")?.enabled ? black : "red";
    });

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});

function isDrawingEnabled(scene, id) {
    if (!id) {
        return true;
    }

    const document = scene.drawings.get(id);

    if (!document?.getFlag("perfect-vision", "enabled")) {
        return false;
    }

    return isDrawingEnabled(scene, document.getFlag("perfect-vision", "prototype"));
}
