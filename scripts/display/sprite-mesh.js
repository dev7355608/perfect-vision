const POINTS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

export class SpriteMeshGeometry extends PIXI.Geometry {
    constructor() {
        super();

        this.addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(POINTS)), 2, false, PIXI.TYPES.FLOAT)
            .addAttribute("aTextureCoord", new PIXI.Buffer(new Float32Array(POINTS), true), 2, false, PIXI.TYPES.FLOAT);

        this._anchor = new PIXI.ObservablePoint(this._onAnchorUpdate, this, 0, 0);
        this._width = 1;
        this._height = 1;
    }

    get anchor() {
        return this._anchor;
    }

    set anchor(value) {
        this._anchor.copyFrom(value);
    }

    get width() {
        return this._width;
    }

    set width(value) {
        if (this._width !== value) {
            this._width = value;
            this._updateVerticesBuffer();
        }
    }

    get height() {
        return this._height;
    }

    set height(value) {
        if (this._height !== value) {
            this._height = value;
            this._updateVerticesBuffer();
        }
    }

    resize(width, height) {
        if (this._width !== width || this._height !== height) {
            this._width = width;
            this._height = height;
            this._updateVerticesBuffer();
        }
    }

    _updateVerticesBuffer() {
        const verticesBuffer = this.buffers[0];
        const vertices = verticesBuffer.data;

        vertices[0] = -this._anchor.x * this._width;
        vertices[1] = -this._anchor.y * this._height;
        vertices[2] = (1 - this._anchor.x) * this._width;
        vertices[3] = vertices[1];
        vertices[4] = vertices[0];
        vertices[5] = (1 - this._anchor.y) * this._height;
        vertices[6] = vertices[2];
        vertices[7] = vertices[5];

        verticesBuffer.update();
    }

    _onAnchorUpdate() {
        this._updateVerticesBuffer();
    }
}

const INDICES = new Uint16Array([0, 1, 2, 1, 2, 3]);

export class SpriteMesh extends PIXI.Mesh {
    constructor(shader, state) {
        super(new SpriteMeshGeometry(), shader, state, PIXI.DRAW_MODES.TRIANGLE_STRIP);

        if (this.texture) {
            this.anchor.set(this.texture.defaultAnchor.x, this.texture.defaultAnchor.y);
        }
    }

    get shader() {
        return this._shader;
    }

    set shader(value) {
        this._shader = value;

        if (value) {
            this.texture = value.texture;
        } else if (this._texture) {
            this._texture.off("update", this._onTextureUpdate, this);
            this._texture = null;
        }
    }

    get anchor() {
        return this.geometry.anchor;
    }

    set anchor(value) {
        this.geometry.anchor = value;
    }

    get width() {
        return Math.abs(this.scale.x) * this.geometry.width;
    }

    set width(value) {
        if (this.geometry.width !== 0) {
            this.scale.x = value / this.geometry.width;
        } else {
            this.scale.x = 1;
        }

        this._width = value;
    }

    get height() {
        return Math.abs(this.scale.y) * this.geometry.height;
    }

    set height(value) {
        if (this.geometry.height !== 0) {
            this.scale.y = value / this.geometry.height;
        } else {
            this.scale.y = 1;
        }

        this._height = value;
    }

    get texture() {
        return this.shader.texture;
    }

    set texture(value) {
        this.shader.texture = value;

        if (this._texture) {
            this._texture.off("update", this._onTextureUpdate, this);
        }

        if (value) {
            this._texture = value;

            if (this._texture.baseTexture.valid) {
                this._onTextureUpdate();
            } else {
                this._texture.once("update", this._onTextureUpdate, this);
            }
        } else {
            this._texture = null;
        }
    }

    _onTextureUpdate() {
        if (this._texture) {
            this.geometry.resize(this._texture.width, this._texture.height);
            this._texture = null;

            if (this._width) {
                this.scale.x = Math.sign(this.scale.x) * this._width / this.geometry.width;
            }

            if (this._height) {
                this.scale.y = Math.sign(this.scale.y) * this._height / this.geometry.height;
            }
        }
    }

    _render(renderer) {
        if (this.shader.batchable && !(this.filters && this._enabledFilters?.length || (this.mask && (!this.mask.isMaskData || this.mask.enabled && (this.mask.autoDetect || this.mask.type !== PIXI.MASK_TYPES.NONE))))) {
            this._renderToBatch(renderer);
        } else {
            this._renderDefault(renderer);
        }
    }

    _renderToBatch(renderer) {
        const shader = this.shader;

        if (shader.uvMatrix) {
            shader.uvMatrix.update();
        }

        this.calculateVertices();
        this.calculateUvs();

        this.indices = INDICES;
        this._tintRGB = shader._tintRGB;
        this._texture = shader.texture;

        const pluginName = shader.pluginName;

        renderer.batch.setObjectRenderer(renderer.plugins[pluginName]);
        renderer.plugins[pluginName].render(this);
    }

    calculateUvs() {
        const geomUvs = this.geometry.buffers[1];
        const shader = this.shader;

        if (shader.uvMatrix && !shader.uvMatrix.isSimple) {
            if (!this.batchUvs) {
                this.batchUvs = new PIXI.MeshBatchUvs(geomUvs, shader.uvMatrix);
            }

            this.batchUvs.update();
            this.uvs = this.batchUvs.data;
        } else {
            this.uvs = geomUvs.data;
        }
    }

    destroy(options) {
        if (this._texture) {
            this._texture.off("update", this._onTextureUpdate, this);
            this._texture = null;
        }

        if (this.texture) {
            const destroyTexture = typeof options === "boolean" ? options : options && options.texture;

            if (destroyTexture) {
                const destroyBaseTexture = typeof options === "boolean" ? options : options && options.baseTexture;

                this.texture.destroy(!!destroyBaseTexture);
            }
        }

        super.destroy(options);
    }
}
