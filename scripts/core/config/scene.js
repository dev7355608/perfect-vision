Hooks.on("renderSceneConfig", (sheet, html) => {
    const form = sheet.form;
    const document = sheet.object;
    const sightLimit = document.getFlag("perfect-vision", "sightLimit");
    const forceSaturation = document.getFlag("perfect-vision", "forceSaturation");
    const saturation = forceSaturation !== undefined && !forceSaturation ? null : (document.getFlag("perfect-vision", "saturation") ?? null);
    const revealed = document.getFlag("perfect-vision", "revealed");

    html.find(`input[name="globalLight"]`).closest(".form-group").before(`\
        <div class="form-group">
            <label>Reveal Fog</label>
            <input type="checkbox" name="flags.perfect-vision.revealed" ${revealed ? "checked" : ""}>
            <p class="notes">
                Reveal the fog of war. The fog is revealed even if Fog Exploration is disabled. Revealing the fog doesn't explore the Scene automatically.
            </p>
        </div>`);
    html.find(`input[name="globalLight"]`).closest(".form-group").after(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(${document.data.gridUnits || "Grid Units"})</span></label>
            <div class="form-fields">
                <input type="number" data-dtype="Number" name="flags.perfect-vision.sightLimit" min="0.0" step="0.1" placeholder="Unlimited" value="${sightLimit ?? ""}">
            </div>
            <p class="notes">
                Limit the sight of all controlled Tokens. This limit is in effect even if Unrestricted Vision Range is enabled.
                The limit can be set for each token individually in the token configuration under the Vision tab.
            </p>
        </div>`);
    html.find(`input[name="darkness"]`).closest(".form-group").after(`\
        <div class="form-group">
            <label>Saturation Level</label>
            <div class="form-fields">
                <label class="checkbox">
                    <input type="checkbox" id="perfect-vision.saturation:enable" ${Number.isFinite(saturation) ? "checked" : ""}>
                </label>
                <input type="range" data-dtype="Number" id="perfect-vision.saturation:value" min="0" max="1" step="0.05" value="${saturation ?? 0}">
                <span class="range-value">${saturation ?? 0}</span>
                <input type="hidden" data-dtype="Number" name="flags.perfect-vision.saturation" value="${saturation ?? ""}">
                <input type="hidden" data-dtype="Number" name="flags.perfect-vision.-=forceSaturation" ${forceSaturation === undefined ? "disabled" : ""}>
            </div>
            <p class="notes">Desaturate unilluminated areas and monochrome vision. If disabled, the saturation is linked to the Darkness Level.</p>
        </div>`);

    const addColorSetting = (name, label) => {
        const defaultColor = "#" + ("000000" + CONFIG.Canvas[name].toString(16)).slice(-6);
        const color = document.getFlag("perfect-vision", name);

        html.find(`input[name="darkness"]`).closest(".form-group").before(`\
            <div class="form-group">
                <label>${label}</label>
                <div class="form-fields">
                    <input type="text" data-dtype="String" name="flags.perfect-vision.${name}" placeholder="${defaultColor}" value="${color || ""}">
                    <input type="color" data-edit="flags.perfect-vision.${name}" value="${color || defaultColor}">
                </div>
            </div>`);
    };

    addColorSetting("daylightColor", "Daylight Color");
    addColorSetting("darknessColor", "Darkness Color");

    html.find(`input[id^="perfect-vision.saturation:"]`)
        .each(function () {
            this.addEventListener("change", () => {
                if (form.elements["perfect-vision.saturation:enable"].checked) {
                    form.elements["flags.perfect-vision.saturation"].value = form.elements["perfect-vision.saturation:value"].value;
                } else {
                    form.elements["flags.perfect-vision.saturation"].value = null;
                }
            }, { capture: true });
        });

    html.find(`input[id^="perfect-vision."],input[name^="flags.perfect-vision."],input[data-edit^="flags.perfect-vision."],input[name="globalLight"],input[name="globalLightThreshold"],input[name="hasGlobalThreshold"]`)
        .on("change", event => {
            if (event.target.type === "color" && event.target.dataset.edit) {
                event.target.form.elements[event.target.dataset.edit].value = event.target.value;
            }

            const data = foundry.utils.expandObject(new FormDataExtended(form).toObject());

            foundry.utils.mergeObject(
                sheet.object.data,
                {
                    globalLight: data.globalLight,
                    globalLightThreshold: data.hasGlobalThreshold !== false ? data.globalLightThreshold : null,
                    flags: {
                        "perfect-vision": foundry.utils.getProperty(data, "flags.perfect-vision") ?? {}
                    }
                }
            );

            if (sheet.object.isView && canvas.ready) {
                canvas.lighting._pv_updateLighting();
            }
        });

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});

Hooks.on("closeSceneConfig", sheet => {
    sheet.object.prepareData();

    if (sheet.object.isView && canvas.ready) {
        canvas.lighting._pv_updateLighting();
    }
});
