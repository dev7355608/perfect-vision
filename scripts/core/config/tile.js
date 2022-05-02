Hooks.on("renderTileConfig", (sheet, html) => {
    // TODO: Remove once the Parallaxia bug is fixed
    if (html.find(`select[name="flags.perfect-vision.lighting"]`).length > 0) {
        return;
    }

    const document = sheet.object;
    const scene = document.parent;
    const drawings = new Map();

    drawings.set("", { active: true, title: "" });

    for (const drawing of Array.from(scene.drawings.values()).sort((a, b) => a.id.localeCompare(b.id))) {
        drawings.set(drawing.id, {
            active: isDrawingActive(scene, drawing.id),
            title: drawing.data.text || ""
        });
    }

    html.find(`.tab[data-tab="overhead"]`).append(`\
        <div class="form-group">
            <label>Roof Lighting</label>
            <div class="form-fields">
                <select name="flags.perfect-vision.lighting" data-dtype="String" style="font-family: monospace;"></select>
            </div>
            <p class="notes">
                If left blank, the roof is illuminated according to the scene's lighting settings. Otherwise, according to the chosen drawing's lighting settings.
            </p>
        </div>`);

    const select = html.find(`select[name="flags.perfect-vision.lighting"]`);

    select.css("color", "unset");

    const value = sheet.object.getFlag("perfect-vision", "lighting") || "";
    const black = select.css("color") || "black";

    select.css("color", drawings.get(value)?.active ? black : "red");
    select.on("change", () => {
        select.css("color", drawings.get(sheet.form.elements["flags.perfect-vision.lighting"].value || "")?.active ? black : "red");
    });

    for (const [id, data] of drawings.entries()) {
        select.append(`<option value="${id}" title="${data.title}" style="color: ${data.active ? black : "red"};">${id}</id>`);
    }

    select.val(value);

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});

function isDrawingActive(scene, id) {
    if (!id) {
        return true;
    }

    const document = scene.drawings.get(id);

    if (!document?.getFlag("perfect-vision", "active")) {
        return false;
    }

    return isDrawingActive(scene, document.getFlag("perfect-vision", "parent"));
}
