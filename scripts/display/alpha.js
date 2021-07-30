import { Mask, MaskFilter } from "../core/mask.js";
import { SpriteMesh } from "./sprite-mesh.js";

export class AlphaSpriteMeshShader extends PIXI.Shader {
    static vertexSource = `\
        attribute vec2 aVertexPosition;
        attribute vec2 aTextureCoord;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;
        uniform mat3 uTextureMatrix;
        uniform vec4 uMaskSize;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        void main()
        {
            vec3 position = translationMatrix * vec3(aVertexPosition, 1.0);
            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
            vTextureCoord = (uTextureMatrix * vec3(aTextureCoord, 1.0)).xy;
            vMaskCoord = position.xy * uMaskSize.zw;
        }`;

    static fragmentSource = `\
        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;
        uniform vec3 uColor;
        uniform float uAlpha1;
        uniform float uAlpha2;
        uniform float uAlphaThreshold;
        uniform float uAlphaWeight;
        uniform float uAlphaBias;

        void main()
        {
            float mask = texture2D(uMask, vMaskCoord).r;
            float alpha = texture2D(uSampler, vTextureCoord).a * mix(uAlpha2, uAlpha1, mask);
            gl_FragColor = mix(vec4(0.0), vec4(uColor, uAlphaWeight * alpha + uAlphaBias), step(uAlphaThreshold, alpha) * (1.0 - step(alpha, 0.0)));
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSource, this.fragmentSource);
        }

        return this._program;
    }

    static defaultUniforms() {
        return {
            uSampler: PIXI.Texture.WHITE,
            uColor: new Float32Array(3),
            uAlpha1: 1.0,
            uAlpha2: 0.0,
            uAlphaThreshold: 0.0,
            uAlphaWeight: 1.0,
            uAlphaBias: 0.0,
            uMask: PIXI.Texture.WHITE,
            uMaskSize: Mask.size
        };
    }

    static configureUniforms(uniforms, { tint = 0, alpha = 1.0, threshold = 0.0, weight = 1.0, bias = 0.0, mask = PIXI.Texture.WHITE } = {}) {
        if (Number.isInteger(tint)) {
            tint = PIXI.utils.hex2rgb(tint);
        }

        uniforms.uColor.set(tint);
        uniforms.uAlpha1 = alpha[0] ?? alpha;
        uniforms.uAlpha2 = alpha[1] ?? 0.0;
        uniforms.uAlphaThreshold = threshold;
        uniforms.uAlphaWeight = weight;
        uniforms.uAlphaBias = bias;
        uniforms.uMask = mask;
    }

    constructor() {
        super(AlphaSpriteMeshShader.program, AlphaSpriteMeshShader.defaultUniforms());

        this.uvMatrix = new PIXI.TextureMatrix(this.uniforms.uSampler);
    }

    get texture() {
        return this.uniforms.uSampler;
    }

    set texture(value) {
        if (this.uniforms.uSampler !== value) {
            this.uniforms.uSampler = value;
            this.uvMatrix.texture = value;
        }
    }

    configure(texture, options) {
        this.texture = texture?.baseTexture?.valid ? texture : PIXI.Texture.WHITE;

        AlphaSpriteMeshShader.configureUniforms(this.uniforms, options);
    }

    update() {
        if (this.uvMatrix.update()) {
            this.uniforms.uTextureMatrix = this.uvMatrix.mapCoord;
        }
    }
}

export class AlphaFilter extends MaskFilter {
    constructor(options) {
        super(undefined, AlphaSpriteMeshShader.fragmentSource, AlphaSpriteMeshShader.defaultUniforms());

        if (options !== undefined) {
            this.configure(options);
        }
    }

    configure(options) {
        AlphaSpriteMeshShader.configureUniforms(this.uniforms, options);
    }
}

export class AlphaSpriteMesh extends SpriteMesh {
    constructor(texture, options) {
        super(new AlphaSpriteMeshShader());

        this.blendMode = PIXI.BLEND_MODES.NORMAL_NPM;

        if (texture !== undefined || options !== undefined) {
            this.shader.configure(texture, options);
        }
    }

    static from(object, options) {
        if (object instanceof PIXI.Texture) {
            return new AlphaSpriteMesh(object, options);
        }

        const sprite = new AlphaSpriteMesh(object.texture, options);

        sprite.position = object.position;
        sprite.width = object.width;
        sprite.height = object.height;
        sprite.anchor = object.anchor;
        sprite.pivot = object.pivot;
        sprite.skew = object.skew;
        sprite.rotation = object.rotation;

        return sprite;
    }

    configure(object, options) {
        if (object instanceof PIXI.Texture) {
            this.shader.configure(object, options);
            return;
        }

        this.shader.configure(object.texture, options);

        this.position = object.position;
        this.width = object.width;
        this.height = object.height;
        this.anchor = object.anchor;
        this.pivot = object.pivot;
        this.skew = object.skew;
        this.rotation = object.rotation;
    }
}

export class AlphaGraphics extends PIXI.Graphics {
    constructor(geometry) {
        super(geometry);

        this.filter = new AlphaFilter(options);
        this.filter.blendMode = PIXI.BLEND_MODES.NORMAL_NPM;
        this.filters = [this.filter];
    }

    static from(object, options) {
        if (object instanceof PIXI.GraphicsGeometry) {
            return AlphaGraphics(object);
        }

        object.finishPoly();

        const graphics = new AlphaGraphics(object.geometry, options);

        graphics.position = object.position;
        graphics.scale = object.scale;
        graphics.skew = object.skew;
        graphics.pivot = object.pivot;
        graphics.rotation = object.rotation;

        return graphics;
    }

    configure(object, options) {
        let geometry;

        if (object instanceof PIXI.GraphicsGeometry) {
            geometry = object;
        } else {
            object.finishPoly();

            geometry = object.geometry;
        }

        if (geometry !== this.geometry) {
            this._geometry.refCount--;

            if (this._geometry.refCount === 0) {
                this._geometry.dispose();
            }

            this._geometry = geometry;
        }

        this.filter.configure(options);

        if (object instanceof PIXI.Graphics) {
            graphics.position = object.position;
            graphics.scale = object.scale;
            graphics.skew = object.skew;
            graphics.pivot = object.pivot;
            graphics.rotation = object.rotation;
        }
    }
}

export class AlphaObject {
    static from(object, options) {
        if (object instanceof PIXI.Texture || object instanceof PIXI.Sprite) {
            return AlphaSpriteMesh.from(object, options);
        } else if (object instanceof PIXI.GraphicsGeometry || object instanceof PIXI.Graphics) {
            return AlphaGraphics.from(object, options);
        } else {
            console.assert(false);
        }
    }
}
