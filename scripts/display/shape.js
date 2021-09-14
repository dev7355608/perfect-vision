const tempPoint = new PIXI.Point();
const emptyFloat32Array = new Float32Array(0);

export class ShapeMesh extends PIXI.Mesh {
    constructor(geometry, shader, state) {
        super(geometry, shader, state, geometry.drawMode);
    }

    get uvBuffer() {
        return null;
    }

    _render(renderer) {
        const geometry = this.geometry;

        if (geometry.isEmpty()) {
            return;
        }

        this._renderDefault(renderer);
    }

    containsPoint(point) {
        if (!this.getBounds().contains(point.x, point.y)) {
            return false;
        }

        this.worldTransform.applyInverse(point, tempPoint);

        return this.geometry.containsPoint(tempPoint);
    }
}

export class ShapeGeometry extends PIXI.Geometry {
    static EMPTY = new ShapeGeometry().retain();

    constructor(shape, transform) {
        super();

        this._shape = null;
        this._matrix = null;
        this._origin = null;
        this._points = null;
        this._vertices = null;
        this._indices = null;
        this._drawMode = null;
        this._bounds = null;

        this._initializeShape(shape);
        this._transformShape(transform);
        this._buildGeometry();
        this._transformVertices();
        this._calculateBounds();
        this._finalizeShape(shape);
        this._addAttributes();
    }

    _initializeShape(shape) {
        if (!shape) {
            return;
        }

        const type = shape.type;

        let empty;

        if (type === PIXI.SHAPES.RECT || type === PIXI.SHAPES.RREC || type === PIXI.SHAPES.ELIP) {
            empty = shape.width <= 0 || shape.height <= 0;
        } else if (type === PIXI.SHAPES.CIRC) {
            empty = shape.radius <= 0;
        } else {
            empty = false;
        }

        if (!empty) {
            this._shape = shape;
        }
    }

    _transformShape(matrix) {
        let shape = this._shape;

        if (!shape) {
            return;
        }

        if (matrix && shape.type !== PIXI.SHAPES.POLY) {
            const { a, b, c, d, tx, ty } = matrix;
            const bc0 = Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4;

            if (bc0 || Math.abs(a) < 1e-4 && Math.abs(d) < 1e-4) {
                if (shape.type === PIXI.SHAPES.RECT) {
                    shape = new PIXI.Rectangle(shape.x, shape.y, shape.width, shape.height);
                    matrix = null;
                } else if (shape.type === PIXI.SHAPES.RREC) {
                    if (bc0 && a === d || !bc0 && b === c) {
                        shape = new PIXI.RoundedRectangle(shape.x, shape.y, shape.width, shape.height, shape.radius);
                        matrix = null;
                    }
                } else if (shape.type === PIXI.SHAPES.CIRC) {
                    shape = new PIXI.Ellipse(shape.x, shape.y, shape.radius, shape.radius);
                    matrix = null;
                } else if (shape.type === PIXI.SHAPES.ELIP) {
                    shape = new PIXI.Ellipse(shape.x, shape.y, shape.width, shape.height);
                    matrix = null;
                }

                if (!matrix) {
                    const { x, y, width, height } = shape;

                    if (bc0) {
                        shape.x = x * a + tx;
                        shape.y = y * d + ty;
                        shape.width = width * a;
                        shape.height = height * d;
                    } else {
                        shape.x = y * c + tx;
                        shape.y = x * b + ty;
                        shape.width = height * c;
                        shape.height = width * b;
                    }

                    if (shape.type === PIXI.SHAPES.RECT || shape.type === PIXI.SHAPES.RREC) {
                        const x = shape.width >= 0 ? shape.x : shape.x + shape.width;
                        const y = shape.height >= 0 ? shape.y : shape.y + shape.height;

                        shape.x = x;
                        shape.y = y;
                    }

                    shape.width = Math.abs(shape.width);
                    shape.height = Math.abs(shape.height);
                }
            } else if (Math.abs(a * b + c * d) < 1e-4) {
                if (shape.type === PIXI.SHAPES.CIRC) {
                    const radius = shape.radius;

                    shape = new PIXI.Ellipse(shape.x, shape.y, radius, radius);
                    matrix = null;
                } else if (shape.type === PIXI.SHAPES.ELIP) {
                    if (shape.width === shape.height) {
                        const radius = shape.width;

                        shape = new PIXI.Ellipse(shape.x, shape.y, radius, radius);
                        matrix = null;
                    }
                } else if (shape.type === PIXI.SHAPES.RREC) {
                    if (shape.radius >= Math.max(shape.width, shape.height) / 2) {
                        const radius = Math.min(shape.width, shape.height) / 2;

                        shape = new PIXI.Ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, radius, radius);
                        matrix = null;
                    }
                }

                if (!matrix) {
                    const { x, y } = shape;
                    const radius = shape.width;

                    shape.x = x * a + y * c + tx;
                    shape.y = x * b + y * d + ty;
                    shape.width = radius * Math.sqrt(a * a + c * c);
                    shape.height = radius * Math.sqrt(b * b + d * d);
                }
            }
        }

