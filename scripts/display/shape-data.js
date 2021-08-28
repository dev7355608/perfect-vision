export class ShapeData {
    static _cache = new WeakMap();

    static from(shape) {
        let data = this._cache.get(shape);

        if (data) {
            return data.retain();
        }

        data = new this(shape)
        data._cached = true;

        this._cache.set(shape, data);

        return data;
    }

    constructor(shape) {
        if (!shape) {
            throw new TypeError();
        }

        this._shape = shape;
        this._bounds = undefined;
        this._geometry = undefined;
        this._drawMode = undefined;
        this._refCount = 1;
        this._cached = false;
    }

    get shape() {
        return this._shape;
    }

    get bounds() {
        if (this._bounds === undefined) {
            this._bounds = calculateBoundsFromShape(this._shape, new PIXI.Rectangle());
        }

        return this._bounds;
    }

    get geometry() {
        if (this._geometry === undefined) {
            const { vertices, indices } = !this.isEmpty() ?
                createGeometryFromShape(this._shape, this.drawMode) :
                { vertices: new Float32Array(0), indices: new Uint16Array(0) };

            this._geometry = new PIXI.Geometry()
                .addAttribute("aVertexPosition", new PIXI.Buffer(vertices, true, false), 2, false, PIXI.TYPES.FLOAT)
                .addIndex(new PIXI.Buffer(indices, true, true));
            this._geometry.refCount++;
        }

        return this._geometry;
    }

    get drawMode() {
        if (this._drawMode === undefined) {
            this._drawMode = detectDrawMode(this._shape);
        }

        return this._drawMode;
    }

    update() {
        if (this._bounds) {
            calculateBoundsFromShape(this._shape, this._bounds);
        }

        if (this._geometry) {
            const { vertices, indices } = !this.isEmpty() ?
                createGeometryFromShape(this._shape, this.drawMode) :
                { vertices: new Float32Array(0), indices: new Uint16Array(0) };

            this._geometry.buffers[0].update(vertices);
            this._geometry.indexBuffer.update(indices);
        }

        return this;
    }

    isEmpty() {
        const bounds = this.bounds;

        return bounds.width <= 0 || bounds.height <= 0;
    }

    containsPoint(point) {
        const { x, y } = point;
        const shape = this._shape;

        if (shape.type === PIXI.SHAPES.POLY) {
            if (!this.bounds.contains(x, y)) {
                return false;
            }
        }

        return shape.contains(x, y);
    }

    createMesh(shader, state) {
        const mesh = new PIXI.Mesh(this.geometry, shader ?? new ShapeDataShader(), state, this.drawMode);

        Object.defineProperty(mesh, "uvBuffer", {
            configurable: true,
            writable: false,
            value: null
        });

        return mesh;
    }

    retain() {
        this._refCount++;

        return this;
    }

    release() {
        if (this._refCount === 0) {
            return;
        }

        this._refCount--;

        if (this._refCount === 0) {
            if (this._geometry) {
                this._geometry.refCount--;

                if (this._geometry.refCount === 0) {
                    this._geometry.dispose();
                }
            }

            if (this._cached) {
                this.constructor._cache.delete(this._shape);
            }

            this._shape = null;
            this._bounds = null;
            this._geometry = null;
            this._drawMode = null;
            this._cached = false;
        }
    }
}

export class ShapeDataShader extends PIXI.Shader {
    static defaultVertexSource = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;

        void main()
        {
            gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
        }`;

    static defaultFragmentSource = `\
        uniform vec4 uColor;

