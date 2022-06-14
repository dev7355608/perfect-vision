import { patch } from "../../utils/patch.js";

let template;

Hooks.once("init", () => {
    patch("DrawingConfig.prototype._getSubmitData", "POST", function (data) {
        if (!game.user.isGM || this.options.configureDefault) {
            return data;
        }

        data = foundry.utils.flattenObject(data);

        const parent = data["flags.perfect-vision.parent"];

        if (!parent || getLightingData(this.object.parent, parent).parents.includes(this.object.id)) {
            data["flags.perfect-vision.parent"] = "";
        }

        if (!Number.isFinite(data["flags.perfect-vision.origin.x"])) {
            data["flags.perfect-vision.origin.x"] = 0.5;
        }

        if (!Number.isFinite(data["flags.perfect-vision.origin.y"])) {
            data["flags.perfect-vision.origin.y"] = 0.5;
        }

        for (const key of ["vision", "globalLight", "sightLimit", "daylightColor", "fogExploration", "revealed",
            "darknessColor", "darkness", "saturation", "globalLightThreshold"]) {
            if (!this.form.elements[`perfect-vision.${key}.override`].checked) {
                delete data[`flags.perfect-vision.${key}`];

                data[`flags.perfect-vision.-=${key}`] = null;
            } else if (this.form.elements[`perfect-vision.${key}.enable`]?.checked === false) {
                data[`flags.perfect-vision.${key}`] = null;
            } else if (["daylightColor", "darknessColor"].includes(key) && !data[`flags.perfect-vision.${key}`]) {
                data[`flags.perfect-vision.${key}`] = "";
            }
        }

        return data;
    });

    patch("DrawingConfig.prototype._onChangeInput", "POST", async function (result, event) {
        await result;

        if (!game.user.isGM || this.options.configureDefault) {
            return;
        }

        const target = event.target;
        let name = target.name || target.id;

        if (target.type === "color" && target.dataset.edit?.startsWith("flags.perfect-vision.")) {
            name = target.dataset.edit;
            target.form.elements[name].value = target.value;
        }

        if (!name.startsWith("perfect-vision.") && !name.startsWith("flags.perfect-vision.")) {
            return;
        }

        foundry.utils.mergeObject(
            this.object.data,
            {
                "flags.perfect-vision": foundry.utils.getProperty(
                    foundry.utils.expandObject(this._getSubmitData()),
                    "flags.perfect-vision"
                ) ?? {}
            }
        );

        updateForm(this);

        if (this.object.parent.isView && canvas.ready) {
            this.object.object._pv_updateLighting();
        }
    });

    patch("DrawingConfig.prototype._renderInner", "WRAPPER", async function (wrapped, ...args) {
        template = await getTemplate("modules/perfect-vision/templates/drawing-config.hbs");

        return await wrapped(...args);
    });
});

Hooks.on("renderDrawingConfig", (sheet, html) => {
    if (!game.user.isGM || sheet.options.configureDefault) {
        return;
    }

    const document = sheet.object;
    const data = foundry.utils.getProperty(document.data, "flags.perfect-vision") ?? {};
    const nav = html.find("nav.sheet-tabs.tabs");

    nav.append(`<a class="item" data-tab="perfect-vision.lighting"><i class="fas fa-lightbulb"></i> Lighting</a>`);
    nav.parent().find("footer").before(
        template(
            {
                id: document.id,
                data,
                defaults: {
                    daylightColor: "#" + ("000000" + CONFIG.Canvas.daylightColor.toString(16)).slice(-6),
                    darknessColor: "#" + ("000000" + CONFIG.Canvas.darknessColor.toString(16)).slice(-6),
                },
                gridUnits: (document.parent?.data.gridUnits ?? game.system.data.gridUnits) || "Grid Units"
            },
            {
                allowProtoMethodsByDefault: true,
                allowProtoPropertiesByDefault: true
            }
        )
    );

    updateForm(sheet);

    html.find(`button[id="perfect-vision.resetDefaults"]`)
        .on("click", onResetDefaults.bind(sheet));
    html.find(`button[id="perfect-vision.pickOrigin"]`)
        .on("click", onPickOrigin.bind(sheet));

    sheet.options.height = "auto";
    sheet.position.width = Math.max(sheet.position.width, 600);
    sheet.position.height = "auto";
    sheet.setPosition(sheet.position);
});

