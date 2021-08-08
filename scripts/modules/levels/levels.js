import { Board } from "../../core/board.js";
import { Elevation } from "../../core/elevation.js";
import { patch } from "../../utils/patch.js";
import { Tiles } from "../../core/tiles.js";
import { Tokens } from "../../core/tokens.js";
import { Mask } from "../../core/mask.js";

let _levelsTokenRefreshPatched = false;

if (self._levelsTokenRefresh) {
    const old_levelsTokenRefresh = self._levelsTokenRefresh;

    self._levelsTokenRefresh = function _levelsTokenRefresh() {
        old_levelsTokenRefresh.apply(this, arguments);

        if (this._pv_overhead !== undefined) {
            this.icon.visible = true;
        }

        return this;
    };

    _levelsTokenRefreshPatched = true;
}

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

    patch("Levels.prototype.computeLightsForTile", "OVERRIDE", function () { });

    patch("Levels.prototype.lightComputeOcclusion", "OVERRIDE", function () { });

    patch("Levels.prototype.lightClearOcclusions", "OVERRIDE", function () { });

    patch("Levels.prototype.occludeLights", "OVERRIDE", function () { });

    patch("Levels.prototype.unoccludeLights", "OVERRIDE", function () { });

    patch("Levels.prototype.mirrorTileInBackground", "OVERRIDE", function (tileIndex, hideFog = false) {
        let tile = tileIndex instanceof TileDocument ? tileIndex.object : tileIndex.tile;

        if (tile instanceof TileDocument) {
            tile = tile.object;
        }

        if (!tile.tile || !tile.tile.texture.baseTexture) {
            return;
        }

        if (tile._pv_highlight) {
            return;
        }

        tile.alpha = 1;
        tile.visible = true;
        tile.tile.visible = true;

        const zIndex = tileIndex.levelsOverhead ? tileIndex.range[0] + 2 : tileIndex.range[0];

        Board.place(`Tile#${tile.id}.tile`, tile.id && !tile._original ? tile.tile : null, Board.LAYERS.UNDERFOOT_TILES + 1, zIndex);

        tile._pv_overhead = false;

        canvas.perception.schedule({ foreground: { refresh: true } });

        Mask.invalidateAll("tiles");

        this.floorContainer.spriteIndex[tile.id] = true;

        if (hideFog && this.fogHiding) {
            this.obscureFogForTile(tileIndex);
        }
    });

    patch("Levels.prototype.removeTempTile", "OVERRIDE", function (tileIndex) {
        let tile = tileIndex instanceof TileDocument ? tileIndex.object : tileIndex.tile;

        if (tile instanceof TileDocument) {
            tile = tile.object;
        }

        if (tile._pv_highlight) {
            return;
        }

        Board.place(`Tile#${tile.id}.tile`, tile.id && !tile._original ? tile.tile : null, Board.LAYERS.OVERHEAD_TILES, function () { return this.parent.zIndex; });

        tile._pv_overhead = tile.data.overhead;

        canvas.perception.schedule({ foreground: { refresh: true } });

        Mask.invalidateAll("tiles");

        delete this.floorContainer.spriteIndex[tile.id];

        this.clearFogForTile(tileIndex);
    });

    patch("Levels.prototype.getTokenIconSprite", "OVERRIDE", function (token) {
        if (token._controlled || !token.icon || !token.icon.texture.baseTexture) {
            return;
        }

        const zIndex = token.data.elevation + 1;

        Board.place(`Token#${token.id}.icon`, token.id && !token._original ? token.icon : null, Board.LAYERS.TOKENS - 1, zIndex);

        token._pv_overhead = false;

        Mask.invalidateAll("tokens");

        if (!this.floorContainer.spriteIndex[token.id]) {
            token.refresh();
        }

        this.floorContainer.spriteIndex[token.id] = true;
    });

    patch("Levels.prototype.removeTempToken", "OVERRIDE", function (token) {
        if (token._pv_overhead === false) {
            token._pv_overhead = undefined;

            Board.place(`Token#${token.id}.icon`, token.id && !token._original ? token.icon : null, Board.LAYERS.TOKENS, function () { return this.parent.zIndex; });

            Mask.invalidateAll("tokens");

            token.refresh();
        }

        delete this.floorContainer.spriteIndex[token.id];
    });

    patch("Levels.prototype.getTokenIconSpriteOverhead", "OVERRIDE", function (token) {
        if (token._controlled || !token.icon || !token.icon.texture.baseTexture) {
            return;
        }

        const zIndex = token.data.elevation + 1;

        Board.place(`Token#${token.id}.icon`, token.id && !token._original ? token.icon : null, Board.LAYERS.OVERHEAD_TILES + 1, zIndex);

        token._pv_overhead = true;

        Mask.invalidateAll("tokens");

        if (!this.overContainer.spriteIndex[token.id]) {
            token.refresh();
        }

        this.overContainer.spriteIndex[token.id] = true;
    });

    patch("Levels.prototype.removeTempTokenOverhead", "OVERRIDE", function (token) {
        if (token._pv_overhead === true) {
            token._pv_overhead = undefined;

            Board.place(`Token#${token.id}.icon`, token.id && !token._original ? token.icon : null, Board.LAYERS.TOKENS, function () { return this.parent.zIndex; });

            Mask.invalidateAll("tokens");

            token.refresh();
        }

        delete this.overContainer.spriteIndex[token.id];
    });

    if (!_levelsTokenRefreshPatched) {
        patch("Token.prototype.refresh", "POST", function () {
            if (!this._pv_debounce_refresh_levels) {
                this._pv_debounce_refresh_levels = foundry.utils.debounce(() => {
                    if (this._pv_overhead !== undefined) {
                        this.icon.visible = true;
                    }
                }, 0);
            }

            this._pv_debounce_refresh_levels();

            return this;
        });
    }
});
