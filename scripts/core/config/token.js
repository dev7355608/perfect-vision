Hooks.on("renderTokenConfig", (sheet, html) => {
    const form = sheet.form;
    const document = sheet.token;
    const gridUnits = (document.parent?.data.gridUnits ?? game.system.data.gridUnits) || "Grid Units";

    html.find(`.tab[data-tab="vision"]`).append(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(${gridUnits})</span></label>
            <div class="form-fields">
                <input type="number" data-dtype="Number" name="flags.perfect-vision.sightLimit" min="0.0" step="0.1" placeholder="Unlimited">
            </div>
        </div>`);
    html.find(`input[name="flags.perfect-vision.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "sightLimit"));

    html.find(`.tab[data-tab="light"] > .tab[data-tab="advanced"]`).append(`\
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
            <label>Sight Limit <span class="units">(${gridUnits})</span></label>
            <div class="form-fields">
                <label class="checkbox">Enable <input type="checkbox" id="perfect-vision.light.sightLimit:enable"></label>
                <input type="number" data-dtype="Number" name="flags.perfect-vision.light.sightLimit" min="0.0" step="0.1" disabled>
                <input type="hidden" data-dtype="Number" name="flags.perfect-vision.light.-=sightLimit">
            </div>
            <p class="hint">
                If enabled, in the area of the light source tokens can see at least as far as the limit if the luminosity is greater or equal to zero,
                and can see at most as far as the limit if the luminosity is less than zero. Higher priority light sources that overlap this light source can change the sight limit.
            </p>
        </div>`);

    html.find(`input[name="flags.core.priority"]`)
        .attr("value", document.getFlag("core", "priority"))
        .attr("placeholder", document.data.light.luminosity >= 0 ? 0 : 10);
    html.find(`input[id="perfect-vision.light.sightLimit:enable"]`)
        .attr("checked", document.getFlag("perfect-vision", "light.sightLimit") !== undefined);
    html.find(`input[name="flags.perfect-vision.light.sightLimit"]`)
        .attr("value", document.getFlag("perfect-vision", "light.sightLimit"));

    const updateSightLimit = () => {
        const enabled = form.elements["perfect-vision.light.sightLimit:enable"].checked;

        form.elements["flags.perfect-vision.light.sightLimit"].disabled = !enabled;
        form.elements["flags.perfect-vision.light.-=sightLimit"].disabled = enabled;

        if (form.elements["flags.perfect-vision.light.sightLimit"].disabled) {
            form.elements["flags.perfect-vision.light.sightLimit"].value = null;
            $(form.elements["flags.perfect-vision.light.sightLimit"]).attr("placeholder", "");
        } else {
            $(form.elements["flags.perfect-vision.light.sightLimit"]).attr("placeholder", "Infinity");
        }
    };

    updateSightLimit();

    html.find(`input[id="perfect-vision.light.sightLimit:enable"],input[name="flags.perfect-vision.light.sightLimit"]`)
        .each(function () {
            this.addEventListener("change", updateSightLimit, { capture: true });
        });

    html.find(`input[name="light.luminosity"]`)
        .on("change", event => html.find(`input[name="flags.core.priority"]`).attr("placeholder", event.target.value >= 0 ? 0 : 10));

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});
