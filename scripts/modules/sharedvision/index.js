import { Tokens } from "../../core/tokens.js";

Hooks.once("init", () => {
    if (!game.modules.get("SharedVision")?.active) {
        return;
    }

    import("../../../../SharedVision/src/misc.js").then(module => {
        const isSharedVision = module.isSharedVision;

        Tokens.getOccluding = function () {
            let tokens;

            if (game.user.isGM) {
                tokens = canvas.tokens.controlled;
            } else {
                tokens = [];

                for (const token of canvas.tokens.placeables) {
                    if (token.isOwner || isSharedVision(token)) {
                        tokens.push(token);
                    }
                }
            }

            return tokens;
        }
    });
});
