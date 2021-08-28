import { ShapeData } from "./shape-data.js";

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
        this._quad = new PIXI.Geometry()
            .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(8), false, false), 2, false, PIXI.TYPES.FLOAT)
            .addIndex(new PIXI.Buffer(new Uint16Array([0, 1, 2, 3]), true, true));
        this._quad.refCount++;
        this._quadDrawMode = PIXI.DRAW_MODES.TRIANGLE_STRIP;
        this._quadEmpty = true;
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
        this._drawCalls = null;
        this._drawCallsDirty = false;
        this._quad.refCount--;

        if (this._quad.refCount === 0) {
            this._quad.dispose();
        }

        this._quad = null;
        this._quadDrawMode = null;
        this._quadEmpty = true;

        return super.destroy(options);
    }

    drawShape(shape, masks, hole = false) {
        if (shape instanceof ShapeData) {
            shape.retain();
        } else {
            shape = ShapeData.from(shape);
        }

        if (masks) {
            masks = masks.map(mask => mask instanceof ShapeData ? mask.retain() : ShapeData.from(mask));
        } else {
            masks = null;
        }

        this._drawCalls.push({ shape, masks, hole });
        this._drawCallsDirty = true;
    }

    drawHole(shape, masks) {
        return this.drawShape(shape, masks, true);
    }

    clear() {
        for (const { shape, mask } of this._drawCalls) {
            shape.release();
            mask?.release();
        }

        this._drawCalls.length = 0;
        this._drawCallsDirty = true;
    }

    calculateBounds() { }

    removeChild(child) { }

    render(renderer) {
        if (!this.visible || this.worldAlpha <= 0 || !this.renderable || !this.isMask) {
            return;
        }

        if (this._drawCallsDirty) {
            this._drawCallsDirty = false;

            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            for (const { shape, masks, hole } of this._drawCalls) {
                if (hole && !masks) {
                    continue;
                }

                const bounds = shape.bounds;
                const _minX = bounds.x;
                const _minY = bounds.y;
                const _maxX = _minX + bounds.width;
                const _maxY = _minY + bounds.height;

                if (_minX < _maxX && _minY < _maxY) {
                    let skip;

                    if (masks) {
                        skip = true;

                        for (const mask of masks) {
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

                                skip = false;
                            }
                        }
                    }

                    if (!skip) {
                        minX = _minX < minX ? _minX : minX;
                        minY = _minY < minY ? _minY : minY;
                        maxX = _maxX > maxX ? _maxX : maxX;
                        maxY = _maxY > maxY ? _maxY : maxY;
                    }
                }
            }

            this._quadEmpty = !(minX < maxX && minY < maxY);

            if (!this._quadEmpty) {
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

        if (this._quadEmpty) {
            return;
        }

        const gl = renderer.gl;
        const maskData = renderer.stencil.maskStack[renderer.stencil.maskStack.length - 1];

        this._shader.uniforms.translationMatrix = this.transform.worldTransform.toArray(true);

        renderer.batch.flush();
        renderer.shader.bind(this._shader);
        renderer.state.set(this._state);

        let prevMaskCount = maskData._stencilCounter - 1;

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

        for (const { shape, masks, hole } of this._drawCalls) {
            if (shape.isEmpty()) {
                continue;
            }

            let numMasks = 0;

            if (masks) {
                numMasks = masks.length;

                for (let i = 0; i < numMasks;) {
                    const mask = masks[i];

                    if (mask.isEmpty()) {
                        numMasks--;

                        if (i < numMasks) {
                            masks[i] = masks[numMasks];
                            masks[numMasks] = mask;
                        }
                    } else {
                        i++;
                    }
                }

                if (numMasks === 0) {
                    continue;
                }
            }

            if (hole) {
                if (numMasks === 0) {
                    gl.stencilFunc(gl.LESS, prevMaskCount, 0xFFFFFFFF);
                    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
                } else {
                    gl.stencilFunc(gl.EQUAL, prevMaskCount + 2, 0xFFFFFFFF);
                    gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
                }
            } else {
                if (numMasks === 0) {
                    gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFE);
                } else {
                    gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                }

                gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
            }

            if (numMasks !== 0) {
                for (let i = 0; i < numMasks; i++) {
                    const mask = masks[i];

                    renderer.geometry.bind(mask.geometry, this._shader);
                    renderer.geometry.draw(mask.drawMode, 0, 0, 1);
                }

                gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
            } else if (!hole) {
                shape.geometry.instanced = true;
                shape.geometry.instanceCount = 2;
            }

            renderer.geometry.bind(shape.geometry, this._shader);
            renderer.geometry.draw(shape.drawMode, 0, 0, shape.geometry.instanceCount);

            if (numMasks !== 0) {
                gl.stencilOp(gl.KEEP, gl.KEEP, hole ? gl.INCR : gl.DECR);

                renderer.geometry.bind(this._quad, this._shader);
                renderer.geometry.draw(this._quadDrawMode, 0, 0, 1);
            } else if (!hole) {
                shape.geometry.instanced = false;
                shape.geometry.instanceCount = 1;
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
