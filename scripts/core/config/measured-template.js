Hooks.on("renderMeasuredTemplateConfig", (sheet, html) => {
    if (!game.user.isGM) {
        return;
    }

    const form = sheet.form;
    const document = sheet.object;

    html.find(`button[name="submit"]`).before(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(${(document.parent?.data.gridUnits ?? game.system.data.gridUnits) || "Grid Units"})</span></label>
            <div class="form-fields">
                <label class="checkbox">Enable <input type="checkbox" id="perfect-vision.sightLimit:enable"></label>
                <input type="number" data-dtype="Number" name="flags.perfect-vision.sightLimit" min="0.0" step="0.1" disabled>
                <input type="hidden" data-dtype="Number" name="flags.perfect-vision.-=sightLimit">
            </div>
        </div>`);

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
                form.elements["flags.perfect-vision.sightLimit"].value = 0;
            }

            $(form.elements["flags.perfect-vision.sightLimit"]).attr("placeholder", "Infinity");
        }
    };

    updateSightLimit();

    html.find(`input[id="perfect-vision.sightLimit:enable"],input[name="flags.perfect-vision.sightLimit"]`)
        .each(function () {
            this.addEventListener("change", updateSightLimit, { capture: true });
        });

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});
