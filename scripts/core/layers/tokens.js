import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";
import { Tokens } from "../tokens.js";

Hooks.once("init", () => {
    patch("TokenLayer.layerOptions", "POST", function (options) {
        return foundry.utils.mergeObject(options, {
            zIndex: SightLayer.layerOptions.zIndex + 100
        });
    });

    patch("Token.prototype.draw", "POST", async function (result) {
        await result;

        this._pv_refresh();

        return this;
    });

    patch("Token.prototype.refresh", "PRE", function () {
        if (this.id && !this._original) {
            if (this._hover) {
                Board.unplace(`Token#${this.id}.border`);
            } else {
                Board.place(`Token#${this.id}.border`, this.border, Board.LAYERS.TOKEN_BORDERS, Board.Z_INDICES.PARENT);
            }
        }

        return arguments;
    });

    patch("Token.prototype.toggleEffect", "POST", async function (result) {
        const active = await result;

        this._pv_refresh();

        return active;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.icon`);
        Board.unplace(`Token#${this.id}.border`);
        Board.unplace(`Token#${this.id}.effects`);

        return arguments;
    });
});

Token.prototype._pv_refresh = function () {
    if (this.id && !this._original) {
        const overhead = Tokens.isOverhead(this);

        if (overhead === undefined) {
            if (Tokens.isDefeated(this)) {
                Board.place(`Token#${this.id}.icon`, this.icon, Board.LAYERS.TOKENS_DEFEATED, Board.Z_INDICES.PARENT);
                Board.place(`Token#${this.id}.effects`, this.effects, Board.LAYERS.TOKEN_EFFECTS, Board.Z_INDICES.PARENT);
            } else {
                Board.place(`Token#${this.id}.icon`, this.icon, Board.LAYERS.TOKENS, Board.Z_INDICES.PARENT);
                Board.unplace(`Token#${this.id}.effects`);
            }
        } else {
            const zIndex = this.data.elevation + 1;

            if (overhead) {
                Board.place(`Token#${this.id}.icon`, this.icon, Board.LAYERS.OVERHEAD_TILES + 1, zIndex);
                Board.unplace(`Token#${this.id}.effects`);
            } else {
                Board.place(`Token#${this.id}.icon`, this.icon, Board.LAYERS.UNDERFOOT_TILES + 1, zIndex);

                if (Tokens.isDefeated(this)) {
                    Board.place(`Token#${this.id}.effects`, this.effects, Board.LAYERS.TOKEN_EFFECTS, Board.Z_INDICES.PARENT);
                } else {
                    Board.unplace(`Token#${this.id}.effects`);
                }
            }
        }
    }
};
