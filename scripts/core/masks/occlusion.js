import { Mask } from "../mask.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    const mask = Mask.create("occlusionRadial", {
        format: PIXI.FORMATS.RED,
        type: PIXI.TYPES.UNSIGNED_BYTE,
        clearColor: [1, 0, 0, 0],
        groups: ["blur"]
    });

    mask.stage.shapes = mask.stage.addChild(new PIXI.LegacyGraphics());

    let updatingOcclusion = false;

    mask.on("updateTexture", (mask) => {
        mask.render();
    });

    Hooks.on("canvasInit", () => {
        mask.stage.filter = canvas.createBlurFilter();
        mask.stage.filter.resolution = mask.texture.resolution;
        mask.stage.filter.multisample = PIXI.MSAA_QUALITY.NONE;
        mask.stage.filters = [mask.stage.filter];
        mask.stage.shapes.clear();

        updatingOcclusion = false;
    });

    patch("Tile.prototype.getRoofSprite", "MIXED", function (wrapped, ...args) {
        if (updatingOcclusion) {
            return undefined;
        }

        return wrapped(...args);
    });

    patch("ForegroundLayer.prototype.updateOcclusion", "WRAPPER", function (wrapped, ...args) {
        updatingOcclusion = true;

        wrapped(...args);

        updatingOcclusion = false;
    });

    patch("ForegroundLayer.prototype._drawOcclusionShapes", "OVERRIDE", function (tokens) {
        mask.stage.shapes.clear();

        if (this.tiles.length !== 0 && tokens?.length > 0) {
            mask.stage.shapes.beginFill();

            for (const token of tokens) {
                const c = token.center;
                const r = Math.max(token.w, token.h);

                mask.stage.shapes.drawCircle(c.x, c.y, r);
            }

            mask.stage.shapes.endFill();

            mask.invalidate();
        }
    });

    patch("ForegroundLayer.prototype._drawOcclusionMask", "OVERRIDE", function () {
        const placeholder = new PIXI.Container();

        placeholder.renderable = false;
        placeholder.tokens = placeholder.addChild(new PIXI.Container());
        placeholder.roofs = placeholder.addChild(new PIXI.Container());

        return placeholder;
    });
});

