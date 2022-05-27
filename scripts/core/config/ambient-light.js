Hooks.on("renderAmbientLightConfig", (sheet, html) => {
    const form = sheet.form;
    const document = sheet.object;

    html.find(`.tab[data-tab="advanced"]`).append(`\
        <div class="form-group">
            <label>Priority</label>
            <div class="form-fields">
                <input type="number" data-dtype="Number" name="flags.core.priority" step="1" placeholder="0">
            </div>
            <p class="hint">
                Higher priority light sources are rendered above lower priority light sources.
                The default value is 0 for light source with luminosity greater or equal to zero and 10 for light sources with luminosity below zero.
            </p>
        </div>
        <div class="form-group">
            <label>Sight Limit <span class="units">(${(document.parent?.data.gridUnits ?? game.system.data.gridUnits) || "Grid Units"})</span></label>
            <div class="form-fields">
                <label class="checkbox">Enable <input type="checkbox" id="perfect-vision.sightLimit:enable"></label>
                <input type="number" data-dtype="Number" name="flags.perfect-vision.sightLimit" min="0.0" step="0.1" disabled>
                <input type="hidden" data-dtype="Number" name="flags.perfect-vision.-=sightLimit">
            </div>
            <p class="hint">
                If enabled, in the area of the light source tokens can see at least as far as the limit if the luminosity is greater or equal to zero,
                and can see at most as far as the limit if the luminosity is less than zero. Higher priority light sources that overlap this light source can change the sight limit.
            </p>
        </div>`);

    html.find(`input[name="flags.core.priority"]`)
        .attr("value", document.getFlag("core", "priority"))
        .attr("placeholder", document.data.config.luminosity >= 0 ? 0 : 10);
    html.find(`input[id="perfect-vision.sightLimit:enable"]`)
        .attr("checked", document.getFlag("perfect-vision", "sightLimit") !== undefined);
    html.find(`input[name="flags.perfect-vision.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "sightLimit"));

    const updateSightLimit = event => {
        const enabled = form.elements["perfect-vision.sightLimit:enable"].checked;

        form.elements["flags.perfect-vision.sightLimit"].disabled = !enabled;
        form.elements["flags.perfect-vision.-=sightLimit"].disabled = enabled;

        if (form.elements["flags.perfect-vision.sightLimit"].disabled) {
            form.elements["flags.perfect-vision.sightLimit"].value = null;
            $(form.elements["flags.perfect-vision.sightLimit"]).attr("placeholder", "");
        } else {
            if (event?.target.id === "perfect-vision.sightLimit:enable") {
                form.elements["flags.perfect-vision.sightLimit"].value = form.elements["config.luminosity"].value >= 0 ? null : 0;
            }

            $(form.elements["flags.perfect-vision.sightLimit"]).attr("placeholder", "Infinity");
        }
    };

    updateSightLimit();

    html.find(`input[id="perfect-vision.sightLimit:enable"],input[name="flags.perfect-vision.sightLimit"]`)
        .each(function () {
            this.addEventListener("change", updateSightLimit, { capture: true });
        });

    html.find(`input[name="config.luminosity"]`)
        .on("change", event => html.find(`input[name="flags.core.priority"]`).attr("placeholder", event.target.value >= 0 ? 0 : 10));

    html.find('button[type="reset"]')
        .each(function () {
            this.addEventListener("click", () => foundry.utils.mergeObject(document.data, {
                "flags.core.-=priority": null,
                "flags.perfect-vision.-=sightLimit": null
            }), { capture: true });
        });

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});
