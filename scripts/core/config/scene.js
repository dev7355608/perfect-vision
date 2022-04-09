import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("SceneConfig.prototype.close", "POST", async function (result) {
        this.object.prepareData();

        if (this.object.isView && canvas.ready) {
            canvas.lighting._pv_updateLighting();
        }

        await result;
    });

    patch("SceneConfig.prototype._getSubmitData", "POST", function (data) {
        if (!this.form.elements["hasGlobalThreshold"].checked) {
            data["globalLightThreshold"] = null;
        }

        if (!this.form.elements["perfect-vision.saturation.enable"].checked) {
            data["flags.perfect-vision.saturation"] = null;
        }

        if (this.object.getFlag("perfect-vision", "forceSaturation") !== undefined) {
            data["flags.perfect-vision.-=forceSaturation"] = null;
        }

        return data;
    });

    patch("SceneConfig.prototype._onChangeInput", "POST", async function (result, event) {
        await result;

        const target = event.target;
        let name = target.name || target.id;

        if (target.type === "color" && target.dataset.edit?.startsWith("flags.perfect-vision.")) {
            name = target.dataset.edit;
            target.form.elements[name].value = target.value;
        }

        if (name !== "globalLight" && name !== "globalLightThreshold" && name !== "hasGlobalThreshold"
            && !name.startsWith("perfect-vision.") && !name.startsWith("flags.perfect-vision.")) {
            return;
        }

        const data = foundry.utils.expandObject(this._getSubmitData());

        foundry.utils.mergeObject(
            foundry.utils.mergeObject(
                this.object.data,
                {
                    "flags.perfect-vision": foundry.utils.getProperty(data, "flags.perfect-vision") ?? {}
                }
            ),
            {
                globalLight: data.globalLight,
                globalLightThreshold: data.globalLightThreshold
            }
        );

        if (this.object.isView && canvas.ready) {
            canvas.lighting._pv_updateLighting();
        }

        return result;
    });
});

Hooks.on("renderSceneConfig", (sheet, html, data) => {
    const document = sheet.object;
    const sightLimit = document.getFlag("perfect-vision", "sightLimit");
    const forceSaturation = document.getFlag("perfect-vision", "forceSaturation");
    const saturation = forceSaturation !== undefined && !forceSaturation ? null : (document.getFlag("perfect-vision", "saturation") ?? null);

    html.find(`input[name="globalLight"]`).parent().after(`\
        <div class="form-group">
            <label>Sight Limit <span class="units">(${canvas.scene.data.gridUnits})</span></label>
            <div class="form-fields">
                <input type="number" min="0.0" step="0.1" name="flags.perfect-vision.sightLimit" placeholder="Unlimited" data-dtype="Number" value="${sightLimit ?? ""}">
            </div>
            <p class="notes">
                Limit the sight of all controlled Tokens. This limit is in effect even if Unrestricted Vision Range is enabled.
                The limit can be set for each token individually in the token configuration under the Vision tab.
            </p>
        </div>`);
    html.find(`input[name="darkness"]`).parent().parent().after(`\
        <div class="form-group">
            <label>Saturation Level</label>
            <div class="form-fields">
                <label class="checkbox">
                    <input type="checkbox" id="perfect-vision.saturation.enable" ${Number.isFinite(saturation) ? "checked" : ""}>
                </label>
                <input type="range" name="flags.perfect-vision.saturation" min="0" max="1" step="0.05" value="${saturation ?? 0}">
                <span class="range-value">${saturation ?? 0}</span>
            </div>
            <p class="notes">Desaturate unilluminated areas and monochrome vision. If disabled, the saturation is linked to the Darkness Level.</p>
        </div>`);

    const addColorSetting = (name, label) => {
        const defaultColor = "#" + ("000000" + CONFIG.Canvas[name].toString(16)).slice(-6);
        const color = document.getFlag("perfect-vision", name);

        html.find(`input[name="darkness"]`).parent().parent().before(`\
            <div class="form-group">
                <label>${label}</label>
                <div class="form-fields">
                    <input type="text" name="flags.perfect-vision.${name}" placeholder="${defaultColor}" data-dtype="String" value="${color || ""}">
                    <input type="color" data-edit="flags.perfect-vision.${name}" value="${color || defaultColor}">
                </div>
            </div>`);
    };

    addColorSetting("daylightColor", "Daylight Color");
    addColorSetting("darknessColor", "Darkness Color");

    sheet.options.height = "auto";
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});
