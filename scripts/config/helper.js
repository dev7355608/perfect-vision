import { updateLighting as updateDrawingLighting } from "../core/lighting-drawing.js";
import { LightingSystem } from "../core/lighting-system.js";
import { updateLighting as updateSceneLighting } from "../core/lighting-scene.js";
import { GlobalLightConfig } from "./global-light-config.js";

export class LightingConfigHelper {
    static getComputedData(scene, id) {
        const mergeData = (data, prototypeData, defaultData) => {
            prototypeData ??= defaultData;

            for (const key in defaultData) {
                const defaultValue = defaultData[key];

                if (data[key] === undefined) {
                    data[key] = foundry.utils.deepClone(prototypeData[key] ?? defaultValue);
                } else if (defaultValue != null && typeof defaultValue === "object" && !Array.isArray(defaultValue)) {
                    mergeData(data[key], prototypeData[key], defaultValue);
                }
            }

            return data;
        }

        if (!id) {
            const data = mergeData(foundry.utils.deepClone(scene.flags["perfect-vision"] ?? {}), null, LightingSystem.getDefaultData());

            data.enabled = true;
            data.fogExploration = scene.fogExploration;
            data.globalLight.enabled = scene.globalLight;
            data.globalLight.darkness.max = scene.globalLightThreshold ?? 1;
            data.darkness = scene.darkness;

            return data;
        }

        const document = scene.drawings.get(id);

        if (!document) {
            return foundry.utils.mergeObject(LightingSystem.getDefaultData(), { id, enabled: false });
        }

        const data = foundry.utils.deepClone(document.flags["perfect-vision"] ?? {});

        data.id = id;
        data.prototypes = [data.prototype, ...data.prototypes ?? []];
        data.prototype = this.getComputedData(scene, data.prototype);
        data.enabled = !!data.enabled;

        return mergeData(data, data.prototype, LightingSystem.getDefaultData());
    }

    static * #getComputedFields(sheet) {
        const { document, form } = sheet;

        if (!(document.parent instanceof Scene)) {
            return;
        }

        const defaultData = LightingSystem.getDefaultData();
        const prototypeData = this.getComputedData(document.parent, document.id).prototype;

