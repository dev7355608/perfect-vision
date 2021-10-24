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
        let elevation;

        if (tile.data.overhead) {
            elevation = tile.document.getFlag("levels", "rangeBottom") ?? -Infinity;

            if (elevation === -Infinity && (tile.document.getFlag("levels", "rangeTop") ?? +Infinity) === +Infinity) {
                elevation = +Infinity;
            }
        } else {
            elevation = -Infinity;
        }

        return this._normalize(elevation);
    };

    Elevation.getTemplateElevation = function (template) {
        return this._normalize(template.document.getFlag("levels", "elevation") ?? 0);
    };

    Elevation.getElevationRange = function (object, out = undefined) {
        if (!out) {
            out = [0, 0];
        }

        out[0] = this._normalize(object.document.getFlag("levels", "rangeBottom") ?? -Infinity);
        out[1] = this._normalize(object.document.getFlag("levels", "rangeTop") ?? +Infinity);

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
        this._pv_overhead = undefined;

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

    patch("Levels.prototype.collateVisions", "POST", function () {
        Mask.invalidateAll("tokens");
    });

    patch("Levels.prototype.lightComputeOcclusion", "OVERRIDE", function () { });

    patch("Levels.prototype.lightClearOcclusions", "OVERRIDE", function () { });

    patch("Levels.prototype.occludeLights", "OVERRIDE", function () { });

    patch("Levels.prototype.unoccludeLights", "OVERRIDE", function () { });

    patch("Levels.prototype.mirrorTileInBackground", "OVERRIDE", function (tileIndex, hideFog = false) {
        const tile = tileIndex.tile;

        if (!tile.id || tile._original || !tile.tile || !tile.tile.texture.baseTexture) {
            return;
        }

        if (tile._pv_highlight) {
            return;
        }

        tile.alpha = 1;
        tile.visible = true;
        tile.tile.visible = true;

        tile._pv_overhead = false;

        const zIndex = tileIndex.levelsOverhead ? tileIndex.range[0] + 2 : tileIndex.range[0];

        Board.place(`Tile#${tile.id}.tile`, tile.tile, Board.LAYERS.UNDERFOOT_TILES + 5, zIndex);

        canvas.perception.schedule({ foreground: { refresh: true } });

        this.floorContainer.spriteIndex[tile.id] = true;

        if (hideFog && this.fogHiding) {
            this.obscureFogForTile(tileIndex);
        }

        Mask.invalidateAll("tiles");
    });

    patch("Levels.prototype.removeTempTile", "OVERRIDE", function (tileIndex) {
        const tile = tileIndex.tile;

        if (!tile.id || tile._original || !tile.tile || !tile.tile.texture.baseTexture) {
            return;
        }

        if (tile._pv_highlight) {
            return;
        }

        tile._pv_overhead = tile.data.overhead;

        Board.place(`Tile#${tile.id}.tile`, tile.tile, Board.LAYERS.OVERHEAD_TILES, Board.Z_INDICES.PARENT);

        canvas.perception.schedule({ foreground: { refresh: true } });

        delete this.floorContainer.spriteIndex[tile.id];

        this.clearFogForTile(tileIndex);

        Mask.invalidateAll("tiles");
    });

    patch("Levels.prototype.getTokenIconSprite", "OVERRIDE", function (token) {
        if (!token.id || token._original) {
            return;
        }

        if (token._controlled || !token.icon || !token.icon.texture.baseTexture) {
            return;
        }

        token._pv_overhead = false;
        token._pv_refresh();

        if (!this.floorContainer.spriteIndex[token.id]) {
            token.refresh();
        }

        this.floorContainer.spriteIndex[token.id] = true;

        Mask.invalidateAll("tokens");
    });

    patch("Levels.prototype.removeTempToken", "OVERRIDE", function (token) {
        if (!token.id || token._original) {
            return;
        }

        if (token instanceof Token) {
            if (token._pv_overhead === false) {
                token._pv_overhead = undefined;
                token._pv_refresh();

                token.refresh();

                Mask.invalidateAll("tokens");
            }
        } else {
            Mask.invalidateAll("tokens");
        }

        delete this.floorContainer.spriteIndex[token.id];
    });

    patch("Levels.prototype.getTokenIconSpriteOverhead", "OVERRIDE", function (token) {
        if (!token.id || token._original) {
            return;
        }

        if (token._controlled || !token.icon || !token.icon.texture.baseTexture) {
            return;
        }

        token._pv_overhead = true;
        token._pv_refresh();

        if (!this.overContainer.spriteIndex[token.id]) {
            token.refresh();
        }

        this.overContainer.spriteIndex[token.id] = true;

        Mask.invalidateAll("tokens");
    });

    patch("Levels.prototype.removeTempTokenOverhead", "OVERRIDE", function (token) {
        if (!token.id || token._original) {
            return;
        }

        if (token instanceof Token) {
            if (token._pv_overhead === true) {
                token._pv_overhead = undefined;
                token._pv_refresh();

                token.refresh();

                Mask.invalidateAll("tokens");
            }
        } else {
            Mask.invalidateAll("tokens");
        }

        delete this.overContainer.spriteIndex[token.id];
    });

    patch("Levels.prototype.computeDrawings", "POST", function (result, cToken) {
        if (!cToken) {
            return;
        }

        const tElev = cToken.losHeight;
        let refresh = false;

        for (const drawing of canvas.drawings.placeables) {
            const { rangeBottom, rangeTop } = this.getFlagsForObject(drawing);

            if (!rangeBottom && rangeBottom != 0) {
                continue;
            }

            const skipRender = !(rangeBottom <= tElev && tElev <= rangeTop);

            if (drawing.skipRender !== skipRender) {
                drawing.skipRender = skipRender;

                refresh = true;
            }
        }

        if (refresh) {
            canvas.perception.schedule({
                lighting: { refresh: true },
                sight: { initialize: true, refresh: true }
            });
        }
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
