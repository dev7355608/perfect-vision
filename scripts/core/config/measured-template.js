import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("MeasuredTemplateConfig.prototype._getSubmitData", "POST", function (data) {
        if (!game.user.isGM) {
            return data;
        }

        if (!this.form.elements["perfect-vision.sightLimit.enable"].checked) {
            delete data["flags.perfect-vision.sightLimit"];

            data["flags.perfect-vision.-=sightLimit"] = null;
        }

        return data;
    });
});

Hooks.on("renderMeasuredTemplateConfig", (sheet, html, data) => {
    if (!game.user.isGM) {
        return;
    }

    const document = sheet.object;
    const sightLimit = document.getFlag("perfect-vision", "sightLimit");

    html.find(`button[name="submit"]`).before(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(Grid Units)</span></label>
            <div class="form-fields">
                <label class="checkbox">Enable <input type="checkbox" id="perfect-vision.sightLimit.enable" ${sightLimit !== undefined ? "checked" : ""}></label>
                <input type="number" min="0.0" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Infinity" data-dtype="Number" value="${sightLimit ?? ""}">
            </div>
        </div>`);

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});
