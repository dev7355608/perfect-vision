const EMPTY = new Float32Array(0);

export class SourcePolygonMesh extends PIXI.Mesh {
    constructor(polygon, shader, state) {

        const verticesBuffer = new PIXI.Buffer(EMPTY);
        const indexBuffer = new PIXI.Buffer(EMPTY, true, true);
        const geometry = new PIXI.Geometry()
            .addAttribute('aVertexPosition', verticesBuffer, 2, false, PIXI.TYPES.FLOAT)
            .addIndex(indexBuffer);

        super(geometry, shader, state);

        this.polygon = polygon;
    }

    get polygon() {
        if (!this._polygon) {
            const vertices = this.geometry.buffers[0].data;

            if (vertices.length === 0) {
                return null;
            }

            const m = data.length - 2;
            const x = data[m];
            const y = data[m + 1];
            const points = Array.from(vertices.subarray(0, -2));

            let radius = 0;

            for (let i = 0; i < m; i += 2) {
                const dx = x - points[i];
                const dy = y - points[i + 1];

                radius = Math.max(radius, dx * dx + dy * dy);
            }

            radius = Math.sqrt(radius);

            this._polygon = new SourcePolygon(x, y, radius, points);
        }

        return this._polygon;
    }

    set polygon(value) {
        this._polygon = null;

        if (!value) {
            this.geometry.buffers[0].update(EMPTY);
            this.geometry.indexBuffer.update(EMPTY);

            return;
        }

        console.assert(Number.isFinite(value.x) && Number.isFinite(value.y));

        const points = value.points;
        const m = points.length;
        const n = m / 2;

        let vertices;
        let indices;

        if (this.geometry.buffers[0].data.length === m + 2) {
            vertices = this.geometry.buffers[0].data;
            indices = this.geometry.indexBuffer.data;
        } else {
            vertices = new Float32Array(m + 2);
            indices = new Uint16Array(n * 3);
        }

        for (let i = 0; i < m; i++) {
            vertices[i] = points[i];
        }

        vertices[m] = value.x;
        vertices[m + 1] = value.y;

        for (let i = 0, j = n - 1, k = 0; i < n; j = i++) {
            indices[k++] = n;
            indices[k++] = j;
            indices[k++] = i;
        }

        this.geometry.buffers[0].update(vertices);
        this.geometry.indexBuffer.update(indices);
    }

    destroy(options) {
        super.destroy(options);

        this._polygon = null;
    }
}

export class SourcePolygonMeshShader extends PIXI.Shader {
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
            program: SourcePolygonMeshShader.defaultProgram,
            tint: 0xFFFFFF,
            alpha: 1.0,
        }, options);

        const uniforms = SourcePolygonMeshShader.defaultUniforms();

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