        void main()
        {
            gl_FragColor = uColor;
        }`;

    static get defaultProgram() {
        if (!this._defaultProgram) {
            this._defaultProgram = PIXI.Program.from(this.defaultVertexSource, this.defaultFragmentSource);
        }

        return this._defaultProgram;
    }

    static defaultUniforms() {
        return {
            uColor: new Float32Array([1.0, 1.0, 1.0, 1.0]),
            alpha: 1.0,
        };
    }

    constructor(options = {}) {
        options = Object.assign({
            program: ShapeDataShader.defaultProgram,
            tint: 0xFFFFFF,
            alpha: 1.0,
        }, options);

        const uniforms = ShapeDataShader.defaultUniforms();

        if (options.uniforms) {
            Object.assign(uniforms, options.uniforms);
        }

        super(options.program, uniforms);

        this._colorDirty = false;

        this.tint = options.tint;
        this.alpha = options.alpha;

        this.premultiply = true;

        this.source = options.source;
    }

    get tint() {
        return this._tint;
    }

    set tint(value) {
        if (this._tint === value) {
            return;
        }

        this._tint = value;
        this._colorDirty = true;
    }

    get alpha() {
        return this._alpha;
    }

    set alpha(value) {
        if (this._alpha === value) {
            return;
        }

        this._alpha = value;
        this._colorDirty = true;
    }

    update() {
        if (this._colorDirty) {
            this._colorDirty = false;

            PIXI.utils.premultiplyTintToRgba(this._tint, this._alpha, this.uniforms.uColor, this.premultiply);
        }
    }
}

function calculateBoundsFromShape(shape, bounds) {
    const type = shape.type;

    if (type === PIXI.SHAPES.RECT || type === PIXI.SHAPES.RREC) {
        bounds.x = shape.x;
        bounds.y = shape.y;
        bounds.width = shape.width;
        bounds.height = shape.height;
    } else if (type === PIXI.SHAPES.CIRC) {
        bounds.x = shape.x - shape.radius;
        bounds.y = shape.y - shape.radius;
        bounds.width = shape.radius * 2;
        bounds.height = shape.radius * 2;
    } else if (type === PIXI.SHAPES.ELIP) {
        bounds.x = shape.x - shape.width;
        bounds.y = shape.y - shape.height;
        bounds.width = shape.width * 2;
        bounds.height = shape.height * 2;
    } else {
        const points = shape.points;
        const length = points.length;

        if (length < 6) {
            bounds.x = 0;
            bounds.y = 0;
            bounds.width = 0;
            bounds.height = 0;
        } else {
            let minX = points[0];
            let minY = points[1];
            let maxX = minX;
            let maxY = minY;

            for (let i = 2; i < length; i += 2) {
                const x = points[i];
                const y = points[i + 1];

                if (minX > x) {
                    minX = x;
                } else if (maxX < x) {
                    maxX = x;
                }

                if (minY > y) {
                    minY = y;
                } else if (maxY < y) {
                    maxY = y;
                }
            }

            bounds.x = minX;
            bounds.y = minY;
            bounds.width = maxX - minX;
            bounds.height = maxY - minY;
        }
    }

    return bounds;
}

const tempGraphicsData = new PIXI.GraphicsData(new PIXI.Polygon());
const tempGraphicsGeometry = new PIXI.GraphicsGeometry();

function createGeometryFromShape(shape, drawMode) {
    let vertices;
    let indices;

    if (shape.type === PIXI.SHAPES.RECT || shape.type === PIXI.SHAPES.RREC && shape.radius <= 0) {
        const x0 = shape.x;
        const y0 = shape.y;
        const x1 = x0 + shape.width;
        const y1 = y0 + shape.height;

        vertices = new Float32Array(8);
        vertices[0] = x0;
        vertices[1] = y0;
        vertices[2] = x1;
        vertices[3] = y0;
        vertices[4] = x0;
        vertices[5] = y1;
        vertices[6] = x1;
        vertices[7] = y1;

        if (drawMode === undefined || drawMode === PIXI.DRAW_MODES.TRIANGLE_STRIP) {
            drawMode = PIXI.DRAW_MODES.TRIANGLE_STRIP;

            indices = new Uint16Array(4);
            indices[0] = 0;
            indices[1] = 1;
            indices[2] = 2;
            indices[3] = 3;
        } else if (drawMode === PIXI.DRAW_MODES.TRIANGLES) {
            indices = new Uint16Array(6);
            indices[0] = 0;
            indices[1] = 1;
            indices[2] = 2;
            indices[3] = 1;
            indices[4] = 2;
            indices[5] = 3;
        } else {
            throw new Error();
        }
    } else if (shape.type === PIXI.SHAPES.POLY) {
        const points = shape.points;
        const origin = isPointSourcePolygon(shape)

        if (origin) {
            const m = points.length;
            const n = m / 2;

            vertices = new Float32Array(m + 2);
            vertices.set(points);
            vertices[m] = origin.x;
            vertices[m + 1] = origin.y;

            if (drawMode === undefined || drawMode === PIXI.DRAW_MODES.TRIANGLE_FAN) {
                drawMode = PIXI.DRAW_MODES.TRIANGLE_FAN;

                indices = new (vertices.length > 0xffff ? Uint32Array : Uint16Array)(n + 2);
                indices[0] = n;

                for (let i = 1; i < n; i++) {
                    indices[i] = i;
                }

                indices[n] = 0;
                indices[n + 1] = 1;
            } else if (drawMode === PIXI.DRAW_MODES.TRIANGLES) {
                indices = new (vertices.length > 0xffff ? Uint32Array : Uint16Array)(n * 3);

                for (let i = 0, j = n - 1, k = 0; i < n; j = i++) {
                    indices[k++] = n;
                    indices[k++] = j;
                    indices[k++] = i;
                }
            } else {
                throw new Error();
            }
        } else {
            vertices = new Float32Array(points);

            if (drawMode === undefined || drawMode === PIXI.DRAW_MODES.TRIANGLES) {
                indices = new (vertices.length > 0xffff ? Uint32Array : Uint16Array)(PIXI.utils.earcut(points));
            } else {
                throw new Error();
            }
        }
    } else {
        const graphicsData = tempGraphicsData;
        const graphicsGeometry = tempGraphicsGeometry;

        graphicsData.shape = shape;
        graphicsData.type = shape.type;

        const command = PIXI.graphicsUtils.FILL_COMMANDS[graphicsData.type];

        command.build(graphicsData);
        command.triangulate(graphicsData, graphicsGeometry);

        vertices = new Float32Array(graphicsGeometry.points);

        if (drawMode === undefined || drawMode === PIXI.DRAW_MODES.TRIANGLES) {
            indices = new (vertices.length > 0xffff ? Uint32Array : Uint16Array)(graphicsGeometry.indices);
        } else {
            throw new Error();
        }

        graphicsData.points.length = 0;
        graphicsGeometry.points.length = 0;
        graphicsGeometry.indices.length = 0;
    }

    return { vertices, indices, drawMode };
}

function detectDrawMode(shape) {
    if (shape.type === PIXI.SHAPES.RECT || shape.type === PIXI.SHAPES.RREC && shape.radius <= 0) {
        return PIXI.DRAW_MODES.TRIANGLE_STRIP;
    }

    if (isPointSourcePolygon(shape)) {
        return PIXI.DRAW_MODES.TRIANGLE_FAN;
    }

    return PIXI.DRAW_MODES.TRIANGLES;
}

function isPointSourcePolygon(shape) {
    if (shape.type !== PIXI.SHAPES.POLY) {
        return false;
    }

    const x = shape.x;
    const y = shape.y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return false;
    }

    return { x, y };
}
