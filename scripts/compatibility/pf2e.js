import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (game.system.id !== "pf2e") {
        return;
    }

    patch("CONFIG.Token.documentClass.prototype.prepareDerivedData", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (!(this.initialized && this.actor && this.scene)) {
            return;
        }

        if (this.scene.rulesBasedVision && (this.actor.type === "character" || this.actor.type === "familiar")) {
            this.data.dimSight = this.data._source.dimSight = this.hasLowLightVision ? 10000 : 0;
            this.data.brightSight = this.data._source.brightSight = this.hasDarkvision ? 10000 : 0;
        }
    });

    patch("CONFIG.Token.objectClass.prototype.updateSource", "OVERRIDE", function (...args) {
        return Token.prototype.updateSource.apply(this, args);
    });

    patch("CONFIG.Canvas.layers.lighting.layerClass.prototype.setPerceivedLightLevel", "OVERRIDE", function () {
        if (!(canvas.scene && canvas.sight.rulesBasedVision)) {
            return;
        }

        canvas.perception.update({
            sight: { initialize: true, refresh: true, forceUpdateFog: true },
            lighting: { refresh: true },
            sounds: { refresh: true },
            foreground: { refresh: true },
        });
    });

    // CONFIG.Scene.documentClass.prototype.lightLevel
    // CONFIG.Scene.documentClass.prototype.isBright
    // CONFIG.Scene.documentClass.prototype.isDimlyLit
    // CONFIG.Scene.documentClass.prototype.isDark
    // CONFIG.PF2E.Actor.documentClasses.character.prototype.canSee
    // CONFIG.PF2E.Actor.documentClasses.familiar.prototype.canSee
});
