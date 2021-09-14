import { ShapeGeometry } from "./shape.js";

export class StencilMaskData extends PIXI.MaskData {
    constructor(maskObject) {
        super(maskObject);

        this.type = PIXI.MASK_TYPES.STENCIL;
        this.autoDetect = false;
    }
}

export class StencilMask extends PIXI.DisplayObject {
    constructor() {
        super();

        this._drawCalls = [];
        this._drawCallsDirty = false;
        this._drawCallsSkip = true;
        this._drawCallsSimple = true;
        this._quad = new PIXI.Geometry()
            .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(8), false, false), 2, false, PIXI.TYPES.FLOAT)
            .addIndex(new PIXI.Buffer(new Uint16Array([0, 1, 2, 3]), true, true));
        this._quad.refCount++;
        this._quadDrawMode = PIXI.DRAW_MODES.TRIANGLE_STRIP;
        this._shader = StencilMaskShader.instance;
        this._state = new PIXI.State();
        this._state.blend = false;
        this._state.depthMask = false;
        this._state.depthTest = false;
        this.interactive = false;
        this.interactiveChildren = false;
        this.accessible = false;
        this.accessibleChildren = false;
    }

    destroy(options) {
        this.clear();

        this._drawCalls = null;
        this._drawCallsDirty = false;
        this._drawCallsSkip = true;
        this._drawCallsSimple = true;
        this._quad.refCount--;

        if (this._quad.refCount === 0) {
            this._quad.dispose();
        }

        this._quad = null;
        this._quadDrawMode = null;
        this._shader = null;
        this._state = null;

        return super.destroy(options);
    }

    drawShape(shape, masks, hole = false) {
        if (shape instanceof ShapeGeometry) {
            shape.retain();
        } else {
            shape = new ShapeGeometry(shape).retain();
        }

        if (masks) {
            masks = masks.map(mask => mask instanceof ShapeGeometry ? mask.retain() : new ShapeGeometry(mask).retain());
        } else {
            masks = null;
        }

        hole = !!hole;

        this._drawCalls.push({ shape, masks, hole });
        this._drawCallsDirty = true;
    }

    drawHole(shape, masks) {
        return this.drawShape(shape, masks, true);
    }

    clear() {
        for (const { shape, masks } of this._drawCalls) {
            shape.release();

            if (masks) {
                for (const mask of masks) {
                    mask.release();
                }
            }
        }

        this._drawCalls.length = 0;
        this._drawCallsDirty = true;
        this._drawCallsSkip = true;
        this._drawCallsSimple = true;
    }

    calculateBounds() { }

    removeChild(child) { }

    render(renderer) {
        if (!this.visible || this.worldAlpha <= 0 || !this.renderable || !this.isMask) {
            return;
        }

        if (this._drawCallsDirty) {
            this._drawCallsDirty = false;
            this._drawCallsSkip = true;
            this._drawCallsSimple = true;

            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            for (const drawCall of this._drawCalls) {
                drawCall.skip = true;

                const bounds = drawCall.shape.bounds;
                const _minX = bounds.x;
                const _minY = bounds.y;
                const _maxX = _minX + bounds.width;
                const _maxY = _minY + bounds.height;

                if (_minX < _maxX && _minY < _maxY) {
                    const { masks, hole } = drawCall;

                    if (hole && !masks) {
                        drawCall.skip = false;

                        continue;
                    }

                    if (masks) {
                        masks.size = masks.length;

                        for (let i = 0; i < masks.size;) {
                            const mask = masks[i];
                            const bounds = mask.bounds;
                            const _minX = bounds.x;
                            const _minY = bounds.y;
                            const _maxX = _minX + bounds.width;
                            const _maxY = _minY + bounds.height;

                            if (_minX < _maxX && _minY < _maxY) {
                                minX = _minX < minX ? _minX : minX;
                                minY = _minY < minY ? _minY : minY;
                                maxX = _maxX > maxX ? _maxX : maxX;
                                maxY = _maxY > maxY ? _maxY : maxY;

                                i++;
                            } else {
                                masks.size--;

                                if (i < masks.size) {
                                    masks[i] = masks[masks.size];
                                    masks[masks.size] = mask;
                                }
                            }
                        }

                        if (masks.size === 0) {
                            continue;
                        }

                        this._drawCallsSimple = false;
                    }

                    minX = _minX < minX ? _minX : minX;
                    minY = _minY < minY ? _minY : minY;
                    maxX = _maxX > maxX ? _maxX : maxX;
                    maxY = _maxY > maxY ? _maxY : maxY;

                    drawCall.skip = false;

                    if (!hole) {
                        this._drawCallsSkip = false;
                    }
                }
            }

            if (!this._drawCallsSkip) {
                const verticesBuffer = this._quad.buffers[0];
                const vertices = verticesBuffer.data;

                vertices[0] = minX;
                vertices[1] = minY;
                vertices[2] = maxX;
                vertices[3] = minY;
                vertices[4] = minX;
                vertices[5] = maxY;
                vertices[6] = maxX;
                vertices[7] = maxY;

                verticesBuffer.update();
            }
        }

        if (this._drawCallsSkip) {
            return;
        }

        const gl = renderer.gl;
        const maskData = renderer.stencil.maskStack[renderer.stencil.maskStack.length - 1];

        this._shader.uniforms.translationMatrix = this.transform.worldTransform.toArray(true);

        renderer.batch.flush();
        renderer.shader.bind(this._shader);
        renderer.state.set(this._state);

        let prevMaskCount = maskData._stencilCounter - 1;

        if (this._drawCallsSimple) {
            if (maskData.maskObject !== this) {
                renderer.geometry.bind(this._quad, this._shader);
                renderer.geometry.draw(this._quadDrawMode, 0, 0, 1);

                return;
            }

            let state = false;

            for (const { shape, hole, skip } of this._drawCalls) {
                if (skip) {
                    continue;
                }

                if (state !== hole) {
                    state = hole;

                    if (hole) {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                        gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
                    } else {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
                    }
                }

                renderer.geometry.bind(shape, this._shader);
                renderer.geometry.draw(shape.drawMode, 0, 0, 1);
            }
        } else {
            if (maskData.maskObject !== this) {
                gl.stencilFunc(gl.LESS, prevMaskCount + 1, 0xFFFFFFFF);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);

                renderer.geometry.bind(this._quad, this._shader);
                renderer.geometry.draw(this._quadDrawMode, 0, 0, 1);

                return;
            }

            if (prevMaskCount & 1) {
                renderer.geometry.bind(this._quad, this._shader);
                renderer.geometry.draw(this._quadDrawMode, 0, 0, 1);

                prevMaskCount++;
                maskData._stencilCounter++;
            }

            maskData._stencilCounter++;

            for (const { shape, masks, hole, skip } of this._drawCalls) {
                if (skip) {
                    continue;
                }

                const numMasks = masks?.size;

                let instanceCount = 1;

                if (numMasks) {
                    let state;

                    for (let i = 0; i < numMasks; i++) {
                        const mask = masks[i];

                        if (state !== false) {
                            state = false;

                            gl.stencilFunc(gl.EQUAL, prevMaskCount + (state ? 1 : (hole ? 2 : 0)), 0xFFFFFFFF);
                            gl.stencilOp(gl.KEEP, gl.KEEP, state === hole ? gl.INCR : gl.DECR);
                        }

                        renderer.geometry.bind(mask, this._shader);
                        renderer.geometry.draw(mask.drawMode, 0, 0, 1);
                    }

                    gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                    gl.stencilOp(gl.KEEP, gl.KEEP, hole ? gl.DECR : gl.INCR);
                } else if (!hole) {
                    gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFE);
                    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);

                    instanceCount = 2;
                } else {
                    gl.stencilFunc(gl.LESS, prevMaskCount, 0xFFFFFFFF);
                    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
                }

                shape.instanced = instanceCount > 1;

                renderer.geometry.bind(shape, this._shader);
                renderer.geometry.draw(shape.drawMode, 0, 0, instanceCount);

                shape.instanced = false;

                if (numMasks) {
                    gl.stencilOp(gl.KEEP, gl.KEEP, hole ? gl.INCR : gl.DECR);

                    renderer.geometry.bind(this._quad, this._shader);
                    renderer.geometry.draw(this._quadDrawMode, 0, 0, 1);
                }
            }
        }
    }
}

export class StencilMaskShader extends PIXI.Shader {
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
        super(StencilMaskShader.program);

        this.batchable = false;
    }
}
