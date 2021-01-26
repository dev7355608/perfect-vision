import { extend } from "./extend.js";
import { patch } from "./patch.js";

Hooks.once("init", () => {
    patch("LightConfig.prototype._getSubmitData", "POST", function (data) {
        if (data.t === `${SOURCE_TYPES.LOCAL}_unrestricted`) {
            data.t = SOURCE_TYPES.LOCAL;
            data["flags.perfect-vision.unrestricted"] = true;
        } else {
            data["flags.perfect-vision.-=unrestricted"] = null;
        }
        return data;
    });

    patch("AmbientLight.prototype.updateSource", "PRE", function () {
        const source_ = extend(this.source);
        source_.isLight = true;
        source_.light = this;
        return arguments;
    });

    patch("PointSource.prototype.initialize", "WRAPPER", function (wrapped, opts) {
        const this_ = extend(this);

        if (!this_.isLight)
            return wrapped(opts);

        const localUnrestricted = (opts?.type == null || opts.type === SOURCE_TYPES.LOCAL) && this_.light.getFlag("perfect-vision", "unrestricted");

        if (localUnrestricted) {
            opts = opts ?? {};
            opts.type = SOURCE_TYPES.UNIVERSAL;
        }

        const retVal = wrapped(opts);

        if (localUnrestricted) {
            this.type = SOURCE_TYPES.LOCAL;
        }

        return retVal;
    });
});

Hooks.on("renderLightConfig", (sheet, html, data) => {
    html.find(`select[name="t"] > option[value="${SOURCE_TYPES.LOCAL}"]`).after(
        `<option value="${SOURCE_TYPES.LOCAL}_unrestricted">${game.i18n.localize("LIGHT.TypeLocal")} (Unrestricted)</option>`
    );

    if (data.object.t === SOURCE_TYPES.LOCAL && sheet.object.getFlag("perfect-vision", "unrestricted")) {
        html.find(`select[name="t"] > option[value="${SOURCE_TYPES.LOCAL}_unrestricted"]`).prop("selected", true);
    }
});

Hooks.on("updateAmbientLight", (scene, data, update, options, userId) => {
    if (scene.id !== canvas.scene?.id || !hasProperty(update, "flags.perfect-vision"))
        return;

    const light = canvas.lighting.get(data._id);

    if (light) {
        light.updateSource({ defer: true });

        canvas.addPendingOperation("LightingLayer.refresh", canvas.lighting.refresh, canvas.lighting);
        canvas.addPendingOperation("SightLayer.refresh", canvas.sight.refresh, canvas.sight);
    }
});
