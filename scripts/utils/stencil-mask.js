import { GeometrySegment } from "./geometry-segment.js";

export class StencilMaskData extends PIXI.MaskData {
    constructor(maskObject) {
        super(maskObject);

        this.type = PIXI.MASK_TYPES.STENCIL;
        this.autoDetect = false;
    }
}

class StencilMaskShader extends PIXI.Shader {
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

class StencilMaskTexturedShader extends PIXI.Shader {
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

const shaderDefault = StencilMaskShader.instance;
const shaderTextured = StencilMaskTexturedShader.instance;
const state = new PIXI.State();

state.depthTest = false;
state.depthMask = false;

export class StencilMask extends PIXI.Container {
    _currentDrawGroup = null;
    _drawGroups = [];
    _maskStack = [];
    _quad;
    _renderable;

    constructor() {
        super();

        this.interactive = false;
        this.interactiveChildren = false;
        this.accessible = false;
        this.accessibleChildren = false;

        this._bounds.minX = -Infinity;
        this._bounds.minY = -Infinity;
        this._bounds.maxX = +Infinity;
        this._bounds.maxY = +Infinity;

        this._quad = new GeometrySegment(new PIXI.Geometry().addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(8), false, false), 2, false, PIXI.TYPES.FLOAT), PIXI.DRAW_MODES.TRIANGLE_STRIP, 4, 0);
        this._quad.retain();
    }

    get renderable() {
        return this._renderable && this.isMask;
    }

    set renderable(value) {
        this._renderable = value;
    }

    draw({ hole = false, geometry = null, drawMode = PIXI.DRAW_MODES.TRIANGLES, size = 0, start = 0, texture = null, threshold = 0 }) {
        hole = !!hole;

        if (!(geometry instanceof GeometrySegment)) {
            geometry = geometry ? new GeometrySegment(geometry, drawMode, size, start) : this._quad;
        }

        if (!hole || this._drawGroups.length !== 0) {
            let currentDrawGroup = this._currentDrawGroup;

            if (currentDrawGroup?.hole !== hole) {
                this._combineLastDrawGroups();
                currentDrawGroup = this._currentDrawGroup = new StencilMaskDrawGroup(hole);

                this._drawGroups.push(currentDrawGroup);

                let filled = false;

                for (const mask of this._maskStack) {
                    if (mask.geometry === this._quad) {
                        currentDrawGroup.masks.length = 0;

                        if (!mask.hole) {
                            currentDrawGroup.masks.push(mask);

                            filled = true;
                        } else {
                            filled = false;
                        }
                    } else if (!filled || mask.hole && currentDrawGroup.masks.length !== 0) {
                        currentDrawGroup.masks.push(mask);

                        filled = false;
                    }
                }

                if (filled) {
                    currentDrawGroup.masks.length = 0;
                }

                for (const { geometry } of currentDrawGroup.masks) {
                    geometry.retain();
                }
            }

            if (!currentDrawGroup.complete) {
                if (geometry === this._quad) {
                    for (const { geometry } of currentDrawGroup.fills) {
                        geometry.release();
                    }

                    currentDrawGroup.fills.length = 0;
                    currentDrawGroup.complete = true;

                    if (currentDrawGroup.masks.length !== 0) {
                        let holes = false;

                        for (const mask of currentDrawGroup.masks) {
                            if (mask.hole) {
                                holes = true;

                                break;
                            }
                        }

                        if (!holes) {
                            if (this._drawGroups.length > 1) {
                                const lastDrawGroup = this._drawGroups[this._drawGroups.length - 2];

                                if (lastDrawGroup.hole === hole && lastDrawGroup.masks.length === 0) {
                                    lastDrawGroup.fills.push(...currentDrawGroup.masks);
                                    currentDrawGroup = this._currentDrawGroup = null;
                                    this._drawGroups.length -= 1;
                                }
                            }

                            if (currentDrawGroup !== null) {
                                currentDrawGroup.fills = currentDrawGroup.masks;
                                currentDrawGroup.masks = [];
                                currentDrawGroup = null;
                            }
                        }
                    }

                    if (currentDrawGroup !== null && currentDrawGroup.masks.length === 0) {
                        const maskStack = this._maskStack;

                        this._maskStack = [];

                        if (hole) {
                            this.clear();

                            currentDrawGroup = null;
                        } else {
                            this._drawGroups.length -= 1;
                            this.clear();
                            this._drawGroups.push(currentDrawGroup);
                            this._currentDrawGroup = currentDrawGroup;
                        }

                        this._maskStack = maskStack;
                    }
                }

                if (currentDrawGroup) {
                    geometry.retain();

                    currentDrawGroup.fills.push(new StencilMaskDrawCall(hole, geometry, texture, threshold));
                }
            }

            this._combineLastDrawGroups();
        }

        return this;
    }

