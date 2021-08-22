import { Board } from "../../core/board.js";
import { Tokens } from "../../core/tokens.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-factions")?.active) {
        return;
    }

    Tokens.hasOverlayEffect = function (token) {
        return false;
    };

    let bevelTexture;

    async function loadBevelTexture() {
        bevelTexture = await loadTexture("modules/token-factions/assets/bevel-texture.png");
    }

    patch("TokenFactions.updateTokens", "MIXED", async function (wrapped, tokenData) {
        if (tokenData instanceof Token && (!tokenData.id || tokenData._original)) {
            return;
        }

        if (!bevelTexture || !bevelTexture.baseTexture) {
            loadBevelTexture();
        }

        return await wrapped(tokenData);
    });

    patch("TokenFactions.updateTokenBase", "OVERRIDE", function (token) {
        if (!token.id || token._original) {
            return;
        }

        if (token instanceof Token && token.icon && bevelTexture && bevelTexture.baseTexture) {
            const flags = token.data.flags["token-factions"];
            const drawFramesByDefault = game.settings.get("token-factions", "draw-frames-by-default");
            const drawFrameOverride = flags ? flags["draw-frame"] : undefined;
            const drawFrame = drawFrameOverride === undefined ? drawFramesByDefault : drawFrameOverride;
            const colorFrom = game.settings.get("token-factions", "color-from");
            let color;

            if (!token.factionBase) {
                token.factionBase = token.addChildAt(
                    new PIXI.Container(), token.getChildIndex(token.icon) - 1,
                );

                Board.place(`Token#${token.id}.factionBase`, token.factionBase, Board.LAYERS.TOKEN_BASES, Board.Z_INDICES.PARENT);
            } else {
                token.factionBase.removeChildren().forEach(c => c.destroy());
            }

            if (!token.factionFrame) {
                token.factionFrame = token.addChildAt(
                    new PIXI.Container(), token.getChildIndex(token.icon) + 1,
                );
            } else {
                token.factionFrame.removeChildren().forEach(c => c.destroy());
            }

            if (colorFrom === "token-disposition") {
                color = TokenFactions.getDispositionColor(token);
            } else if (colorFrom === "actor-folder-color") {
                color = TokenFactions.getFolderColor(token);
            } else { // colorFrom === "custom-disposition"
                color = TokenFactions.getCustomDispositionColor(token);
            }

            if (color) {
                TokenFactions.drawBase({ color, container: token.factionBase, token });

                if (drawFrame) {
                    TokenFactions.drawFrame({ color, container: token.factionFrame, token });
                } else {
                    TokenFactions.drawFrame({ color, container: token.factionBase, token });
                }
            }
        }
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.factionBase`);

        return arguments;
    });
});