        for (const element of form.elements) {
            if (element.tagName === "BUTTON") {
                continue;
            }

            const flag = element.name;

            if (!flag?.startsWith("flags.perfect-vision.")) {
                continue;
            }

            const overrideBox = element.parentNode.querySelector(`input.perfect-vision--override[type="checkbox"]`);

            if (!overrideBox) {
                continue;
            }

            const key = flag.slice("flags.perfect-vision.".length);
            let defaultValue = foundry.utils.getProperty(defaultData, key);
            let prototypeValue = foundry.utils.getProperty(prototypeData, key);

            if (element.classList.contains("color")) {
                prototypeValue = prototypeValue != null && prototypeValue != "" ? Color.from(prototypeValue).css : "";
                defaultValue = defaultValue != null && defaultValue != "" ? Color.from(defaultValue).css : "";
            }

            yield [element, overrideBox.checked, prototypeValue, defaultValue];
        }
    }

    static processSumbitData(sheet, data) {
        data = foundry.utils.flattenObject(data);

        const prototype = data["flags.perfect-vision.prototype"];

        if (prototype != null && (prototype === "" || this.getComputedData(sheet.document.parent, prototype).prototypes.includes(sheet.document.id))) {
            data["flags.perfect-vision.prototype"] = null;
        }

        if (data["flags.perfect-vision.globalLight.color"] === "") {
            data["flags.perfect-vision.globalLight.color"] = null;
        }

        if (data["flags.perfect-vision.globalLight.animation.type"] === "") {
            data["flags.perfect-vision.globalLight.animation.type"] = null;
        }

        if (data["flags.perfect-vision.daylightColor"] === "") {
            data["flags.perfect-vision.daylightColor"] = null;
        }

        if (data["flags.perfect-vision.darknessColor"] === "") {
            data["flags.perfect-vision.darknessColor"] = null;
        }

        for (const [element, override] of this.#getComputedFields(sheet)) {
            const flag = element.name;

            if (!override) {
                delete data[flag];

                const flagParts = flag.split(".");

                data[`${flagParts.slice(0, -1).join(".")}.-=${flagParts.at(-1)}`] = null;
            } else {
                if (element.type === "range") {
                    const enableBox = element.previousElementSibling?.querySelector(`input[type="checkbox"]`);

                    if (enableBox?.checked === false) {
                        data[flag] = null;
                    }
                } else if (element.classList.contains("color")) {
                    if (!(typeof data[flag] === "string" && /^#[0-9A-F]{6,6}$/i.test(data[flag]))) {
                        data[flag] = null;
                    } else {
                        data[flag] = data[flag].toLowerCase();
                    }
                }
            }
        }

        return data;
    }

    static updateFormFields(sheet, event) {
        if (event) {
            if (event.target.type === "color" && event.target.dataset.edit?.startsWith("flags.perfect-vision.")) {
                sheet.form.elements[event.target.dataset.edit].value = event.target.value;
            }
        }

        for (const [element, override, prototypeValue, defaultValue] of this.#getComputedFields(sheet)) {
            element.disabled = !override;
            element.parentNode.querySelectorAll(`button`).forEach(e => e.disabled = element.disabled);

            if (element.type === "checkbox") {
                if (element.disabled) {
                    element.checked = prototypeValue;
                }
            } else if (element.type === "range") {
                if (element.disabled) {
                    element.value = prototypeValue;
                }

                const rangeValue = element.parentNode.querySelector(`span.range-value`);

                if (element.disabled) {
                    rangeValue.innerHTML = element.value;
                    rangeValue.classList.add("disabled");
                } else {
                    rangeValue.classList.remove("disabled");
                }

                const enableBox = element.previousElementSibling?.querySelector(`input[type="checkbox"]`);

                if (enableBox) {
                    enableBox.disabled = element.disabled;

                    if (element.disabled) {
                        enableBox.checked = prototypeValue !== null;
                    }
                }
            } else if (element.classList.contains("color")) {
                if (element.disabled) {
                    element.value = prototypeValue;
                }

                element.placeholder = defaultValue ?? "";

                const colorInput = element.parentNode.querySelector(`input[type="color"]`)

                colorInput.disabled = element.disabled;

                if (element.disabled) {
                    colorInput.value = element.value || element.placeholder || "#000000";
                }
            } else if (element.type === "select-one" || element.type === "select-multiple") {
                if (element.disabled) {
                    if (element.dataset.type?.equals("Number")) {
                        element.value = prototypeValue;
                    } else {
                        element.value = prototypeValue ?? "";
                    }
                }
            } else if (element.type === "number") {
                element.placeholder = defaultValue !== Infinity ? (defaultValue ?? "") : "∞";

                if (element.disabled) {
                    element.value = Number.isFinite(prototypeValue) ? prototypeValue : null;
                }
            } else {
                element.placeholder = defaultValue ?? "";

                if (element.disabled) {
                    element.value = prototypeValue;
                }
            }
        }

        this.#saveFormData(sheet);
        this.#refreshPreview(sheet);
    }

    static getData(sheet, includeDeletions = false) {
        const document = sheet.document;
        const data = foundry.utils.expandObject({
            "flags.perfect-vision": foundry.utils.deepClone(
                foundry.utils.getProperty(document, "flags.perfect-vision")
            ) ?? {}
        });

        if (sheet instanceof SceneConfig) {
            data.tokenVision = document.tokenVision;
            data.fogExploration = document.fogExploration;
            data.fogOverlay = document.fogOverlay;
            data.fogUnexploredColor = document.fogUnexploredColor;
            data.fogExploredColor = document.fogExploredColor;
            data.darkness = document.darkness;
        } else if (sheet instanceof GlobalLightConfig && sheet.object instanceof Scene) {
            data.globalLight = document.globalLight;
            data.globalLightThreshold = document.globalLightThreshold;
        }

        foundry.utils.mergeObject(
            data,
            this.#getFormData(sheet),
            { performDeletions: !includeDeletions }
        );

        return data;
    }

    static close(sheet, options = {}) {
        this.#clearFormData(sheet);

        if (!options.force) {
            sheet.document.reset();
            this.#resetPreview(sheet);
        }
    }

    static #formData = new Map();

    static #saveFormData(sheet) {
        const submitData = sheet._getSubmitData();
        const formData = foundry.utils.expandObject({
            "flags.perfect-vision": foundry.utils.deepClone(
                foundry.utils.getProperty(
                    foundry.utils.expandObject(submitData),
                    "flags.perfect-vision"
                )
            )
        });

        if (sheet instanceof SceneConfig) {
            formData.tokenVision = !!submitData.tokenVision;
            formData.fogExploration = !!submitData.fogExploration;
            formData.fogOverlay = submitData.fogOverlay;
            formData.fogUnexploredColor = submitData.fogUnexploredColor;
            formData.fogExploredColor = submitData.fogExploredColor;
            formData.darkness = submitData.darkness;
        } else if (sheet instanceof GlobalLightConfig && sheet.object instanceof Scene) {
            formData.globalLight = submitData.globalLight;
            formData.globalLightThreshold = submitData.globalLightThreshold;
        }

        this.#formData.set(sheet.id, formData);
    }

    static #getFormData(sheet) {
        return foundry.utils.deepClone(this.#formData.get(sheet.id)) ?? {};
    }

    static #clearFormData(sheet) {
        this.#formData.delete(sheet.id);
    }

    static #refreshPreview(sheet) {
        const document = sheet.document;

        if (document instanceof Scene) {
            if (!document.isView) {
                return;
            }
        } else if (document instanceof DrawingDocument) {
            if (!document.rendered) {
                return;
            }
        } else {
            return;
        }

        const previewData = this.#getFormData(sheet);

        delete previewData.tokenVision;
        delete previewData.fogExploration;

        if (previewData.flags?.["perfect-vision"]?.fogExploration) {
            delete previewData.flags["perfect-vision"].fogExploration;
        }

        document.reset();
        foundry.utils.mergeObject(document, previewData, { performDeletions: true });

        if (document instanceof Scene) {
            updateSceneLighting();
        } else {
            updateDrawingLighting(document.object);
        }
    }

    static #resetPreview(sheet) {
        const document = sheet.document;

        if (document instanceof Scene) {
            if (!document.isView) {
                return;
            }
        } else if (document instanceof DrawingDocument) {
            if (!document.rendered) {
                return;
            }
        } else {
            return;
        }

        if (document instanceof Scene) {
            updateSceneLighting();
        } else {
            updateDrawingLighting(document.object);
        }
    }

    static resetDefaults(sheet) {
        const document = sheet.document;
        const defaults = {};

        for (const element of sheet.form.elements) {
            if (element.tagName === "BUTTON") {
                continue;
            }

            if (element.name?.startsWith("flags.perfect-vision.")) {
                const flagParts = element.name.split(".");

                defaults[`${flagParts.slice(0, -1).join(".")}.-=${flagParts.at(-1)}`] = null;
            }
        }

        if (document instanceof Scene) {
            const sceneDefaults = Scene.cleanData();

            defaults.globalLight = sceneDefaults.globalLight;
            defaults.globalLightThreshold = sceneDefaults.globalLightThreshold;
        }

        foundry.utils.mergeObject(document, defaults, { performDeletions: true });

        this.#clearFormData(sheet);
        sheet.render();

        if (document instanceof Scene) {
            if (!document.isView) {
                return;
            }
        } else if (document instanceof DrawingDocument) {
            if (!document.rendered) {
                return;
            }
        } else {
            return;
        }

        if (document instanceof Scene) {
            updateSceneLighting();
        } else {
            updateDrawingLighting(document.object);
        }
    }
}
