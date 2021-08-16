export class Tokens {
    static isOverhead(token) {
        return undefined;
    }

    static isDefeated(token) {
        if (token.data.overlayEffect === CONFIG.controlIcons.defeated) {
            return true;
        }

        if (token.actor) {
            const defeatedStatusId = CONFIG.Combat.defeatedStatusId;

            for (const effect of token.actor.data.effects.values()) {
                if (!effect.data.flags?.core) {
                    continue;
                }

                const { statusId, overlay } = effect.data.flags.core;

                if (statusId === defeatedStatusId && overlay) {
                    return true;
                }
            }
        }

        return false;
    }
}
