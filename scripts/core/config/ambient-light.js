import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("AmbientLightConfig.prototype._onChangeInput", "WRAPPER", async function (wrapped, event, ...args) {
        const target = event.target;
        const name = target.name || target.id;

        if (name === "config.luminosity") {
            target.form.elements["flags.core.priority"].placeholder = target.value >= 0 ? 0 : 10;
        }

        return wrapped(event, ...args);
    });

    patch("AmbientLightConfig.prototype._onResetForm", "WRAPPER", function (wrapped, event, ...args) {
        foundry.utils.mergeObject(this.document.data, {
            "flags.core.-=priority": null,
            "flags.perfect-vision.-=sightLimit": null
        });

        return wrapped(event, ...args);
    });

    patch("AmbientLightConfig.prototype._getSubmitData", "POST", function (data) {
        if (!Number.isFinite(data["flags.core.priority"])) {
            delete data["flags.core.priority"];

            data["flags.core.-=priority"] = null;
        }

        if (!this.form.elements["perfect-vision.sightLimit.enable"].checked) {
            delete data["flags.perfect-vision.sightLimit"];

            data["flags.perfect-vision.-=sightLimit"] = null;
        }

        return data;
    });
});

Hooks.on("renderAmbientLightConfig", (sheet, html, data) => {
    const document = sheet.object;

    html.find(`div[data-tab="advanced"]`).append(`\
        <div class="form-group">
            <label>Priority</label>
            <div class="form-fields">
                <input type="number" name="flags.core.priority" placeholder="0" data-dtype="Number">
            </div>
            <p class="hint">
                Higher priority light sources are rendered above lower priority light sources.
                The default value is 0 for light source with luminosity greater or equal to zero and 10 for light sources with luminosity below zero.
            </p>
        </div>
        <div class="form-group">
            <label>Sight Limit <span class="units">(${(document.parent?.data.gridUnits ?? game.system.data.gridUnits) || "Grid Units"})</span></label>
            <div class="form-fields">
                <label class="checkbox">Enable <input type="checkbox" id="perfect-vision.sightLimit.enable"></label>
                <input type="number" min="0.0" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Infinity" data-dtype="Number">
            </div>
            <p class="hint">
                If enabled, in the area of the light source tokens can see at least as far as the limit if the luminosity is greater or equal to zero,
                and can see at most as far as the limit if the luminosity is less than zero. Higher priority light sources that overlap this light source can change the sight limit.
            </p>
        </div>`);

    html.find(`input[name="flags.core.priority"]`)
        .attr("value", document.getFlag("core", "priority") ?? null)
        .attr("placeholder", document.data.config.luminosity >= 0 ? 0 : 10);
    html.find(`input[id="perfect-vision.sightLimit.enable"]`)
        .attr("checked", document.getFlag("perfect-vision", "sightLimit") !== undefined);
    html.find(`input[name="flags.perfect-vision.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "sightLimit"));

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});
