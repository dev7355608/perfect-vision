import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("TileConfig.prototype._onChangeInput", "POST", async function (result, event) {
        await result;

        updateForm(this);
    });
});

Hooks.on("renderTileConfig", (sheet, html, data) => {
    html.find(`div[data-tab="overhead"]`).append(`\
        <div class="form-group">
            <label>Roof Lighting</label>
            <div class="form-fields">
                <select name="flags.perfect-vision.lighting" style="font-family: monospace;" data-dtype="String">
                    <option value=""></option>
                </select>
            </div>
            <p class="notes">
                If left blank, the roof is illuminated according to the scene's lighting settings. Otherwise, according to the chosen drawing's lighting settings.
            </p>
        </div>`);

    updateForm(sheet, sheet.object.getFlag("perfect-vision", "lighting") || "");

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});

function updateForm(sheet, value) {
    const document = sheet.object;
    const scene = document.parent;
    const html = $(sheet.form);

    const lighting = value ?? sheet.form.elements["flags.perfect-vision.lighting"].value;
    const select = html.find(`select[name="flags.perfect-vision.lighting"]`);

    select.css("color", "unset");

    const black = select.css("color") || "black";

    select.css("color", isActive(scene, lighting) ? black : "red");
    select.empty().append(`<option value=""></id>`);

    for (const other of Array.from(scene.drawings.values()).sort((a, b) => a.id.localeCompare(b.id))) {
        const active = isActive(scene, other.id);

        select.append(`<option value="${other.id}" title="${other.data.text || ""}" style="color: ${active ? black : "red"};">${other.id}</id>`);
    }

    select.val(lighting);
}


function isActive(scene, id) {
    if (!id) {
        return true;
    }

    const document = scene.drawings.get(id);

    if (!document || !document.getFlag("perfect-vision", "active")) {
        return false;
    }

    return isActive(scene, document.getFlag("perfect-vision", "parent"));
}
