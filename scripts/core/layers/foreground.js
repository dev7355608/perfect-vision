import { patch } from "../../utils/patch.js";
import { Tiles } from "../tiles.js";

Hooks.once("init", () => {
    patch("ForegroundLayer.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: BackgroundLayer.layerOptions.zIndex + 200
        });
    });

    patch("ForegroundLayer.prototype.getZIndex", "OVERRIDE", function () {
        return MapLayer.prototype.getZIndex.call(this);
    });

    patch("ForegroundLayer.prototype.refresh", "POST", function () {
        for (const tile of this.tiles) {
            if (tile.tile) {
                tile.tile.mask = Tiles.getOcclusionMask(tile);
            }
        }

        return this;
    });

    patch("Tile.prototype.getRoofSprite", "POST", function (sprite) {
        if (sprite) {
            sprite.mask = Tiles.getOcclusionMask(this);
        }

        return sprite;
    });

    patch("AbstractBaseMaskFilter.create", "POST", function (filter) {
        filter.resolution = canvas.app.renderer.resolution;
        return filter;
    });
});
