import { Board } from "../../../core/board.js";
import { patch } from "../../../utils/patch.js";

Hooks.once("setup", () => {
    if (!game.modules.get("sequencer")?.active) {
        return;
    }

    const BaseEffectsLayer = CONFIG.Canvas.layers.sequencerEffectsAboveTokens;
    const BelowTokensEffectsLayer = CONFIG.Canvas.layers.sequencerEffectsBelowTokens;

    console.assert(BelowTokensEffectsLayer.prototype instanceof BaseEffectsLayer);

    patch("CONFIG.Canvas.layers.sequencerEffectsAboveTokens.prototype.draw", "POST", async function (result) {
        await result;

        if (this instanceof BelowTokensEffectsLayer) {
            Board.get("primary").place("sequencer.below-tokens", this, "tokens-10");
        } else {
            Board.get("primary").place("sequencer.above-tokens", this, "effects");
        }

        return this;
    });

    patch("CONFIG.Canvas.layers.sequencerEffectsAboveTokens.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        if (this instanceof BelowTokensEffectsLayer) {
            Board.unplace("sequencer.below-tokens");
        } else {
            Board.unplace("sequencer.above-tokens");
        }

        return await wrapped(...args);
    });
});