Hooks.on("closeDrawingConfig", sheet => {
    if (!game.user.isGM || sheet.options.configureDefault) {
        return;
    }

    sheet.object.prepareData();

    if (sheet.object.parent.isView && canvas.ready) {
        sheet.object.object._pv_updateLighting();
    }

    if (pickerOverlay.parent) {
        pickerOverlay.parent.removeChild(pickerOverlay);
    }
});

Hooks.on("renderDrawingHUD", (hud, html) => {
    const toggle = document.createElement("div");

    toggle.classList.add("control-icon");

    if (hud.object.document.getFlag("perfect-vision", "active")) {
        toggle.classList.add("active");
    }

    toggle.setAttribute("title", "Toggle Lighting");
    toggle.dataset.action = "perfect-vision.toggle";
    toggle.innerHTML = `<i class="far fa-lightbulb"></i>`;

    html.find(".col.left").append(toggle);
    html.find(`.control-icon[data-action="perfect-vision.toggle"]`).click(async event => {
        await hud.object.document.setFlag(
            "perfect-vision",
            "active",
            !hud.object.document.getFlag("perfect-vision", "active")
        );

        hud.render(true);
    });
});

let pickerOverlay;

Hooks.on("canvasInit", () => {
    if (pickerOverlay) {
        pickerOverlay.destroy(true);
    }

    pickerOverlay = new PIXI.Container();
    pickerOverlay.hitArea = canvas.dimensions.rect;
    pickerOverlay.cursor = "crosshair";
    pickerOverlay.interactive = true;
    pickerOverlay.zIndex = Infinity;
    pickerOverlay.on("remove", () => pickerOverlay.off("pick"));
    pickerOverlay.on("click", event => {
        pickerOverlay.emit("pick", event.data.getLocalPosition(pickerOverlay));
        pickerOverlay.parent.removeChild(pickerOverlay);
    })
});

function onResetDefaults(event) {
    event.preventDefault();

    foundry.utils.mergeObject(this.object.data, { "flags.-=perfect-vision": null });

    if (this.object.parent.isView && canvas.ready) {
        this.object.object._pv_updateLighting();
    }

    Hooks.once("renderDrawingConfig", (sheet, html) => {
        html[0].querySelector(`.tabs [data-tab="perfect-vision.lighting"]`).click();
    });

    this.render();
}

function onPickOrigin(event) {
    event.preventDefault();

    if (!this.object.parent.isView || !canvas.ready) {
        return;
    }

    canvas.stage.addChild(pickerOverlay).once("pick", position => {
        const { width, height } = this.object.data;
        let origin = this.object.object._pv_getLocalPosition(position);
        const x = origin.x / width;
        const y = origin.y / height;

        if (Number.isFinite(x) && Number.isFinite(y)) {
            const p = new PIXI.Point();

            for (let n = 1; ; n *= 10) {
                origin.x = Math.round(x * n) / n;
                origin.y = Math.round(y * n) / n;

                p.x = origin.x * width;
                p.y = origin.y * height;

                this.object.object._pv_getGlobalPosition(p, p);

                const error = Math.max(
                    Math.abs(position.x - p.x) * canvas.stage.scale.x,
                    Math.abs(position.y - p.y) * canvas.stage.scale.y
                );

                if (error < 0.1) {
                    break;
                }
            }
        } else {
            origin = null;
        }

        this.form.elements["flags.perfect-vision.origin.x"].value = origin?.x;
        this.form.elements["flags.perfect-vision.origin.y"].value = origin?.y;

        $(this.form.elements["flags.perfect-vision.origin.x"]).trigger("change");
    });
}

