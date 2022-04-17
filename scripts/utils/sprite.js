const tempPoint = new PIXI.Point();
const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

export class Sprite extends PIXI.Mesh {
    constructor(shader, state) {
        const geometry = new PIXI.Geometry()
            .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(8), false, false), 2, false, PIXI.TYPES.FLOAT)
            .addAttribute("aTextureCoord", new PIXI.Buffer(new Float32Array(8), true, false), 2, false, PIXI.TYPES.FLOAT);

        super(geometry, shader, state, PIXI.DRAW_MODES.TRIANGLE_FAN);

        const texture = this.texture;

        this.isSprite = true;
        this.vertexData = this.geometry.buffers[0].data;
        this.uvs = this.geometry.buffers[1].data;
        this.vertexTrimmedData = null;
        this.indices = indices;
        this._transformTrimmedID = -1;
        this._anchor = new PIXI.ObservablePoint(
            this._onAnchorUpdate,
            this,
            texture ? texture.defaultAnchor.x : 0,
            texture ? texture.defaultAnchor.y : 0
        );
        this._blendColor = null;
        this._colorMask = null;
    }

    get blendColor() {
        return this._blendColor;
    }

    set blendColor(value) {
        if (value) {
            if (!this._blendColor) {
                this._blendColor = new Float32Array(4);
            }

            this._blendColor[0] = value[0];
            this._blendColor[1] = value[1];
            this._blendColor[2] = value[2];
            this._blendColor[3] = value[3];
        } else {
            this._blendColor = null;
        }
    }

    get colorMask() {
        return this._colorMask;
    }

    set colorMask(value) {
        if (value) {
            if (!this._colorMask) {
                this._colorMask = Object.seal([true, true, true, true]);
            }

            this._colorMask[0] = !!value[0];
            this._colorMask[1] = !!value[1];
            this._colorMask[2] = !!value[2];
            this._colorMask[3] = !!value[3];
        } else {
            this._colorMask = null;
        }
    }

    get anchor() {
        return this._anchor;
    }

    set anchor(value) {
        this._anchor.copyFrom(value);
    }

    get width() {
        return Math.abs(this.scale.x) * this.texture.orig.width;
    }

    set width(value) {
        const s = Math.sign(this.scale.x) || 1;

        this.scale.x = s * value / this.texture.orig.width;
        this._width = value;
    }

    get height() {
        return Math.abs(this.scale.y) * this.texture.orig.height;
    }

    set height(value) {
        const s = Math.sign(this.scale.y) || 1;

        this.scale.y = s * value / this.texture.orig.height;
        this._height = value;
    }

    get texture() {
        this._setTexture(this.shader.texture);

        return this._texture;
    }

    set texture(value) {
        this._setTexture(value);
        this.shader.texture = this._texture;
    }

    _setTexture(texture) {
        texture = texture ?? null;

        if (this._texture === texture) {
            return;
        }

        if (this._texture) {
            this._texture.off("update", this._onTextureUpdate, this);
        }

        this._texture = texture || PIXI.Texture.EMPTY;
        this._textureID = -1;
        this._textureTrimmedID = -1;

        if (texture) {
            if (this._texture.baseTexture.valid) {
                this._onTextureUpdate();
            } else {
                this._texture.once("update", this._onTextureUpdate, this);
            }
        }
    }

    _onAnchorUpdate() {
        this._textureID = -1;
        this._transformID = -1;
        this._transformTrimmedID = -1;
    }

    _onTextureUpdate() {
        this._textureID = -1;
        this._textureTrimmedID = -1;

        if (this._width) {
            this.scale.x = Math.sign(this.scale.x) * this._width / this._texture.orig.width;
        }

        if (this._height) {
            this.scale.y = Math.sign(this.scale.y) * this._height / this._texture.orig.height;
        }
    }

    _render(renderer) {
        this.calculateVertices();

        const gl = renderer.gl;
        const blendColor = this._blendColor;

        if (blendColor) {
            const [red, green, blue, alpha] = blendColor;

            gl.blendColor(red, green, blue, alpha);
        }

        let colorMask = this._colorMask;

        if (colorMask) {
            const [red, green, blue, alpha] = colorMask;

            if (red && green && blue && alpha) {
                colorMask = null;
            } else {
                gl.colorMask(red, green, blue, alpha);
            }
        }

        if (!blendColor && !colorMask && this.shader.batchable && !(this.filters && this._enabledFilters?.length || (this.mask && (!this.mask.isMaskData || this.mask.enabled && (this.mask.autoDetect || this.mask.type !== PIXI.MASK_TYPES.NONE))))) {
            this._renderToBatch(renderer);
        } else {
            this._renderDefault(renderer);

            if (colorMask) {
                gl.colorMask(true, true, true, true);
            }
        }
    }

    _renderToBatch(renderer) {
        const shader = this.shader;

        this._tintRGB = shader._tintRGB;

        const pluginName = shader.pluginName;

        renderer.batch.setObjectRenderer(renderer.plugins[pluginName]);
        renderer.plugins[pluginName].render(this);
    }

    _renderDefault(renderer) {
        renderer.batch.flush();

        const shader = this.shader;

        shader.alpha = this.worldAlpha;

        if (shader.update) {
            shader.update();
        }

        renderer.shader.bind(shader);
        renderer.state.set(this.state);
        renderer.geometry.bind(this.geometry, shader);
        renderer.geometry.draw(this.drawMode, this.size, this.start, this.geometry.instanceCount);
    }

    calculateVertices() {
        const texture = this.texture;

        if (this._transformID === this.transform._worldID && this._textureID === texture._updateID) {
            return;
        }

        if (this._textureID !== texture._updateID) {
            this.uvs.set(texture._uvs.uvsFloat32);
            this.geometry.buffers[1].update();
        }

        this._transformID = this.transform._worldID;
        this._textureID = texture._updateID;
        const wt = this.transform.worldTransform;
        const a = wt.a;
        const b = wt.b;
        const c = wt.c;
        const d = wt.d;
        const tx = wt.tx;
        const ty = wt.ty;
        const vertexData = this.vertexData;
        const trim = texture.trim;
        const orig = texture.orig;
        const anchor = this._anchor;

        let w0 = 0;
        let w1 = 0;
        let h0 = 0;
        let h1 = 0;

        if (trim) {
            w1 = trim.x - (anchor._x * orig.width);
            w0 = w1 + trim.width;

            h1 = trim.y - (anchor._y * orig.height);
            h0 = h1 + trim.height;
        } else {
            w1 = -anchor._x * orig.width;
            w0 = w1 + orig.width;

            h1 = -anchor._y * orig.height;
            h0 = h1 + orig.height;
        }

        vertexData[0] = (a * w1) + (c * h1) + tx;
        vertexData[1] = (d * h1) + (b * w1) + ty;

        vertexData[2] = (a * w0) + (c * h1) + tx;
        vertexData[3] = (d * h1) + (b * w0) + ty;

        vertexData[4] = (a * w0) + (c * h0) + tx;
        vertexData[5] = (d * h0) + (b * w0) + ty;

        vertexData[6] = (a * w1) + (c * h0) + tx;
        vertexData[7] = (d * h0) + (b * w1) + ty;

        if (this._roundPixels) {
            const resolution = settings.RESOLUTION;

            for (let i = 0; i < vertexData.length; ++i) {
                vertexData[i] = Math.round((vertexData[i] * resolution | 0) / resolution);
            }
        }

        this.geometry.buffers[0].update();
    }

    calculateTrimmedVertices() {
        const texture = this.texture;

        if (!this.vertexTrimmedData) {
            this.vertexTrimmedData = new Float32Array(8);
        } else if (this._transformTrimmedID === this.transform._worldID && this._textureTrimmedID === texture._updateID) {
            return;
        }

        this._transformTrimmedID = this.transform._worldID;
        this._textureTrimmedID = texture._updateID;

        const vertexData = this.vertexTrimmedData;
        const orig = texture.orig;
        const anchor = this._anchor;

        const wt = this.transform.worldTransform;
        const a = wt.a;
        const b = wt.b;
        const c = wt.c;
        const d = wt.d;
        const tx = wt.tx;
        const ty = wt.ty;

        const w1 = -anchor._x * orig.width;
        const w0 = w1 + orig.width;

        const h1 = -anchor._y * orig.height;
        const h0 = h1 + orig.height;

        vertexData[0] = (a * w1) + (c * h1) + tx;
        vertexData[1] = (d * h1) + (b * w1) + ty;

        vertexData[2] = (a * w0) + (c * h1) + tx;
        vertexData[3] = (d * h1) + (b * w0) + ty;

        vertexData[4] = (a * w0) + (c * h0) + tx;
        vertexData[5] = (d * h0) + (b * w0) + ty;

        vertexData[6] = (a * w1) + (c * h0) + tx;
        vertexData[7] = (d * h0) + (b * w1) + ty;
    }

    calculateUvs() { }

    _calculateBounds() {
        const texture = this.texture;
        const trim = texture.trim;
        const orig = texture.orig;

        if (!trim || trim.width === orig.width && trim.height === orig.height) {
            this.calculateVertices();
            this._bounds.addQuad(this.vertexData);
        }
        else {
            this.calculateTrimmedVertices();
            this._bounds.addQuad(this.vertexTrimmedData);
        }
    }

    getLocalBounds(rect) {
        if (this.children.length === 0) {
            const texture = this.texture;
            const anchor = this._anchor;
            let localBounds = this._localBounds;

            if (!localBounds) {
                localBounds = this._localBounds = new PIXI.Bounds();
            }

            localBounds.minX = texture.orig.width * -anchor._x;
            localBounds.minY = texture.orig.height * -anchor._y;
            localBounds.maxX = texture.orig.width * (1 - anchor._x);
            localBounds.maxY = texture.orig.height * (1 - anchor._y);

            if (!rect) {
                if (!this._localBoundsRect) {
                    this._localBoundsRect = new PIXI.Rectangle();
                }

                rect = this._localBoundsRect;
            }

            return localBounds.getRectangle(rect);
        }

        return super.getLocalBounds(rect);
    }

    containsPoint(point) {
        this.worldTransform.applyInverse(point, tempPoint);

        const orig = this.texture.orig;
        const width = orig.width;
        const height = orig.height;
        const x1 = -width * this._anchor.x;
        let y1 = 0;

        if (tempPoint.x >= x1 && tempPoint.x < x1 + width) {
            y1 = -height * this._anchor.y;

            if (tempPoint.y >= y1 && tempPoint.y < y1 + height) {
                return true;
            }
        }

        return false;
    }

    destroy(options) {
        this._texture.off("update", this._onTextureUpdate, this);
        this._texture = null;

        this._anchor = null;
        this._blendColor = null;
        this._colorMask = null;

        const destroyTexture = typeof options === "boolean" ? options : options && options.texture;

        if (destroyTexture) {
            const destroyBaseTexture = typeof options === "boolean" ? options : options && options.baseTexture;

            if (this.shader.texture) {
                this.shader.texture.destroy(!!destroyBaseTexture);
                this.shader.texture = null;
            }
        }

        this.vertexTrimmedData = null;
        this.indices = null;

        super.destroy(options);
    }
}

