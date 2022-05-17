import { patch } from "../utils/patch.js";
import { Sprite } from "../utils/sprite.js";
import { CanvasFramebuffer } from "../utils/canvas-framebuffer.js";
import { hasChanged } from "../utils/helpers.js";

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
        if (this._pv_geometry) {
            this._pv_geometry.refCount--;

            if (this._pv_geometry.refCount === 0) {
                this._pv_geometry.dispose();
            }

            this._pv_geometry = null;
        }

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
            || hasChanged(data, "flags.perfect-vision.lighting"))) {
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

        if (this._pv_geometry) {
            this._pv_geometry.refCount--;

            if (this._pv_geometry.refCount === 0) {
                this._pv_geometry.dispose();
            }

            this._pv_geometry = null;
        }
    });
});

if (!Tile.prototype._onHandleMouseUp) {
    Tile.prototype._onHandleMouseUp = function (event) { };
}

Tile.prototype._pv_getOcclusionFilter = function () {
    if (!this.data.overhead || !this.id) {
        return null;
    }

    let filter = this.occlusionFilter;

    if (game.modules.get("betterroofs")?.active && this.document.getFlag("betterroofs", "brMode") === 3) {
        if (!(filter instanceof VisionTileOcclusionMaskFilter)) {
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
        this.occlusionFilter.enabled = canvas.tokens.controlled.length !== 0 && !(
            this.occluded && (this.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.FADE || this.data.occlusion.mode === CONST.TILE_OCCLUSION_MODES.ROOF));
    }

    if (!this.data.overhead || !this.id) {
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

    if (!this.data.overhead || !this.id) {
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
        sprite.colorMask = colorMask;
    }

    return sprite;
};

Tile.prototype._pv_getGeometry = function () {
    if (this._pv_geometry) {
        return this._pv_geometry;
    }

    if (!this.tile || !this.texture) {
        return null;
    }

    this.tile.transform.updateLocalTransform();

    const data = new Float32Array(16);
    const trim = this.texture.trim;
    const orig = this.texture.orig;
    const uvs = this.texture._uvs.uvsFloat32;
    const anchor = this.tile.anchor;
    const { a, b, c, d, tx, ty } = this.tile.transform.localTransform;
    const { x, y } = this.data;

    let w0 = 0;
    let w1 = 0;
    let h0 = 0;
    let h1 = 0;

    if (trim) {
        w1 = trim.x - anchor.x * orig.width;
        w0 = w1 + trim.width;

        h1 = trim.y - anchor.y * orig.height;
        h0 = h1 + trim.height;
    } else {
        w1 = -anchor.x * orig.width;
        w0 = w1 + orig.width;

        h1 = -anchor.y * orig.height;
        h0 = h1 + orig.height;
    }

    data[0] = a * w1 + c * h1 + tx + x;
    data[1] = d * h1 + b * w1 + ty + y;
    data[2] = uvs[0];
    data[3] = uvs[1];
    data[4] = a * w0 + c * h1 + tx + x;
    data[5] = d * h1 + b * w0 + ty + y;
    data[6] = uvs[2];
    data[7] = uvs[3];
    data[8] = a * w0 + c * h0 + tx + x;
    data[9] = d * h0 + b * w0 + ty + y;
    data[10] = uvs[4];
    data[11] = uvs[5];
    data[12] = a * w1 + c * h0 + tx + x;
    data[13] = d * h0 + b * w1 + ty + y;
    data[14] = uvs[6];
    data[15] = uvs[7];

    const xMin = Math.min(data[0], data[4], data[8], data[12]);
    const xMax = Math.max(data[0], data[4], data[8], data[12]);
    const yMin = Math.min(data[1], data[5], data[9], data[13]);
    const yMax = Math.max(data[1], data[5], data[9], data[13]);
    const bounds = new PIXI.Rectangle(xMin, yMin, xMax - xMin, yMax - yMin);

    const buffer = new PIXI.Buffer(data, true, false);
    const geometry = new PIXI.Geometry()
        .addAttribute("aVertexPosition", buffer, 2, false, PIXI.TYPES.FLOAT)
        .addAttribute("aTextureCoord", buffer, 2, false, PIXI.TYPES.FLOAT);

    geometry.drawMode = PIXI.DRAW_MODES.TRIANGLE_FAN;
    geometry.bounds = bounds;
    geometry.refCount++;

    return this._pv_geometry = geometry;
};

Tile.prototype._pv_createRoofSprite = function (shader) {
    shader.texture = PIXI.Texture.EMPTY;

    const sprite = new Sprite(shader);

    sprite.blendMode = PIXI.BLEND_MODES.NORMAL_NPM;

    return sprite;
};

Tile.prototype._pv_updateRoofSprite = function (sprite, invertedAlpha = false) {
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

    if (this.occlusionFilter?.enabled) {
        uniforms.uAlpha = this.occlusionFilter.alpha;
        uniforms.uOcclusionAlpha = this.occlusionFilter.occlusionAlpha;
        uniforms.uOcclusionSampler = this.occlusionFilter.occlusionTexture;
    } else {
        uniforms.uAlpha = 1;
        uniforms.uOcclusionAlpha = 0;
        uniforms.uOcclusionSampler = PIXI.Texture.EMPTY;
    }

    uniforms.uAlpha *= tile.alpha;
    uniforms.uOcclusionAlpha *= tile.alpha;

    if (invertedAlpha) {
        uniforms.uAlpha = 1 - uniforms.uAlpha;
        uniforms.uOcclusionAlpha = 1 - uniforms.uOcclusionAlpha;
    }

    if (uniforms.uOcclusionSampler === PIXI.Texture.EMPTY) {
        sprite.visible = uniforms.uAlpha > 0.001;
    } else {
        sprite.visible = uniforms.uAlpha > 0.001 || uniforms.uOcclusionAlpha > 0.001;
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

    return this._pv_updateRoofSprite(this._pv_lightingSprite, false);
};

Tile.prototype._pv_drawWeatherSprite = function () {
    if (!this._pv_weatherSprite) {
        this._pv_weatherSprite = this._pv_createRoofSprite(new WeatherSpriteShader());
    }

    return this._pv_updateRoofSprite(this._pv_weatherSprite, true);
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

        uniform sampler2D uSampler;
        uniform sampler2D uOcclusionSampler;
        uniform float uAlpha;
        uniform float uOcclusionAlpha;
        uniform float uDarknessLevel;
        uniform float uSaturationLevel;
        uniform vec3 uColorBackground;
        uniform vec3 uColorDarkness;

        layout(location = 0) out vec4 textures[3];

        void main(void) {
            vec4 mask = texture(uOcclusionSampler, vMaskCoord);
            float alpha = texture(uSampler, vTextureCoord).a * mix(uAlpha, uOcclusionAlpha, min(mask.r, mask.g));

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

        uniform sampler2D uSampler;
        uniform sampler2D uOcclusionSampler;
        uniform float uAlpha;
        uniform float uOcclusionAlpha;

        layout(location = 0) out vec4 textures[1];

        void main(void) {
            vec4 mask = texture(uOcclusionSampler, vMaskCoord);
            float alpha = texture(uSampler, vTextureCoord).a * mix(uAlpha, uOcclusionAlpha, min(mask.r, mask.g));

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
