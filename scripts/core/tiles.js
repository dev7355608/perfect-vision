import { patch } from "../utils/patch.js";
import { Sprite } from "../utils/sprite.js";
import { MaskData, MaskFilter } from "../utils/mask-filter.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";
import { LightingSystem } from "./lighting-system.js";

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

        this._pv_refreshOcclusion();

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

        if (!this.isRoof) {
            if (this._pv_lightingSprite) {
                this._pv_lightingSprite.destroy();
                this._pv_lightingSprite = null;
            }

            if (this._pv_weatherSprite) {
                this._pv_weatherSprite.destroy();
                this._pv_weatherSprite = null;
            }
        }

        return this;
    });

    patch("Tile.prototype._onUpdate", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        if (this._alphaMap?.texture) {
            this._alphaMap.texture.destroy(true);
            delete this._alphaMap.texture;
        }
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

        if (this._pv_lightingSprite) {
            this._pv_lightingSprite.destroy();
            this._pv_lightingSprite = null;
        }

        if (this._pv_weatherSprite) {
            this._pv_weatherSprite.destroy();
            this._pv_weatherSprite = null;
        }

        const occlusionRadial = this.tile && this.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL;

        wrapped(options);

        if (occlusionRadial) {
            let dispose = true;

            for (const tile of canvas.foreground.tiles) {
                if (tile.tile && tile.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
                    dispose = false;

                    break;
                }
            }

            if (dispose) {
                CanvasFramebuffer.get("occlusionRadial").dispose();
            }
        }
    });
});

if (!Tile.prototype._onHandleMouseUp) {
    Tile.prototype._onHandleMouseUp = function (event) { };
}

Tile.prototype._pv_getOcclusionMask = function () {
    if (!this.data.overhead || this._original) {
        return null;
    }

    let mask = null;

    if (game.modules.get("betterroofs")?.active && this.document.getFlag("betterroofs", "brMode") === 3) {
        mask = new TileOcclusionMaskData(CanvasFramebuffer.get("lighting").sprites[0], new VisionTileOcclusionMaskFilter());
    } else if (this.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
        mask = new TileOcclusionMaskData(CanvasFramebuffer.get("occlusionRadial").sprites[0], new RadialTileOcclusionMaskFilter());
    }

    return mask;
};

Tile.prototype._pv_refreshOcclusionAlpha = function () {
    if (!this.tile) {
        return;
    }

    if (!this.data.overhead || this._original) {
        this.tile.alpha = (this.data.hidden ? 0.5 : 1.0) * this.data.alpha;
    } else {
        this.tile.alpha = (this.data.hidden ? 0.5 : 1.0) * (canvas.foreground.displayRoofs ? 1.0 : 0.25);

        if (this.tile.mask) {
            this.tile.mask.tileAlpha = this.data.alpha;
            this.tile.mask.occlusionAlpha = this.data.occlusion.alpha;
        } else {
            switch (this.data.occlusion.mode) {
                case CONST.TILE_OCCLUSION_MODES.FADE:
                case CONST.TILE_OCCLUSION_MODES.ROOF:
                    this.tile.alpha *= this.occluded ? this.data.occlusion.alpha : this.data.alpha;
            }
        }
    }
};