function getLightingData(scene, id) {
    if (!id) {
        return {
            id: "",
            active: true,
            walls: false,
            fogExploration: scene.data.fogExploration,
            revealed: false,
            vision: false,
            globalLight: scene.data.globalLight,
            globalLightThreshold: scene.data.globalLightThreshold,
            sightLimit: scene.getFlag("perfect-vision", "sightLimit") ?? null,
            daylightColor: scene.getFlag("perfect-vision", "daylightColor") ?? "",
            darknessColor: scene.getFlag("perfect-vision", "darknessColor") ?? "",
            darkness: scene.data.darkness,
            saturation: scene.getFlag("perfect-vision", "saturation") ?? null
        };
    }

    const document = scene.drawings.get(id);

    if (!document) {
        return {
            id, active: false, walls: false, vision: false, globalLight: false, globalLightThreshold: null,
            sightLimit: null, daylightColor: "", darknessColor: "", darkness: 0, saturation: null,
            fogExploration: false, revealed: false
        };
    }

    let data = foundry.utils.deepClone(document.data.flags?.["perfect-vision"] ?? {});

    data.id = id;
    data.parents = [data.parent, ...data.parents ?? []];
    data.parent = getLightingData(scene, data.parent);
    data.active = !!data.active && data.parent.active;

    for (const key of ["vision", "globalLight", "sightLimit", "daylightColor", "fogExploration", "revealed",
        "darknessColor", "darkness", "saturation", "globalLightThreshold"]) {
        if (data[key] === undefined) {
            data[key] = data.parent[key];
        }
    }

    return data;
}

function updateForm(sheet) {
    const document = sheet.object;
    const scene = document.parent;
    const html = $(sheet.form);
    const data = getLightingData(scene, document.id);

    html.find(`*[id="perfect-vision.id"]`).css("color", data.active ? "unset" : "red");

    const parent = html.find(`select[name="flags.perfect-vision.parent"]`);

    parent.css("color", "unset");

    const black = parent.css("color") || "black";

    parent.css("color", data.parent.active ? black : "red");
    parent.empty().append(`<option value=""></id>`);

    for (const other of Array.from(scene.drawings.values()).sort((a, b) => a.id.localeCompare(b.id))) {
        if (other.id === document.id) {
            continue;
        }

        const data = getLightingData(scene, other.id);
        const text = other.data.text ? `${other.id} (${other.data.text.length <= 16 ? other.data.text : other.data.text.substring(0, 13).concat("...")})` : `${other.id}`;
        const color = data.active ? black : "red";
        const disabled = data.parents.includes(document.id) ? "disabled" : ""

        parent.append(`<option value="${other.id}" title="${other.data.text || ""}"style="color: ${color};" ${disabled}>${text}</id>`);
    }

    parent.val(document.getFlag("perfect-vision", "parent") || "");

    for (const [key, defautValue] of Object.entries({
        fogExploration: false,
        revealed: false,
        vision: false,
        globalLight: false,
        globalLightThreshold: 0,
        sightLimit: null,
        daylightColor: "",
        darknessColor: "",
        darkness: 0,
        saturation: 0
    })) {
        if (sheet.form.elements[`perfect-vision.${key}.override`].checked) {
            html.find(`*[name="flags.perfect-vision.${key}"]`)
                .prop("disabled", false);
            html.find(`*[id="perfect-vision.${key}.value"]`)
                .removeClass("disabled")
            html.find(`*[id="perfect-vision.${key}.enable"]`)
                .prop("disabled", false);
            html.find(`*[data-edit="flags.perfect-vision.${key}"]`)
                .prop("disabled", false);
        } else {
            if (typeof defautValue === "boolean") {
                html.find(`*[name="flags.perfect-vision.${key}"]`)
                    .prop("disabled", true)
                    .prop("checked", data.parent[key] ?? defautValue);
            } else {
                html.find(`*[name="flags.perfect-vision.${key}"]`)
                    .prop("disabled", true)
                    .val(data.parent[key] ?? defautValue);
                html.find(`*[id="perfect-vision.${key}.value"]`)
                    .addClass("disabled")
                    .html(data.parent[key] ?? defautValue);
                html.find(`*[id="perfect-vision.${key}.enable"]`)
                    .prop("disabled", true)
                    .prop("checked", data.parent[key] !== null);

                if (key === "daylightColor" || key === "darknessColor") {
                    html.find(`*[data-edit="flags.perfect-vision.${key}"]`)
                        .prop("disabled", true)
                        .val(data.parent[key] || ("#" + ("000000" + CONFIG.Canvas[key].toString(16)).slice(-6)));
                }
            }
        }
    }
}
