import { patch } from "../utils/patch.js";
import { Sprite } from "../utils/sprite.js";
import { MaskData, MaskFilter } from "../utils/mask-filter.js";

Hooks.once("init", () => {
    patch("Tile.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        await wrapped(...args);

        if (this._alphaMap?.texture) {
            this._alphaMap.texture.destroy(true);
            delete this._alphaMap.texture;
        }

        if (this.occlusionFilter) {
            this.occlusionFilter.enabled = false;

            if (this.tile) {
                const index = this.tile.filters.indexOf(this.occlusionFilter);

                if (index >= 0) {
                    this.tile.filters.splice(index, 1);
                }

                if (this.tile.filters.length === 0) {
                    this.tile.filters = null;
                }
            }
        }

        return this;
    });

    patch("Tile.prototype.activateListeners", "WRAPPER", function (wrapped) {
        wrapped();

        this.frame.handle.off("mouseup").off("mouseupoutside")
            .on("mouseup", this._onHandleMouseUp.bind(this))
            .on("mouseupoutside", this._onHandleMouseUp.bind(this));
    });

    patch("Tile.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (this._alphaMap?.texture) {
            this._alphaMap.texture.destroy(true);
            delete this._alphaMap.texture;
        }

        if (this.id && !this._original && this.tile) {
            this.tile.mask = this._pv_getOcclusionMask();
        }

        if (!this._pv_frame) {
            this._pv_frame = new ObjectHUD(this);
        } else {
            this._pv_frame.removeChildren();
        }

        this._pv_frame.addChild(this.frame);

        if (this.data.overhead) {
            canvas._pv_highlights_overhead.frames.addChild(this._pv_frame);
        } else {
            canvas._pv_highlights_underfoot.frames.addChild(this._pv_frame);
        }

        return this;
    });

    patch("Tile.prototype.getRoofSprite", "POST", function (sprite) {
        if (sprite) {
            sprite.mask = this._pv_getOcclusionMask();
        }

        return sprite;
    });

    patch("Tile.prototype._onHandleHoverIn", "WRAPPER", function (wrapped, event) {
        wrapped(event);

        this.mouseInteractionManager._handleMouseOver(event);
    });

    patch("Tile.prototype._onHandleHoverOut", "WRAPPER", function (wrapped, event) {
        wrapped(event);

        this.mouseInteractionManager._handleMouseOut(event);
    });

    patch("Tile.prototype._onHandleMouseDown", "WRAPPER", function (wrapped, event) {
        wrapped(event);

        this.mouseInteractionManager._handleMouseDown(event);
    });

    patch("Tile.prototype._onHandleMouseUp", "WRAPPER", function (wrapped, event) {
        wrapped(event);

        this.mouseInteractionManager._handleMouseUp(event);
    });

    patch("Tile.prototype.destroy", "WRAPPER", function (wrapped, options) {
        this._pv_frame?.destroy(options);
        this._pv_frame = null;

        wrapped(options);
    });
});

if (!Tile.prototype._onHandleMouseUp) {
    Tile.prototype._onHandleMouseUp = function (event) { };
}

Tile.prototype._pv_getOcclusionMask = function () {
    if (this._original || !this.data.overhead) {
        return null;
    }

    const occlusionMode = this.data.occlusion.mode;

    if (occlusionMode === CONST.TILE_OCCLUSION_MODES.ROOF) {
        return null;
    } else if (occlusionMode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
        return new TileOcclusionMaskData(canvas.foreground._pv_buffer.sprites[0], new RadialTileOcclusionMaskFilter(this));
    } else if (typeof _betterRoofs !== "undefined" && _betterRoofs.foregroundSightMaskContainers[this.id] /* Better Roofs */) {
        return new TileOcclusionMaskData(CanvasFramebuffer.get("lighting").sprites[0], new VisionTileOcclusionMaskFilter(this));
    }

    return null;
};

Tile.prototype._pv_createSprite = function ({ shader, blendMode, blendColor, colorMask } = {}) {
    const tile = this.tile;
    const texture = this.texture;

    if (!tile || !texture) {
        return;
    }

    let sprite;

    if (shader) {
        shader.texture = texture;

        sprite = new Sprite(shader);
    } else {
        sprite = new PIXI.Sprite(texture);
    }

    sprite.width = tile.width;
    sprite.height = tile.height;
    sprite.anchor = tile.anchor;
    sprite.pivot = tile.pivot;
    sprite.position.set(this.data.x + tile.position.x, this.data.y + tile.position.y);
    sprite.rotation = tile.rotation;
    sprite.skew = tile.skew;
    sprite.alpha = tile.alpha;
    sprite.mask = this._pv_getOcclusionMask();

    if (blendMode) {
        if (sprite.mask) {
            // TODO: change to `sprite.mask.blendMode = blendMode` in pixi.js 6.3.0+
            sprite.mask.filter.blendMode = blendMode;
        } else {
            sprite.blendMode = blendMode;
        }
    }

    if (blendColor) {
        if (sprite.mask) {
            sprite.mask.filter.blendColor.set(blendColor);
        } else {
            sprite.blendColor.set(blendColor);
        }
    }

    if (colorMask) {
        if (sprite.mask) {
            sprite.mask.filter.colorMask.red = !!colorMask.red;
            sprite.mask.filter.colorMask.green = !!colorMask.green;
            sprite.mask.filter.colorMask.blue = !!colorMask.blue;
            sprite.mask.filter.colorMask.alpha = !!colorMask.alpha;
        } else {
            sprite.colorMask.red = !!colorMask.red;
            sprite.colorMask.green = !!colorMask.green;
            sprite.colorMask.blue = !!colorMask.blue;
            sprite.colorMask.alpha = !!colorMask.alpha;
        }
    }

    return sprite;
};

class TileOcclusionMaskFilter extends MaskFilter {
    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;
        uniform float uOcclusionAlpha;

        void main() {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uMask, vMaskCoord);
            float r = mask.r;
            float g = mask.g;
            float b = mask.b;
            float a = mask.a;

            gl_FragColor = color * mix(uOcclusionAlpha, 1.0, %mask%);
        }`;

    constructor(tile, mask) {
        super(undefined, TileOcclusionMaskFilter.fragmentSrc.replace(/%mask%/gm, mask), { uOcclusionAlpha: 0 });

        this.tile = tile;
    }

    apply(filterManager, input, output, clearMode, currentState) {
        this.uniforms.uOcclusionAlpha = this.tile.data.occlusion.alpha;

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}

class RadialTileOcclusionMaskFilter extends TileOcclusionMaskFilter {
    constructor(tile) {
        super(tile, "r");
    }
}

class VisionTileOcclusionMaskFilter extends TileOcclusionMaskFilter {
    constructor(tile) {
        super(tile, "1.0 - min(r, g)");
    }
}

class TileOcclusionMaskData extends MaskData {
    constructor(sprite, filter) {
        super(sprite, filter);
    }

    get enabled() {
        return canvas.tokens.controlled.length !== 0;
    }

    set enabled(value) { }
}