    _combineLastDrawGroups() {
        const drawGroupsCount = this._drawGroups.length;

        if (drawGroupsCount > 1) {
            const lastDrawGroup1 = this._drawGroups[drawGroupsCount - 1];
            const lastDrawGroup2 = this._drawGroups[drawGroupsCount - 2];

            if (lastDrawGroup1.hole === lastDrawGroup2.hole && lastDrawGroup1.masks.length === 0 && lastDrawGroup2.masks.length === 0) {
                lastDrawGroup2.fills.push(...lastDrawGroup1.fills);
                this._drawGroups.length -= 1;
                this._currentDrawGroup = null;
            }
        }
    }

    pushMask({ hole = false, geometry = null, texture = null, threshold = 0 }) {
        hole = !!hole;
        geometry = (geometry = geometry ?? this._quad) instanceof GeometrySegment ? geometry : new GeometrySegment(geometry);

        if (!hole || this._maskStack.length !== 0) {
            this._currentDrawGroup = null;
            this._maskStack.push(new StencilMaskDrawCall(hole, geometry, texture, threshold));
            this._combineLastDrawGroups();
        }

        return this;
    }

    popMask() {
        this._currentDrawGroup = null;
        this._maskStack.pop();
        this._combineLastDrawGroups();

        return this;
    }

    popMasks(count) {
        this._currentDrawGroup = count !== 0 ? null : this._currentDrawGroup;
        this._maskStack.length = count !== undefined ? Math.max(this._maskStack.length - count, 0) : 0;
        this._combineLastDrawGroups();

        return this;
    }

    clear() {
        for (const { fills, masks } of this._drawGroups) {
            for (const { geometry } of fills) {
                geometry.release();
            }

            for (const { geometry } of masks) {
                geometry.release();
            }
        }

        this._currentDrawGroup = null;
        this._drawGroups.length = 0;
        this._maskStack.length = 0;
    }

    destroy() {
        this.clear();

        this._currentDrawGroup = null;
        this._drawGroups = null;
        this._maskStack = null;
        this._quad.release();
        this._quad = null;

        return super.destroy();
    }

    calculateBounds() { }

    getBounds(skipUpdate, rect) {
        throw new Error();
    }

    render(renderer) {
        if (!this.visible || this.worldAlpha <= 0 || !this.renderable) {
            return;
        }

        const drawGroups = this._drawGroups;

        if (drawGroups.length === 0) {
            return;
        }

        renderer.batch.flush();
        renderer.state.set(state);

        const maskData = renderer.stencil.maskStack[renderer.stencil.maskStack.length - 1];
        const quad = this._quad;

        if (maskData.maskObject === this) {
            // TODO: optimize?
            const matrix = shaderTextured.uniforms.matrix = shaderDefault.uniforms.matrix
                .copyFrom(renderer.projection.projectionMatrix)
                .append(this.transform.worldTransform);

            const { a, b, c, d, tx, ty } = matrix;
            const id = 1 / (a * d - c * b);
            const sx = ty * c - tx * d;
            const sy = tx * b - ty * a;

            const buffer = quad.geometry.buffers[0];
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

            renderer.shader.bind(shaderDefault);
        } else {
            renderer.shader.bind(shaderDefault, false);
            quad.draw(renderer);

            return;
        }

        const gl = renderer.gl;
        const prevMaskCount = maskData._stencilCounter - 1;

        let holed = false;
        let lifted = false;
        let textured = false;

        for (let j = 0, m = drawGroups.length; j < m; j++) {
            const { hole, fills, masks } = drawGroups[j];
            const maskCount = masks.length;

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

                    quad.draw(renderer);
                }

                let holing; // holed === hole || undefined

                for (let i = 0; i < maskCount; i++) {
                    const { hole: h, geometry, texture, threshold } = masks[i];

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

                    geometry.draw(renderer);
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

                    quad.draw(renderer);

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
                const { geometry, texture, threshold } = fills[i];

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

                geometry.draw(renderer);
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

            quad.draw(renderer);

            gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        } else {
            if (holed) {
                gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
            }
        }

        for (let i = 0, j = this.children.length; i < j; i++) {
            this.children[i].render(renderer);
        }
    }
}

class StencilMaskDrawGroup {
    hole;
    fills = [];
    masks = [];
    complete = false;

    constructor(hole) {
        this.hole = hole;
    }
}

class StencilMaskDrawCall {
    hole;
    geometry;
    texture;
    threshold;

    constructor(hole, geometry, texture, threshold) {
        this.hole = hole;
        this.geometry = geometry;
        this.texture = texture;
        this.threshold = threshold;
    }
}
