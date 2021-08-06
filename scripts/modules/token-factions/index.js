import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("token-factions")?.active) {
        return;
    }

    patch("TokenFactions.updateTokenBase", "POST", function (result, token) {
        if (token instanceof Token && token.icon) {
            const flags = token.data.flags["token-factions"];
            const drawFramesByDefault = game.settings.get("token-factions", "draw-frames-by-default");
            const drawFrameOverride = flags ? flags["draw-frame"] : undefined;
            const drawFrame = drawFrameOverride === undefined ? drawFramesByDefault : drawFrameOverride;

            Board.get("highlight").place(`Token#${token.id}.factionBase`, token.id && !token._original ? token.factionBase : null, "tokens-4");
            Board.get("highlight").place(`Token#${token.id}.factionFrame`, token.id && !token._original ? token.factionFrame : null, drawFrame ? "tokens+1" : "tokens-5");
        }
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.factionBase`);
        Board.unplace(`Token#${this.id}.factionFrame`);

        return arguments;
    });
});
