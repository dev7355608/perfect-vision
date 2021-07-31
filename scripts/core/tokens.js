export class Tokens {
    static isOverhead(token) {
        return false;
    }

    static getOccluding() {
        return game.user.isGM ? canvas.tokens.controlled : canvas.tokens.ownedTokens;
    }
}
