import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    Token._pv_defeatedInBackground = true;

    patch("TokenLayer.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: SightLayer.layerOptions.zIndex + 100
        });
    });

    patch("Token.prototype.draw", "POST", async function (result) {
        await result;

        if (this.id && !this._original) {
            if (Token._pv_defeatedInBackground && isDefeated(this)) {
                Board.place(`Token#${this.id}.icon`, this.icon, Board.LAYERS.UNDERFOOT_TILES + 1, function () { return this.parent?.zIndex ?? 0; });
                Board.place(`Token#${this.id}.effects`, this.effects, Board.LAYERS.TOKEN_EFFECTS, function () { return this.parent?.zIndex ?? 0; });
            } else {
                Board.place(`Token#${this.id}.icon`, this.icon, Board.LAYERS.TOKENS, function () { return this.parent?.zIndex ?? 0; });
                Board.unplace(`Token#${this.id}.effects`);
            }
        }

        return this;
    });

    patch("Token.prototype.refresh", "PRE", function () {
        if (this.id && !this._original) {
            if (this._hover) {
                Board.unplace(`Token#${this.id}.border`);
            } else {
                Board.place(`Token#${this.id}.border`, this.border, Board.LAYERS.TOKEN_BORDERS, function () { return this.parent?.zIndex ?? 0; });
            }
        }

        return arguments;
    });

    patch("Token.prototype.toggleEffect", "POST", async function (result, effect, { overlay }) {
        const active = await result;

        if (Token._pv_defeatedInBackground && this.id && !this._original) {
            if (isDefeated(this)) {
                Board.place(`Token#${this.id}.icon`, this.icon, Board.LAYERS.UNDERFOOT_TILES + 1, function () { return this.parent?.zIndex ?? 0; });
                Board.place(`Token#${this.id}.effects`, this.effects, Board.LAYERS.TOKEN_EFFECTS, function () { return this.parent?.zIndex ?? 0; });
            } else {
                Board.place(`Token#${this.id}.icon`, this.icon, Board.LAYERS.TOKENS, function () { return this.parent?.zIndex ?? 0; });
                Board.unplace(`Token#${this.id}.effects`);
            }
        }

        return active;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.icon`);
        Board.unplace(`Token#${this.id}.border`);
        Board.unplace(`Token#${this.id}.effects`);

        return arguments;
    });
});

function isDefeated(token) {
    if (token.actor) {
        const defeatedStatusId = CONFIG.Combat.defeatedStatusId;

        for (const effect of token.actor.data.effects.values()) {
            const { statusId, overlay } = effect.data.flags.core;

            if (statusId === defeatedStatusId && overlay) {
                return true;
            }
        }
    }

    return token.data.overlayEffect === CONFIG.controlIcons.defeated;
}
