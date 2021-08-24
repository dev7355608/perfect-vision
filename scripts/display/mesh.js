export class TexturelessMeshMaterial extends PIXI.Shader {
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
        return { uColor: new Float32Array([1, 1, 1, 1]) };
    }

    constructor(options = {}) {
        options = Object.assign({
            program: TexturelessMeshMaterial.defaultProgram,
            tint: 0xFFFFFF,
            alpha: 1.0,
        }, options);

        const uniforms = TexturelessMeshMaterial.defaultUniforms();

        if (options.uniforms) {
            Object.assign(uniforms, options.uniforms);
        }

        super(options.program, uniforms);

        this._colorDirty = false;
        this.batchable = false;
        this.premultiply = true;
        this.tint = options.tint;
        this.alpha = options.alpha;
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
