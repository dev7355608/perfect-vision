import { patch } from "../utils/patch.js";
import { Sprite } from "../utils/sprite.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";

Hooks.once("init", () => {
    patch("Tile.prototype.draw", "WRAPPER", async function (wrapped, ...args) {
        await wrapped(...args);

        if (this._alphaMap?.texture) {
            this._alphaMap.texture.destroy(true);
            delete this._alphaMap.texture;
        }

        this._pv_refreshOcclusion();

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

    patch("Tile.prototype._onUpdate", "WRAPPER", function (wrapped, data, ...args) {
        wrapped(data, ...args);

        if (this._alphaMap?.texture) {
            this._alphaMap.texture.destroy(true);
            delete this._alphaMap.texture;
        }

        if (this.isRoof && (["z", "alpha", "hidden"].some(k => k in data)
            || foundry.utils.hasProperty(data, "occlusion.alpha")
            || foundry.utils.hasProperty(data, "flags.perfect-vision.lighting"))) {
            canvas.perception.schedule({ lighting: { refresh: true } });
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

        const occlusionRadialTexture = CanvasFramebuffer.get("occlusionRadial").textures[0];
        const occlusionRadial = this.occlusionFilter?.occlusionTexture === occlusionRadialTexture;

        wrapped(options);

        if (occlusionRadial) {
            let dispose = true;

            for (const tile of canvas.foreground.tiles) {
                if (tile.occlusionFilter?.occlusionTexture === occlusionRadialTexture) {
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

Tile.prototype._pv_getOcclusionFilter = function () {
    if (!this.data.overhead || this._original) {
        return null;
    }

    let filter = this.occlusionFilter;

    if (game.modules.get("betterroofs")?.active && this.document.getFlag("betterroofs", "brMode") === 3) {
        if (this.occluded && (this.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.FADE || this.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.ROOF)) {
            filter = null;
        } else if (!(filter instanceof VisionTileOcclusionMaskFilter)) {
            filter = VisionTileOcclusionMaskFilter.create();
        }
    } else if (this.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.RADIAL) {
        if (!(filter instanceof RadialTileOcclusionMaskFilter)) {
            filter = RadialTileOcclusionMaskFilter.create();
        }
    } else {
        filter = null;
    }

    return filter;
};

Tile.prototype._pv_refreshOcclusionAlpha = function () {
    if (!this.tile) {
        return;
    }

    if (this.occlusionFilter) {
        this.occlusionFilter.enabled = canvas.tokens.controlled.length !== 0;
    }

    if (!this.data.overhead || this._original) {
        this.tile.alpha = Math.min(this.data.alpha, this.data.hidden ? 0.5 : 1.0);
    } else if (this.occlusionFilter?.enabled) {
        this.tile.alpha = 1;
        this.occlusionFilter.alpha = Math.min(this.data.alpha, this.data.hidden ? 0.5 : 1.0);
        this.occlusionFilter.occlusionAlpha = Math.min(this.data.occlusion.alpha, this.data.hidden ? 0.5 : 1.0);
    } else {
        this.tile.alpha = Math.min(this.occluded ? this.data.occlusion.alpha : this.data.alpha, this.data.hidden ? 0.5 : 1.0);

        if (this.data.occlusion.mode !== CONST.TILE_OCCLUSION_MODES.NONE) {
            this.tile.alpha = Math.min(this.tile.alpha, canvas.foreground.displayRoofs ? 1.0 : 0.25);
        }
    }
};

Tile.prototype._pv_refreshOcclusion = function () {
    if (this.occlusionFilter) {
        if (this.tile) {
            const index = this.tile.filters?.indexOf(this.occlusionFilter);

            if (index >= 0) {
                this.tile.filters.splice(index, 1);
            }
        }
    }

    if (!this.data.overhead || this._original) {
        this.occlusionFilter = null;
    } else {
        this.occlusionFilter = this._pv_getOcclusionFilter();

        if (this.occlusionFilter && this.tile) {
            if (this.tile.filters) {
                this.tile.filters.push(this.occlusionFilter);
            } else {
                this.tile.filters = [this.occlusionFilter];
            }
        }
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

    if (blendMode) {
        sprite.blendMode = blendMode;
    }

    if (blendColor) {
        sprite.blendColor.set(blendColor);
    }

    if (colorMask) {
        sprite.colorMask.red = !!colorMask.red;
        sprite.colorMask.green = !!colorMask.green;
        sprite.colorMask.blue = !!colorMask.blue;
        sprite.colorMask.alpha = !!colorMask.alpha;
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
    sprite.alpha = 1;
    sprite.zIndex = this.zIndex;

    const shader = sprite.shader;

    shader.texture = texture;

    const uniforms = shader.uniforms;

    uniforms.uAlpha = tile.alpha;

    if (this.occlusionFilter?.enabled) {
        uniforms.uTileAlpha = this.occlusionFilter.alpha;
        uniforms.uOcclusionAlpha = this.occlusionFilter.occlusionAlpha;
        uniforms.uOcclusionSampler = this.occlusionFilter.occlusionTexture;
    } else {
        uniforms.uTileAlpha = tile.alpha;
        uniforms.uOcclusionAlpha = 0;
        uniforms.uOcclusionSampler = PIXI.Texture.EMPTY;
    }

    return sprite;
};

Tile.prototype._pv_drawLightingSprite = function () {
    if (!this._pv_lightingSprite) {
        this._pv_lightingSprite = this._pv_createRoofSprite(new LightingSpriteShader());
    }

    const region = this._pv_region;
    const uniforms = this._pv_lightingSprite.shader.uniforms;

    uniforms.uDarknessLevel = region.darknessLevel;
    uniforms.uSaturationLevel = region.saturationLevel;
    uniforms.uColorBackground.set(region.channels.background.rgb);
    uniforms.uColorDarkness.set(region.channels.darkness.rgb);

    const sprite = this._pv_updateRoofSprite(this._pv_lightingSprite);

    this._pv_lightingSprite.visible = uniforms.uAlpha > 0;

    return sprite;
};

Tile.prototype._pv_drawWeatherSprite = function () {
    if (!this._pv_weatherSprite) {
        this._pv_weatherSprite = this._pv_createRoofSprite(new WeatherSpriteShader());
    }

    const sprite = this._pv_updateRoofSprite(this._pv_weatherSprite);
    const uniforms = this._pv_weatherSprite.shader.uniforms;

    this._pv_weatherSprite.visible = !(uniforms.uAlpha === 1 && uniforms.uTileAlpha === 1 && uniforms.uOcclusionSampler === PIXI.Texture.EMPTY);

    return sprite;
};

class TileOcclusionMaskFilter extends InverseOcclusionMaskFilter { // TODO
    static fragmentShader(channel) {
        return `\
            precision mediump float;

            varying vec2 vTextureCoord;
            varying vec2 vMaskTextureCoord;

            uniform sampler2D uSampler;
            uniform sampler2D uMaskSampler;
            uniform float alphaOcclusion;
            uniform float alpha;

            void main() {
                vec4 mask = texture2D(uMaskSampler, vMaskTextureCoord);
                float r = mask.r;
                float g = mask.g;
                float b = mask.b;
                float a = mask.a;

                gl_FragColor = texture2D(uSampler, vTextureCoord) * mix(alphaOcclusion, alpha, ${channel});
            }`;
    };

    static create(defaultUniforms = {}, channel = "r") {
        defaultUniforms.alpha = 1.0;
        defaultUniforms.alphaOcclusion = 0.0;

        return super.create(defaultUniforms, channel);
    }

    get resolution() {
        const renderer = canvas.app.renderer;
        const renderTextureSystem = renderer.renderTexture;

        if (renderTextureSystem.current) {
            return renderTextureSystem.current.resolution;
        }

        return renderer.resolution;
    }

    set resolution(value) { }

    get multisample() {
        const renderer = canvas.app.renderer;
        const renderTextureSystem = renderer.renderTexture;

        if (renderTextureSystem.current) {
            return renderTextureSystem.current.multisample;
        }

        return renderer.multisample;
    }

    set multisample(value) { }

    get alpha() {
        return this.uniforms.alpha;
    }

    set alpha(value) {
        this.uniforms.alpha = value;
    }

    get occlusionAlpha() {
        return this.uniforms.alphaOcclusion;
    }

    set occlusionAlpha(value) {
        this.uniforms.alphaOcclusion = value;
    }

    get occlusionTexture() {
        return this.uniforms.uMaskSampler;
    }
}

class RadialTileOcclusionMaskFilter extends TileOcclusionMaskFilter {
    static create() {
        return super.create({ uMaskSampler: CanvasFramebuffer.get("occlusionRadial").textures[0] }, "r");
    }
}

class VisionTileOcclusionMaskFilter extends TileOcclusionMaskFilter {
    static create() {
        return super.create({ uMaskSampler: CanvasFramebuffer.get("lighting").textures[0] }, "1.0 - min(r, g)");
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
            uOcclusionSampler: PIXI.Texture.EMPTY,
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

    set alpha(value) { }

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
            float alpha = texture(uSampler, vTextureCoord).a * (1.0 - uAlpha * mix(uTileAlpha, uOcclusionAlpha, min(mask.r, mask.g)));

            textures[0] = vec4(0.0, 0.0, 0.0, alpha);
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
            uOcclusionSampler: PIXI.Texture.EMPTY,
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

    set alpha(value) { }

    update() {
        this.uniforms.uMaskFrame = canvas.app.renderer.screen;
    }
}
