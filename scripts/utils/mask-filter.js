export class MaskFilter extends PIXI.Filter {
    static vertexSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        attribute vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform vec4 inputSize;
        uniform vec4 outputFrame;
        uniform vec4 uMaskFrame;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        void main() {
            vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);

            gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);

            vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
            vMaskCoord = (position.xy - uMaskFrame.xy) / uMaskFrame.zw;
        }`;

    static fragmentSrc = `\
        #version 100

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        varying vec2 vTextureCoord;
        varying vec2 vMaskCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMask;

        void main() {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec4 mask = texture2D(uMask, vMaskCoord);

            gl_FragColor = color * mask.r;
        }`;

    constructor(vertex, fragment, uniforms) {
        super(vertex || MaskFilter.vertexSrc, fragment || MaskFilter.fragmentSrc, uniforms);

        this._resolution = undefined;
        this._multisample = undefined;
        this._blendColor = null;
        this._colorMask = null;
        this.maskSprite = null;
    }

    get resolution() {
        if (this._resolution !== undefined) {
            return this._resolution;
        }

        const renderer = canvas.app.renderer;
        const renderTexture = renderer.renderTexture;

        if (renderTexture.current) {
            return renderTexture.current.resolution;
        }

        return renderer.resolution;
    }

    set resolution(value) {
        this._resolution = value;
    }

    get multisample() {
        if (this._multisample !== undefined) {
            return this._multisample;
        }

        const renderer = canvas.app.renderer;
        const renderTexture = renderer.renderTexture;

        if (renderTexture.current) {
            return renderTexture.current.multisample;
        }

        return renderer.multisample;
    }

    set multisample(value) {
        this._multisample = value;
    }

    get blendColor() {
        if (!this._blendColor) {
            this._blendColor = new Float32Array(4);
        }

        return this._blendColor;
    }

    get colorMask() {
        if (!this._colorMask) {
            this._colorMask = { red: true, green: true, blue: true, alpha: true };
        }

        return this._colorMask;
    }

    apply(filterManager, input, output, clearMode, currentState) {
        const renderer = filterManager.renderer;

        if (this.maskSprite) {
            this.uniforms.uMask = this.maskSprite.texture;
            this.uniforms.uMaskFrame = this.maskSprite.getBounds(true);
        } else {
            this.uniforms.uMaskFrame = this.maskFrame ?? renderer.screen;
        }

        renderer.state.set(this.state);
        filterManager.bindAndClear(output, clearMode);

        this.uniforms.uSampler = input;
        this.uniforms.filterGlobals = filterManager.globalUniforms;

        renderer.shader.bind(this);

        this.legacy = !!this.program.attributeData.aTextureCoord;

        const gl = renderer.gl;

        const blendColor = this._blendColor;

        if (blendColor) {
            gl.blendColor(...blendColor);
        }

        let colorMask = this._colorMask;

        if (colorMask) {
            const { red, green, blue, alpha } = colorMask;

            if (red && green && blue && alpha) {
                colorMask = null;
            } else {
                gl.colorMask(red, green, blue, alpha);
            }
        }

        if (this.legacy) {
            filterManager.quadUv.map(input._frame, input.filterFrame);

            renderer.geometry.bind(filterManager.quadUv);
            renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES);
        } else {
            renderer.geometry.bind(filterManager.quad);
            renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLE_STRIP);
        }

        if (colorMask) {
            gl.colorMask(true, true, true, true);
        }
    }
}

export class MaskData extends PIXI.MaskData {
    constructor(sprite, filter) {
        super(sprite);

        this.type = PIXI.MASK_TYPES.SPRITE;
        this.autoDetect = false;
        this.filter = filter ?? new MaskFilter();
        this.resolution = null;
        this.multisample = PIXI.MSAA_QUALITY.NONE;
    }
}