export class SpriteMaterial extends PIXI.Shader {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;
        attribute vec2 aTextureCoord;

        uniform mat3 projectionMatrix;

        varying vec2 vTextureCoord;

        void main(void) {
            gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);

            vTextureCoord = aTextureCoord;
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;

        uniform vec4 uColor;
        uniform sampler2D uSampler;

        void main(void) {
            gl_FragColor = texture2D(uSampler, vTextureCoord) * uColor;
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    constructor(uSampler, options) {
        const uniforms = {
            uSampler: uSampler || PIXI.Texture.EMPTY,
            uColor: new Float32Array([1, 1, 1, 1]),
        };

        options = Object.assign({
            tint: 0xFFFFFF,
            alpha: 1,
            pluginName: "batch",
        }, options);

        if (options.uniforms) {
            Object.assign(uniforms, options.uniforms);
        }

        super(options.program || SpriteMaterial.program, uniforms);

        this._colorDirty = false;
        this.batchable = options.program === undefined;
        this.pluginName = options.pluginName;

        this.tint = options.tint;
        this.alpha = options.alpha;
    }

    get texture() {
        return this.uniforms.uSampler;
    }

    set texture(value) {
        this.uniforms.uSampler = value;
    }

    get alpha() {
        return this._alpha;
    }

    set alpha(value) {
        if (value === this._alpha) {
            return;
        }

        this._alpha = value;
        this._colorDirty = true;
    }

    get tint() {
        return this._tint;
    }

    set tint(value) {
        if (value === this._tint) {
            return;
        }

        this._tint = value;
        this._tintRGB = (value >> 16) + (value & 0xff00) + ((value & 0xff) << 16);
        this._colorDirty = true;
    }

    update() {
        if (this._colorDirty) {
            this._colorDirty = false;

            PIXI.utils.premultiplyTintToRgba(this._tint, this._alpha, this.uniforms.uColor, this.texture.baseTexture.alphaMode);
        }
    }
}
