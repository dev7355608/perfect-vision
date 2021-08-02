import { Board } from "../../core/board.js";
import { Elevation } from "../../core/elevation.js";
import { patch } from "../../utils/patch.js";
import { Tiles } from "../../core/tiles.js";
import { Tokens } from "../../core/tokens.js";
import { Mask } from "../../core/mask.js";

Hooks.once("init", () => {
    if (!game.modules.get("levels")?.active) {
        return;
    }

    Elevation.getTileElevation = function (tile) {
        let elevation = +Infinity;

        if (tile.data.overhead) {
            elevation = tile.document.getFlag("levels", "rangeBottom") ?? -Infinity;

            if (elevation === -Infinity && (tile.document.getFlag("levels", "rangeTop") ?? +Infinity) === +Infinity) {
                elevation = +Infinity;
            }
        } else {
            elevation = -Infinity;
        }

        return this._clamped(elevation);
    };

    Elevation.getTemplateElevation = function (template) {
        return this._clamped(template.document.getFlag("levels", "elevation") ?? 0);
    };

    Elevation.getSourceElevationRange = function (source, out = undefined) {
        if (!out) {
            out = [0, 0];
        }

        const object = source.object;

        out[0] = this._clamped(object.document.getFlag("levels", "rangeBottom") ?? -Infinity);
        out[1] = this._clamped(object.document.getFlag("levels", "rangeTop") ?? +Infinity);

        return out;
    };

    Tiles.isOverhead = function (tile) {
        return tile._pv_overhead;
    };

    Tokens.isOverhead = function (token) {
        return token._pv_overhead;
    };

    patch("ForegroundLayer.prototype.refresh", "POST", function () {
        for (const tile of this.tiles) {
            if (!tile.tile) {
                continue;
            }

            if (!tile._pv_overhead) {
                tile.tile.mask = null;
                tile.tile.alpha = Math.min(tile.data.hidden ? 0.5 : 1.0, tile.data.alpha);
            }
        }

        return this;
    });

    patch("Token.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        this._pv_overhead = false;

        return await wrapped(...args);
    });

    patch("Tile.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        this._pv_overhead = this.data.overhead;

        return await wrapped(...args);
    });

    patch("Tile.prototype.updateOcclusion", "MIXED", function (wrapped, ...args) {
        if (!this._pv_overhead) {
            this.occluded = false;
            return;
        }

        return wrapped(...args);
    });

    patch("Levels.prototype.showOwnedTokensForPlayer", "POST", function () {
        Mask.invalidateAll("tokens");
    });

    patch("Levels.prototype.occludeLights", "OVERRIDE", function () { });

    patch("Levels.prototype.unoccludeLights", "OVERRIDE", function () { });

    patch("Levels.prototype.mirrorTileInBackground", "OVERRIDE", function (tileIndex, hideFog = false) {
        const tile = tileIndex.tile;

        tile.visible = true;

        const board = Board.get("primary");
        const name = `Tile#${tile.id}.tile`;

        if (!board.has(name)) {
            return;
        }

        board.place(name, tile.id && !tile._original ? tile.tile : null, "background+1", () => tile.zIndex);

        tile._pv_overhead = false;

        Mask.invalidateAll("tiles");

        canvas.perception.schedule({ foreground: { refresh: true } });

        if (hideFog && this.fogHiding) {
            this.obscureFogForTile(tileIndex);
        }
    });

    patch("Levels.prototype.removeTempTile", "OVERRIDE", function (tileIndex) {
        const tile = tileIndex.tile;

        const board = Board.get("primary");
        const name = `Tile#${tile.id}.tile`;

        if (!board.has(name)) {
            return;
        }

        board.place(name, tile.id && !tile._original ? tile.tile : null, "foreground-1", () => tile.zIndex);

        tile._pv_overhead = tile.data.overhead;

        Mask.invalidateAll("tiles");

        canvas.perception.schedule({ foreground: { refresh: true } });
    });

    patch("Levels.prototype.getTokenIconSprite", "OVERRIDE", function (token) {
        token.icon.alpha = token.data.hidden ? Math.min(token.data.alpha, 0.5) : token.data.alpha;

        Board.get("primary").place(`Token#${token.id}.icon`, token.id && !token._original ? token.icon : null, "background+1", () => token.zIndex);

        token._pv_overhead = false;

        Mask.invalidateAll("tokens");
    });

    patch("Levels.prototype.removeTempToken", "OVERRIDE", function (token) {
        if (token._pv_overhead === false) {
            token._pv_overhead = undefined;

            Board.get("primary").place(`Token#${token.id}.icon`, token.id && !token._original ? token.icon : null, "tokens", () => token.zIndex);

            Mask.invalidateAll("tokens");
        }
    });

    patch("Levels.prototype.getTokenIconSpriteOverhead", "OVERRIDE", function (token) {
        token.icon.alpha = token.data.hidden ? Math.min(token.data.alpha, 0.5) : token.data.alpha;

        Board.get("primary").place(`Token#${token.id}.icon`, token.id && !token._original ? token.icon : null, "foreground-1", () => token.zIndex);

        token._pv_overhead = true;

        Mask.invalidateAll("tokens");
    });

    patch("Levels.prototype.removeTempTokenOverhead", "OVERRIDE", function (token) {
        if (token._pv_overhead === true) {
            token._pv_overhead = undefined;

            Board.get("primary").place(`Token#${token.id}.icon`, token.id && !token._original ? token.icon : null, "tokens", () => token.zIndex);

            Mask.invalidateAll("tokens");
        }
    });
});
