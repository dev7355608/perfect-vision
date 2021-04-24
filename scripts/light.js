import { extend } from "./extend.js";
import { patch } from "./patch.js";

Hooks.once("init", () => {
    patch("LightConfig.prototype._getSubmitData", "POST", function (data) {
        if (data.t === `${CONST.SOURCE_TYPES.LOCAL}_unrestricted`) {
            data.t = CONST.SOURCE_TYPES.LOCAL;
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

        const localUnrestricted = (opts?.type == null || opts.type === CONST.SOURCE_TYPES.LOCAL) && this_.light.getFlag("perfect-vision", "unrestricted");

        if (localUnrestricted) {
            opts = opts ?? {};
            opts.type = CONST.SOURCE_TYPES.UNIVERSAL;
        }

        const retVal = wrapped(opts);

        if (localUnrestricted) {
            this.type = CONST.SOURCE_TYPES.LOCAL;
        }

        return retVal;
    });
});

Hooks.on("renderLightConfig", (sheet, html, data) => {
    const document = sheet.object;

    html.find(`select[name="t"] > option[value="${CONST.SOURCE_TYPES.LOCAL}"]`).after(
        `<option value="${CONST.SOURCE_TYPES.LOCAL}_unrestricted">${game.i18n.localize("LIGHT.TypeLocal")} (Unrestricted)</option>`
    );

    if (document.data.t === CONST.SOURCE_TYPES.LOCAL && document.getFlag("perfect-vision", "unrestricted")) {
        html.find(`select[name="t"] > option[value="${CONST.SOURCE_TYPES.LOCAL}_unrestricted"]`).prop("selected", true);
    }
});

Hooks.on("updateAmbientLight", (document, change, options, userId, arg) => {
    let scene;

    if (isNewerVersion(game.data.version, "0.8")) {
        scene = document.parent;
    } else {
        [scene, document, change, options, userId] = [document, change, options, userId, arg]
    }

    if (!scene?.isView || !hasProperty(change, "flags.perfect-vision"))
        return;

    const light = canvas.lighting.get(document._id);

    if (light) {
        light.updateSource({ defer: true });

        canvas.addPendingOperation("LightingLayer.refresh", canvas.lighting.refresh, canvas.lighting);
        canvas.addPendingOperation("SightLayer.refresh", canvas.sight.refresh, canvas.sight);
    }
});
