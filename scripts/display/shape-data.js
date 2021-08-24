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
        this._refCount = 1;
        this._cached = false;
    }

    get shape() {
        return this._shape;
    }

    get bounds() {
        if (this._bounds === undefined) {
            if (this._shape) {
                this._bounds = calculateBoundsFromShape(this._shape);
            } else {
                this._bounds = null;
            }
        }

        return this._bounds;
    }

    get geometry() {
        if (this._geometry === undefined) {
            if (!this.isEmpty()) {
                this._geometry = createGeometryFromShape(this._shape);
                this._geometry.refCount++;
            } else {
                this._geometry = null;
            }
        }

        return this._geometry;
    }

    isEmpty() {
        const bounds = this.bounds;

        return !bounds || bounds.width <= 0 || bounds.height <= 0;
    }

    containsPoint(point, y) {
        const shape = this._shape;

        if (!shape) {
            return false;
        }

        let x;

        if (y !== undefined) {
            x = point;
        } else {
            x = point.x;
            y = point.y;
        }

        if (shape.type === PIXI.SHAPES.POLY) {
            if (!this.bounds.contains(x, y)) {
                return false;
            }
        }

        return shape.contains(x, y);
    }

    createMesh(shader, state) {
        const geometry = this.geometry;

        if (!geometry) {
            return null;
        }

        const mesh = new PIXI.Mesh(geometry, shader ?? DefaultShapeShader.instance, state);

        Object.defineProperty(mesh, "uvBuffer", {
            configurable: true,
            writable: false,
            value: null
        });

        return mesh;
    }

    createMaskData(scissor = false) {
        const shape = this._shape;
        const mesh = this.createMesh();
        const maskData = new PIXI.MaskData(mesh ?? new PIXI.Container());

        maskData.autoDetect = false;

        if (!mesh || scissor && (shape.type === PIXI.SHAPES.RECT || shape.type === PIXI.SHAPES.RREC && shape.radius <= 0)) {
            maskData.type = PIXI.MASK_TYPES.SCISSOR;
        } else {
            maskData.type = PIXI.MASK_TYPES.STENCIL;
        }

        return maskData;
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
            this._cached = false;
        }
    }
}

function calculateBoundsFromShape(shape) {
    const type = shape.type;

    if (type === PIXI.SHAPES.RECT || type === PIXI.SHAPES.RREC) {
        return new PIXI.Rectangle(shape.x, shape.y, shape.width, shape.height);
    } else if (type === PIXI.SHAPES.CIRC) {
        return new PIXI.Rectangle(shape.x - shape.radius, shape.y - shape.radius, shape.radius * 2, shape.radius * 2);
    } else if (type === PIXI.SHAPES.ELIP) {
        return new PIXI.Rectangle(shape.x - shape.width, shape.y - shape.height, shape.width * 2, shape.height * 2);
    } else {
        const points = shape.points;
        const length = points.length;

        if (length < 6) {
            return PIXI.Rectangle.EMPTY;
        }

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

        return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
    }
}

const tempGraphicsData = new PIXI.GraphicsData(new PIXI.Polygon());
const tempGraphicsGeometry = new PIXI.GraphicsGeometry();

function createGeometryFromShape(shape) {
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

        indices = new Uint16Array(6);
        indices[0] = 0;
        indices[1] = 1;
        indices[2] = 2;
        indices[3] = 1;
        indices[4] = 2;
        indices[5] = 3;
    } else if (shape.type === PIXI.SHAPES.POLY) {
        const points = shape.points;

        if (Number.isFinite(shape.x) && Number.isFinite(shape.y)) {
            const m = points.length;
            const n = m / 2;

            vertices = new Float32Array(m + 2);
            vertices.set(points);
            vertices[m] = shape.x;
            vertices[m + 1] = shape.y;

            indices = new Uint16Array(n * 3);
            indices = new (vertices.length > 0xffff ? Uint32Array : Uint16Array)(n * 3);

            for (let i = 0, j = n - 1, k = 0; i < n; j = i++) {
                indices[k++] = n;
                indices[k++] = j;
                indices[k++] = i;
            }
        } else {
            vertices = new Float32Array(points);
            indices = new (vertices.length > 0xffff ? Uint32Array : Uint16Array)(PIXI.utils.earcut(points));
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
        indices = new (vertices.length > 0xffff ? Uint32Array : Uint16Array)(graphicsGeometry.indices);

        graphicsData.points.length = 0;
        graphicsGeometry.points.length = 0;
        graphicsGeometry.indices.length = 0;
    }

    const verticesBuffer = new PIXI.Buffer(vertices, true, false);
    const indexBuffer = new PIXI.Buffer(indices, true, true);
    const geometry = new PIXI.Geometry()
        .addAttribute("aVertexPosition", verticesBuffer, 2, false, PIXI.TYPES.FLOAT)
        .addIndex(indexBuffer);

    return geometry;
}

class DefaultShapeShader extends PIXI.Shader {
    static vertexSource = `\
        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;

        void main()
        {
            gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
        }`;

    static fragmentSource = `\
        uniform vec4 uColor;

        void main()
        {
            gl_FragColor = vec4(1.0);
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSource, this.fragmentSource);
        }

        return this._program;
    }

    static get instance() {
        if (!this._instance) {
            this._instance = new this();
        }

        return this._instance;
    }

    constructor() {
        super(DefaultShapeShader.program);

        this.batchable = false;
    }
}