        if (shape.type === PIXI.SHAPES.RREC) {
            const radius = Math.min(shape.radius, Math.min(shape.width, shape.height) / 2);

            if (radius <= 0) {
                shape = new PIXI.Rectangle(shape.x, shape.y, shape.width, shape.height);
            } else if (radius === Math.max(shape.width, shape.height) / 2) {
                shape = new PIXI.Circle(shape.x + shape.width / 2, shape.y + shape.height / 2, radius);
            } else if (radius !== shape.radius) {
                shape = new PIXI.RoundedRectangle(shape.x, shape.y, shape.width, shape.height, radius);
            }
        } else if (shape.type === PIXI.SHAPES.ELIP) {
            if (shape.width === shape.height) {
                shape = new PIXI.Circle(shape.x, shape.y, shape.width);
            }
        }

        this._shape = shape;
        this._matrix = matrix ?? null;

        if (shape.type === PIXI.SHAPES.RECT || shape.type === PIXI.SHAPES.RREC) {
            this._origin = new PIXI.Point(shape.x + shape.width / 2, shape.y + shape.height / 2);
        } else if (Number.isFinite(shape.x) && Number.isFinite(shape.y)) {
            this._origin = new PIXI.Point(shape.x, shape.y);
        } else if ("origin" in shape) {
            this._origin = new PIXI.Point(shape.origin.x, shape.origin.y);
        }
    }

    _buildGeometry() {
        let shape = this._shape;

        if (!shape) {
            return;
        }

        let points = null;
        let vertices = null;
        let indices = null;
        let drawMode = null;

        if (shape.type === PIXI.SHAPES.RECT) {
            const x0 = shape.x;
            const y0 = shape.y;
            const x1 = x0 + shape.width;
            const y1 = y0 + shape.height;

            vertices = new Float32Array(8);
            vertices[0] = x0;
            vertices[1] = y0;
            vertices[2] = x1;
            vertices[3] = y0;
            vertices[4] = x1;
            vertices[5] = y1;
            vertices[6] = x0;
            vertices[7] = y1;

            points = vertices;
            drawMode = PIXI.DRAW_MODES.TRIANGLE_FAN;
        } else if (shape.type === PIXI.SHAPES.POLY) {
            const p = shape.points;
            const m = p.length;
            const origin = this._origin;

            if (origin) {
                vertices = new Float32Array(m + 4);
                vertices[0] = origin.x;
                vertices[1] = origin.y;
                vertices.set(p, 2);
                vertices[m + 2] = p[0];
                vertices[m + 3] = p[1];

                points = vertices.subarray(2, -2);
                drawMode = PIXI.DRAW_MODES.TRIANGLE_FAN;
            } else {
                vertices = new Float32Array(p);
                indices = new (m > 0x1FFFE ? Uint32Array : Uint16Array)(PIXI.utils.earcut(p));

                points = vertices;
                drawMode = PIXI.DRAW_MODES.TRIANGLES;
            }
        } else {
            const { x, y } = this._origin;
            let dx, dy;
            let rx, ry;

            if (shape.type === PIXI.SHAPES.RREC) {
                rx = ry = shape.radius;
                dx = shape.width / 2 - rx;
                dy = shape.height / 2 - ry;
            } else {
                if (shape.type === PIXI.SHAPES.CIRC) {
                    rx = ry = shape.radius;
                } else {
                    rx = shape.width;
                    ry = shape.height;
                }

                dx = 0;
                dy = 0;
            }

            let matrix;
            let sx = rx;
            let sy = ry;

            if (matrix = this._matrix) {
                const { a, b, c, d } = matrix;

                sx *= a * a + c * c;
                sy *= b * b + d * d;
            }

            const n = Math.max(1, Math.round(Math.sqrt(450 * (sx + sy)) / 9.2));
            const m = n * 8 - (dx ? 0 : 4) - (dy ? 0 : 4);

            vertices = new Float32Array(m);

            let j1 = 0;
            let j2 = n * 4 - (dx ? 0 : 2);
            let j3 = j2;
            let j4 = m;

            {
                const x0 = dx + rx;
                const y0 = dy;
                const x1 = x + x0;
                const x2 = x - x0;
                const y1 = y + y0;

                vertices[j1++] = x1;
                vertices[j1++] = y1;
                vertices[--j2] = y1;
                vertices[--j2] = x2;

                if (dy) {
                    const y2 = y - y0;

                    vertices[j3++] = x2;
                    vertices[j3++] = y2;
                    vertices[--j4] = y2;
                    vertices[--j4] = x1;
                }
            }

            const a = Math.PI / n;

            for (let i = 1; i < n; i++) {
                const x0 = dx + Math.cos(a * i) * rx;
                const y0 = dy + Math.sin(a * i) * ry;
                const x1 = x + x0;
                const x2 = x - x0;
                const y1 = y + y0;
                const y2 = y - y0;

                vertices[j1++] = x1;
                vertices[j1++] = y1;
                vertices[--j2] = y1;
                vertices[--j2] = x2;
                vertices[j3++] = x2;
                vertices[j3++] = y2;
                vertices[--j4] = y2;
                vertices[--j4] = x1;
            }

            {
                const x0 = dx;
                const y0 = dy + ry;
                const x1 = x + x0;
                const x2 = x - x0;
                const y1 = y + y0;
                const y2 = y - y0;

                vertices[j1++] = x1;
                vertices[j1++] = y1;
                vertices[j3++] = x2;
                vertices[j3++] = y2;

                if (dx) {
                    vertices[--j2] = y1;
                    vertices[--j2] = x2;
                    vertices[--j4] = y2;
                    vertices[--j4] = x1;
                }
            }

            points = vertices;
            drawMode = PIXI.DRAW_MODES.TRIANGLE_FAN;
        }

        this._shape = shape;
        this._points = points;
        this._vertices = vertices;
        this._indices = indices;
        this._drawMode = drawMode;
    }

    _transformVertices() {
        const vertices = this._vertices;

        if (!vertices) {
            return;
        }

        const matrix = this._matrix;

        if (!matrix) {
            return;
        }

        const { a, b, c, d, tx, ty } = matrix;

        if (this._shape.type === PIXI.SHAPES.RECT) {
            this._shape = new PIXI.Polygon();
            this._shape.points = this._points;
        }

        for (let i = 0, m = vertices.length; i < m; i += 2) {
            const x = vertices[i];
            const y = vertices[i + 1];

            vertices[i] = a * x + c * y + tx;
            vertices[i + 1] = b * x + d * y + ty;
        }

        if (this._shape.type === PIXI.SHAPES.POLY) {
            this._matrix = null;
        } else {
            this._matrix = matrix.clone().invert();
        }
    }

    _calculateBounds() {
        const points = this._points;

        if (!points) {
            return;
        }

        const bounds = new PIXI.Rectangle();
        const m = points.length;

        if (m >= 6) {
            let minX = points[0];
            let minY = points[1];
            let maxX = minX;
            let maxY = minY;

            for (let i = 2; i < m; i += 2) {
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

        this._bounds = bounds;
    }

    _finalizeShape(shape) {
        if (this._shape !== shape) {
            return;
        }

        shape = this._shape;

        const type = shape.type;

        if (type === PIXI.SHAPES.RECT) {
            shape = new PIXI.Rectangle(shape.x, shape.y, shape.width, shape.height);
        } else if (type === PIXI.SHAPES.RREC) {
            shape = new PIXI.RoundedRectangle(shape.x, shape.y, shape.width, shape.height, shape.radius);
        } else if (type === PIXI.SHAPES.CIRC) {
            shape = new PIXI.Circle(shape.x, shape.y, shape.radius);
        } else if (type === PIXI.SHAPES.ELIP) {
            shape = new PIXI.Ellipse(shape.x, shape.y, shape.width, shape.height);
        } else if (type === PIXI.SHAPES.POLY) {
            shape = new PIXI.Polygon();
            shape.points = this._points;
        }

        this._shape = shape;
    }

    _addAttributes() {
        this.addAttribute("aVertexPosition", new PIXI.Buffer(this._vertices ?? emptyFloat32Array, true, false), 2, false, PIXI.TYPES.FLOAT);

        if (this._indices) {
            this.addIndex(new PIXI.Buffer(this._indices, true, true));
        }
    }

    get drawMode() {
        return this._drawMode;
    }

    get bounds() {
        return this._bounds;
    }

    isEmpty() {
        return this._shape === null;
    }

    containsPoint(point) {
        const shape = this._shape;

        if (!shape) {
            return false;
        }

        let matrix;
        let { x, y } = point;

        if (shape.type === PIXI.SHAPES.POLY) {
            if (!this._bounds.contains(x, y)) {
                return false;
            }
        } else if (matrix = this._matrix) {
            const { a, b, c, d, tx, ty } = matrix;
            const nx = a * x + c * y + tx;

            y = b * x + d * y + ty;
            x = nx;
        }

        return shape.contains(x, y);
    }

    createMesh(shader, state) {
        return new ShapeMesh(this, shader ?? new ShapeShader(), state);
    }

    retain() {
        this._refCount++;

        return this;
    }

    release() {
        this._refCount--;

        if (this._refCount === 0) {
            this.dispose();
        }
    }

    destroy(options) {
        this._shape = null;
        this._matrix = null;
        this._origin = null;
        this._points = null;
        this._vertices = null;
        this._indices = null;
        this._drawMode = null;
        this._bounds = null;

        super.destroy(options);
    }
}

export class ShapeShader extends PIXI.Shader {
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

    constructor(options = {}) {
        const batchable = options.program === undefined;

        options = Object.assign({
            program: ShapeShader.defaultProgram,
            tint: 0xFFFFFF,
            alpha: 1.0,
            pluginName: "batch",
        }, options);

        const uniforms = { uColor: new Float32Array([1, 1, 1, 1]) };

        if (options.uniforms) {
            Object.assign(uniforms, options.uniforms);
        }

        super(options.program, uniforms);

        this._colorDirty = false;
        this.batchable = batchable;
        this.pluginName = options.pluginName;
        this.tint = options.tint;
        this.alpha = options.alpha;
        this.premultiply = true;
    }

    get tint() {
        return this._tint;
    }

    set tint(value) {
        if (this._tint === value) {
            return;
        }

        this._tint = value;
        this._tintRGB = (value >> 16) + (value & 0xff00) + ((value & 0xff) << 16);
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

    get texture() {
        return PIXI.Texture.WHITE;
    }

    update() {
        if (this._colorDirty) {
            this._colorDirty = false;

            PIXI.utils.premultiplyTintToRgba(this._tint, this._alpha, this.uniforms.uColor, this.premultiply);
        }
    }
}
