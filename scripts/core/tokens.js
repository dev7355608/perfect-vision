export class Tokens {
    static isOverhead(token) {
        return undefined;
    }

    static hasOverlayEffect(token) {
        if (token.data.overlayEffect) {
            return true;
        }

        if (token.actor) {
            for (const effect of token.actor.data.effects.values()) {
                if (effect.data.flags?.core?.overlay) {
                    return true;
                }
            }
        }

        return false;
    }
}
