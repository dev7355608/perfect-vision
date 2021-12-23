export class StencilMaskData extends PIXI.MaskData {
    constructor(maskObject) {
        super(maskObject);

        this.type = PIXI.MASK_TYPES.STENCIL;
        this.autoDetect = false;
    }
}

export class StencilMaskShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        layout(location = 0) in vec2 aVertexPosition;

        uniform mat3 matrix;

        void main() {
            gl_Position = vec4((matrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
        }`;

    static fragmentSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        void main() { }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
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
        super(StencilMaskShader.program);

        this.uniforms.matrix = new PIXI.Matrix();
    }
}

export class StencilMaskTexturedShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        layout(location = 0) in vec2 aVertexPosition;
        layout(location = 1) in vec2 aTextureCoord;

        uniform mat3 matrix;

        out vec2 vTextureCoord;

        void main() {
            gl_Position = vec4((matrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
            vTextureCoord = aTextureCoord;
        }`;

    static fragmentSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        in vec2 vTextureCoord;

        uniform sampler2D uSampler;
        uniform float uAlphaThreshold;

        void main() {
            float alpha = texture(uSampler, vTextureCoord).a;

            if (alpha <= uAlphaThreshold) {
                discard;
            }
        }`;

    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
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
        super(StencilMaskTexturedShader.program);

        this.uniforms.matrix = new PIXI.Matrix();
        this.uniforms.uSampler = PIXI.Texture.EMPTY;
        this.uniforms.uAlphaThreshold = 0;
    }
}

const quad = new PIXI.Geometry()
    .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(8), false, false), 2, false, PIXI.TYPES.FLOAT);

quad.drawMode = PIXI.DRAW_MODES.TRIANGLE_STRIP;
quad.refCount++;

const shaderDefault = StencilMaskShader.instance;
const shaderTextured = StencilMaskTexturedShader.instance;
const state = new PIXI.State();

state.depthTest = false;
state.depthMask = false;

export class StencilMask extends PIXI.DisplayObject {
    constructor() {
        super();

        this.interactive = false;
        this.interactiveChildren = false;
        this.accessible = false;
        this.accessibleChildren = false;

        this._drawCalls = [];
        this._currentDrawCall = null;
        this._maskStack = [];
        this._updateID = -1;
    }

    draw(hole, geometry, drawMode, size, start, texture, threshold) {
        hole = !!hole;

        if (!hole || this._drawCalls.length !== 0) {
            if (this._currentDrawCall?.hole !== hole) {
                this._currentDrawCall = { hole, fills: [] };
                this._drawCalls.push(this._currentDrawCall);

                if (this._maskStack.length > 0) {
                    this._currentDrawCall.masks = Array.from(this._maskStack);

                    for (const { geometry } of this._currentDrawCall.masks) {
                        geometry.refCount++;
                    }
                }
            }

            geometry.refCount++;

            this._currentDrawCall.fills.push({ geometry, drawMode, size, start, texture, threshold });
        }

        return this;
    }

    drawFill(hole) {
        return this.draw(hole, quad, quad.drawMode, 4, 0);
    }

    pushMask(hole, geometry, drawMode, size, start, texture, threshold) {
        hole = !!hole;

        if (!hole || this._maskStack.length !== 0) {
            this._currentDrawCall = null;
            this._maskStack.push({ hole, geometry, drawMode, size, start, texture, threshold });
        }

        return this;
    }

    pushMaskFill() {
        return this.pushMask(false, quad, quad.drawMode, 4, 0);
    }

    popMask() {
        this._currentDrawCall = null;
        this._maskStack.pop();

        return this;
    }

    popMasks(count) {
        this._currentDrawCall = count !== 0 ? null : this._currentDrawCall;
        this._maskStack.length = count !== undefined ? Math.max(this._maskStack.length - count, 0) : 0;

        return this;
    }

    clear() {
        for (const { fills, masks } of this._drawCalls) {
            for (const { geometry } of fills) {
                geometry.refCount--;

                if (geometry.refCount === 0) {
                    geometry.dispose();
                }
            }

            if (!masks) {
                continue;
            }

            for (const { geometry } of masks) {
                geometry.refCount--;

                if (geometry.refCount === 0) {
                    geometry.dispose();
                }
            }
        }

        this._drawCalls.length = 0;
        this._currentDrawCall = null;
        this._maskStack.length = 0;
    }

    destroy() {
        this.clear();

        this._drawCalls = null;
        this._currentDrawCall = null;
        this._maskStack = null;

        return super.destroy();
    }

    calculateBounds() { }

    removeChild(child) { }

    render(renderer) {
        if (!this.visible || this.worldAlpha <= 0 || !this.renderable || !this.isMask) {
            return;
        }

        const drawCalls = this._drawCalls;

        if (drawCalls.length === 0) {
            return;
        }

        renderer.batch.flush();
        renderer.state.set(state);

        const maskData = renderer.stencil.maskStack[renderer.stencil.maskStack.length - 1];
        const buffer = quad.buffers[0];

        if (maskData.maskObject === this || this._updateID !== buffer._updateID) {
            // TODO: optimize?
            const matrix = shaderTextured.uniforms.matrix = shaderDefault.uniforms.matrix
                .copyFrom(renderer.projection.projectionMatrix)
                .append(this.transform.worldTransform);

            const { a, b, c, d, tx, ty } = matrix;
            const id = 1 / (a * d - c * b);
            const sx = ty * c - tx * d;
            const sy = tx * b - ty * a;

            const data = buffer.data;

            data[0] = (sx - d + c) * id;
            data[1] = (sy + b - a) * id;
            data[2] = (sx - d - c) * id;
            data[3] = (sy + b + a) * id;
            data[4] = (sx + d + c) * id;
            data[5] = (sy - b - a) * id;
            data[6] = (sx + d - c) * id;
            data[7] = (sy - b + a) * id;

            buffer.update();

            this._updateID = buffer._updateID;

            renderer.shader.bind(shaderDefault);
        } else {
            renderer.shader.bind(shaderDefault, false);
        }

        const gl = renderer.gl;

        if (maskData.maskObject !== this) {
            renderer.geometry.bind(quad, shaderDefault);
            renderer.geometry.draw(quad.drawMode, 4, 0);

            return;
        }

        const prevMaskCount = maskData._stencilCounter - 1;

        let holed = false;
        let lifted = false;
        let textured = false;

        for (let j = 0, m = drawCalls.length; j < m; j++) {
            const { hole, fills, masks } = drawCalls[j];
            const maskCount = masks?.length;

            if (maskCount) {
                if (j !== 0) {
                    if (lifted) {
                        gl.stencilOp(gl.KEEP, gl.KEEP, holed ? gl.INCR : gl.DECR);
                    } else {
                        if (holed) {
                            gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
                        } else {
                            gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                        }
                    }

                    if (textured) {
                        textured = false;

                        renderer.shader.bind(shaderDefault, false);
                    }

                    renderer.geometry.bind(quad, shaderDefault);
                    renderer.geometry.draw(quad.drawMode, 4, 0);
                }

                let holing; // holed === hole || undefined

                for (let i = 0; i < maskCount; i++) {
                    const { hole: h, geometry, drawMode, size, start, texture, threshold } = masks[i];

                    if (holing !== h) {
                        holing = h;

                        gl.stencilFunc(gl.EQUAL, prevMaskCount + (holing ? 1 : (hole ? 2 : 0)), 0xFFFFFFFF);
                        gl.stencilOp(gl.KEEP, gl.KEEP, holing === hole ? gl.INCR : gl.DECR);
                    }

                    if (textured !== !!texture) {
                        textured = !!texture;

                        if (textured) {
                            const uniforms = shaderTextured.uniforms;

                            uniforms.uSampler = texture;
                            uniforms.uAlphaThreshold = threshold;

                            renderer.shader.bind(shaderTextured);
                        } else {
                            renderer.shader.bind(shaderDefault, false);
                        }
                    }

                    renderer.geometry.bind(geometry);
                    renderer.geometry.draw(drawMode, size, start, geometry.instanceCount);
                }

                if (!holing) {
                    gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                } else {
                    gl.stencilOp(gl.KEEP, gl.KEEP, hole ? gl.DECR : gl.INCR);
                }

                lifted = true;
            } else {
                if (lifted) {
                    if (holed) {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount + 2, 0xFFFFFFFF);
                    } else {
                        gl.stencilFunc(gl.LEQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                        gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
                    }

                    if (textured) {
                        textured = false;

                        renderer.shader.bind(shaderDefault, false);
                    }

                    renderer.geometry.bind(quad, shaderDefault);
                    renderer.geometry.draw(quad.drawMode, 4, 0);

                    if (hole) {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                    } else {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
                    }
                } else {
                    if (holed !== hole) {
                        if (hole) {
                            gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                            gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
                        } else {
                            gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                            gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
                        }
                    }
                }

                lifted = false;
            }

            for (let i = 0, n = fills.length; i < n; i++) {
                const { geometry, drawMode, size, start, texture, threshold } = fills[i];

                if (textured !== !!texture) {
                    textured = !!texture;

                    if (textured) {
                        const uniforms = shaderTextured.uniforms;

                        uniforms.uSampler = texture;
                        uniforms.uAlphaThreshold = threshold;

                        renderer.shader.bind(shaderTextured);
                    } else {
                        renderer.shader.bind(shaderDefault, false);
                    }
                }

                renderer.geometry.bind(geometry);
                renderer.geometry.draw(drawMode, size, start, geometry.instanceCount);
            }

            holed = hole;
        }

        if (lifted) {
            if (holed) {
                gl.stencilFunc(gl.EQUAL, prevMaskCount + 2, 0xFFFFFFFF);
            } else {
                gl.stencilFunc(gl.LEQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
            }

            if (textured) {
                textured = false;

                renderer.shader.bind(shaderDefault, false);
            }

            renderer.geometry.bind(quad, shaderDefault);
            renderer.geometry.draw(quad.drawMode, 4, 0);
        }
    }
}
