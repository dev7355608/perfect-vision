import { Tiles } from "./tiles.js";

export class Elevation {
    static MIN = -3.4028234663852886e+38;
    static MAX = +3.4028234663852886e+38;

    static _clamped(elevation) {
        return Math.fround(Math.clamped(elevation, this.MIN, this.MAX));
    }

    static getElevation(placeable) {
        let elevation = 0;

        if (placeable instanceof Token) {
            elevation = this.getTokenElevation(placeable);
        } else if (placeable instanceof Tile) {
            elevation = this.getTileElevation(placeable);
        } else if (placeable instanceof MeasuredTemplate) {
            elevation = this.getTemplateElevation(placeable);
        }

        return elevation;
    }

    static getTokenElevation(token) {
        return this._clamped(token.data.elevation ?? 0);
    }

    static getTileElevation(tile) {
        return Tiles.isOverhead(tile) ? this.MAX : this.MIN;
    }

    static getTemplateElevation(template) {
        return 0;
    }

    static getSourceElevationRange(source, out = undefined) {
        if (!out) {
            out = [0, 0];
        }

        out[0] = this.MIN;
        out[1] = this.MAX;

        return out;
    }
}