Tile.prototype._pv_refreshOcclusion = function () {
    if (!this.tile) {
        return;
    }

    if (!this.data.overhead || this._original) {
        this.tile.mask = null;
    } else {
        this.tile.mask = this._pv_getOcclusionMask();
    }

    this._pv_refreshOcclusionAlpha();
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
    sprite.zIndex = this.zIndex;
    sprite.mask = tile.mask;

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

Tile.prototype._pv_createRoofSprite = function (shader) {
    shader.texture = PIXI.Texture.EMPTY;

    const sprite = new Sprite(shader);

    sprite.blendMode = PIXI.BLEND_MODES.NORMAL_NPM;

    return sprite;
};

Tile.prototype._pv_updateRoofSprite = function (sprite) {
    const tile = this.tile;
    const texture = this.texture;

    if (!tile || !texture) {
        return;
    }

    sprite.width = tile.width;
    sprite.height = tile.height;
    sprite.anchor = tile.anchor;
    sprite.pivot = tile.pivot;
    sprite.position.set(this.data.x + tile.position.x, this.data.y + tile.position.y);
    sprite.rotation = tile.rotation;
    sprite.skew = tile.skew;
    sprite.alpha = tile.alpha;
    sprite.zIndex = this.zIndex;

    const shader = sprite.shader;

    shader.texture = texture;

    const uniforms = shader.uniforms;

    if (tile.mask) {
        uniforms.uTileAlpha = tile.mask.tileAlpha;
        uniforms.uOcclusionAlpha = tile.mask.occlusionAlpha;
        uniforms.uOcclusionSampler = tile.mask.occlusionTexture;
    } else {
        uniforms.uTileAlpha = 1;
        uniforms.uOcclusionAlpha = 0;
        uniforms.uOcclusionSampler = PIXI.Texture.WHITE;
    }

    return sprite;
};

Tile.prototype._pv_drawLightingSprite = function () {
    if (!this._pv_lightingSprite) {
        this._pv_lightingSprite = this._pv_createRoofSprite(new LightingSpriteShader());
    }

    // TODO
    this._pv_region = LightingSystem.instance.getRegion("Scene");

    const region = this._pv_region;
    const uniforms = this._pv_lightingSprite.shader.uniforms;

    uniforms.uDarknessLevel = region.darknessLevel;
    uniforms.uSaturationLevel = region.saturationLevel;
    uniforms.uColorBackground.set(region.channels.background.rgb);
    uniforms.uColorDarkness.set(region.channels.darkness.rgb);

    return this._pv_updateRoofSprite(this._pv_lightingSprite);
};

Tile.prototype._pv_drawWeatherSprite = function () {
    if (!this._pv_weatherSprite) {
        this._pv_weatherSprite = this._pv_createRoofSprite(new WeatherSpriteShader());
    }

    return this._pv_updateRoofSprite(this._pv_weatherSprite);
};

class TileOcclusionMaskFilter extends MaskFilter {
    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;
        uniform float uTileAlpha;
        uniform float uOcclusionAlpha;

        void main() {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uMask, vMaskCoord);
            float r = mask.r;
            float g = mask.g;
            float b = mask.b;
            float a = mask.a;

            gl_FragColor = color * mix(uOcclusionAlpha, uTileAlpha, %mask%);
        }`;

    constructor(mask) {
        super(undefined, TileOcclusionMaskFilter.fragmentSrc.replace(/%mask%/gm, mask), {
            uTileAlpha: 1,
            uOcclusionAlpha: 0
        });
    }
}

class RadialTileOcclusionMaskFilter extends TileOcclusionMaskFilter {
    constructor() {
        super("r");
    }
}

class VisionTileOcclusionMaskFilter extends TileOcclusionMaskFilter {
    constructor() {
        super("1.0 - min(r, g)");
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

    get tileAlpha() {
        return this.filter.uniforms.uTileAlpha;
    }

    set tileAlpha(value) {
        this.filter.uniforms.uTileAlpha = value;
    }

    get occlusionAlpha() {
        return this.filter.uniforms.uOcclusionAlpha;
    }

    set occlusionAlpha(value) {
        this.filter.uniforms.uOcclusionAlpha = value;
    }

    get occlusionTexture() {
        return this.maskObject.texture;
    }
}

class LightingSpriteShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        in vec2 aVertexPosition;
        in vec2 aTextureCoord;

        uniform mat3 projectionMatrix;
        uniform vec4 uMaskFrame;

        out vec2 vTextureCoord;
        out vec2 vMaskCoord;

        void main(void) {
            gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);

            vTextureCoord = aTextureCoord;
            vMaskCoord = (aVertexPosition - uMaskFrame.xy) / uMaskFrame.zw;
        }`;

    static fragmentSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        in vec2 vTextureCoord;
        in vec2 vMaskCoord;

        uniform float uAlpha;
        uniform sampler2D uSampler;
        uniform sampler2D uOcclusionSampler;
        uniform float uTileAlpha;
        uniform float uOcclusionAlpha;
        uniform float uDarknessLevel;
        uniform float uSaturationLevel;
        uniform vec3 uColorBackground;
        uniform vec3 uColorDarkness;

        layout(location = 0) out vec4 textures[3];

        void main(void) {
            vec4 mask = texture(uOcclusionSampler, vMaskCoord);
            float alpha = texture(uSampler, vTextureCoord).a * uAlpha * mix(uOcclusionAlpha, uTileAlpha, 1.0 - min(mask.r, mask.g));

            textures[0] = vec4(uDarknessLevel, uSaturationLevel, 0.0, alpha);
            textures[1] = vec4(uColorBackground, alpha);
            textures[2] = vec4(uColorDarkness, alpha);
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    constructor() {
        super(LightingSpriteShader.program, {
            uSampler: PIXI.Texture.EMPTY,
            uOcclusionSampler: PIXI.Texture.WHITE,
            uAlpha: 1,
            uTileAlpha: 1,
            uOcclusionAlpha: 0,
            uDarknessLevel: 0,
            uSaturationLevel: 0,
            uColorBackground: new Float32Array(3),
            uColorDarkness: new Float32Array(3)
        });
    }

    get texture() {
        return this.uniforms.uSampler;
    }

    set texture(value) {
        this.uniforms.uSampler = value;
    }

    get alpha() {
        return this.uniforms.uAlpha;
    }

    set alpha(value) {
        this.uniforms.uAlpha = value;
    }

    update() {
        this.uniforms.uMaskFrame = canvas.app.renderer.screen;
    }
}

class WeatherSpriteShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        in vec2 aVertexPosition;
        in vec2 aTextureCoord;

        uniform mat3 projectionMatrix;
        uniform vec4 uMaskFrame;

        out vec2 vTextureCoord;
        out vec2 vMaskCoord;

        void main(void) {
            gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);

            vTextureCoord = aTextureCoord;
            vMaskCoord = (aVertexPosition - uMaskFrame.xy) / uMaskFrame.zw;
        }`;

    static fragmentSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        in vec2 vTextureCoord;
        in vec2 vMaskCoord;

        uniform float uAlpha;
        uniform sampler2D uSampler;
        uniform sampler2D uOcclusionSampler;
        uniform float uTileAlpha;
        uniform float uOcclusionAlpha;

        layout(location = 0) out vec4 textures[1];

        void main(void) {
            vec4 mask = texture(uOcclusionSampler, vMaskCoord);
            float alpha = texture(uSampler, vTextureCoord).a * uAlpha * mix(uOcclusionAlpha, uTileAlpha, 1.0 - min(mask.r, mask.g));

            textures[0] = vec4(0.0, 0.0, 0.0, 1.0 - alpha);
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    constructor() {
        super(WeatherSpriteShader.program, {
            uSampler: PIXI.Texture.EMPTY,
            uOcclusionSampler: PIXI.Texture.WHITE,
            uAlpha: 1,
            uTileAlpha: 1,
            uOcclusionAlpha: 0
        });
    }

    get texture() {
        return this.uniforms.uSampler;
    }

    set texture(value) {
        this.uniforms.uSampler = value;
    }

    get alpha() {
        return this.uniforms.uAlpha;
    }

    set alpha(value) {
        this.uniforms.uAlpha = value;
    }

    update() {
        this.uniforms.uMaskFrame = canvas.app.renderer.screen;
    }
}
