export class PointSourcePrepassShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        layout(location = 0) in vec2 aVertexPosition;
        layout(location = 1) in lowp float aVertexDepth;

        uniform mat3 translationMatrix;
        uniform mat3 projectionMatrix;

        void main() {
            gl_Position = vec4((projectionMatrix * (translationMatrix * vec3(aVertexPosition, 1.0))).xy, aVertexDepth, 1.0);
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
        super(PointSourcePrepassShader.program);
    }
}

const prepassShader = PointSourcePrepassShader.instance;

const tempPoint = new PIXI.Point();
const tempRect = new PIXI.Rectangle();
const occlusionMaskStatePool = [];

export class PointSourceMesh extends PIXI.Mesh {
    constructor(geometry, shader, state) {
        super(geometry, shader, state);

        this._worldTransformInverse = null;
        this._worldTransformDirty = -1;
        this._blendColor = null;
        this._colorMask = null;
        this._drawMask = null;
        this.state.depthTest = true;
        this.state.depthMask = true;
    }

    get drawMode() {
        return this.geometry.drawMode;
    }

    set drawMode(value) { }

    get uvBuffer() {
        return null;
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

    get drawMask() {
        if (!this._drawMask) {
            this._drawMask = { fov: true, los: true };
        }

        return this._drawMask;
    }

    get worldTransformInverse() {
        const worldTransformID = this.transform._worldID;

        if (this._worldTransformDirty !== worldTransformID) {
            this._worldTransformDirty = worldTransformID;

            if (!this._worldTransformInverse) {
                this._worldTransformInverse = new PIXI.Matrix();
            }

            this._worldTransformInverse.copyFrom(this.transform.worldTransform).invert();
        }

        return this._worldTransformInverse;
    }

    destroy(options) {
        this._blendColor = null;
        this._colorMask = null;

        super.destroy(options);
    }

    calculateVertices() { }

    calculateUvs() { }

    _calculateBounds() {
        let bounds;

        const drawMask = this._drawMask;

        if (!drawMask || drawMask.fov && drawMask.los) {
            bounds = this.geometry.bounds;
        } else if (drawMask.fov) {
            bounds = this.geometry.fov.bounds;
        } else if (drawMask.los) {
            bounds = this.geometry.los.bounds;
        }

        if (bounds) {
            const { x, y, width, height } = bounds;

            this._bounds.addFrame(this.transform, x, y, x + width, y + height);
        }
    }

    containsPoint(point) {
        if (!this.getBounds().contains(point.x, point.y)) {
            return false;
        }

        this.worldTransform.applyInverse(point, tempPoint);

        const drawMask = this._drawMask;

        if (!drawMask || drawMask.fov && drawMask.los) {
            return this.geometry.containsPoint(tempPoint);
        } else if (drawMask.fov) {
            return this.geometry.fov.containsPoint(tempPoint);
        } else if (drawMask.los) {
            return this.geometry.los.containsPoint(tempPoint);
        }

        return false;
    }

    _render(renderer) {
        if (!this.getBounds(true).intersects(renderer.renderTexture.sourceFrame)) {
            return;
        }

        const gl = renderer.gl;
        const geometry = this.geometry;
        const drawMode = geometry.drawMode;
        const drawMask = this._drawMask;
        let drawCalls;

        if (!drawMask || drawMask.fov && drawMask.los) {
            drawCalls = geometry.drawCalls;
        } else if (drawMask.fov) {
            drawCalls = geometry.drawCalls?.fov;
        } else if (drawMask.los) {
            drawCalls = geometry.drawCalls?.los;
        }

        if (!drawCalls) {
            return;
        }

        this._renderOcclusionMask(renderer);

        renderer.batch.flush();

        const shader = this.shader;

        shader.alpha = this.worldAlpha;

        if (shader.update) {
            shader.update(renderer, this);
        }

        shader.uniforms.translationMatrix = prepassShader.uniforms.translationMatrix = this.worldTransform.toArray(true);

        const prevMaskCount = renderer.stencil.getStackLength();
        const current = renderer.framebuffer.current;

        if (prevMaskCount === 0) {
            renderer.framebuffer.forceStencil();

            gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
            gl.enable(gl.STENCIL_TEST);
            gl.stencilFunc(gl.EQUAL, 0, 0xFFFFFFFF);
        }

        if (current) {
            current.depth = true;
        }

        renderer.state.set(this.state);
        renderer.shader.bind(prepassShader);
        renderer.geometry.bind(geometry, prepassShader);

        gl.colorMask(false, false, false, false);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        gl.depthFunc(gl.ALWAYS);

        renderer.geometry.draw(drawMode, drawCalls[0].size, drawCalls[0].start);

        if (drawCalls[1]) {
            gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);

            renderer.geometry.draw(drawMode, drawCalls[1].size, drawCalls[1].start);

            gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);

            renderer.geometry.draw(drawMode, drawCalls[0].size, drawCalls[0].start);
        }

        gl.stencilFunc(gl.LESS, prevMaskCount, 0xFFFFFFFF);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.depthFunc(gl.LEQUAL);

        renderer.geometry.draw(drawMode, drawCalls[2].size, drawCalls[2].start);

        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);

        renderer.shader.bind(shader);
        renderer.geometry.bind(geometry, shader);

        const blendColor = this._blendColor;

        if (blendColor) {
            gl.blendColor(...blendColor);
        }

        let colorMask = this._colorMask;

        if (colorMask) {
            const { red, green, blue, alpha } = colorMask;

            if (red && green && blue && alpha) {
                colorMask = null;
            }

            gl.colorMask(red, green, blue, alpha);
        } else {
            gl.colorMask(true, true, true, true);
        }

        renderer.geometry.draw(drawMode, drawCalls[3].size, drawCalls[3].start);

        if (colorMask) {
            gl.colorMask(true, true, true, true);
        }

        if (prevMaskCount === 0) {
            gl.disable(gl.STENCIL_TEST);
        } else {
            gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        }

        this._returnOcclusionMask(renderer);
    }

    _renderOcclusionMask(renderer) {
        const shader = this.shader;

        if (!("occlusionMask" in shader)) {
            return;
        }

        const renderTextureSystem = renderer.renderTexture;
        const currentRenderTexture = renderTextureSystem.current;

        let bounds;
        let occlusionMaskState;
        let activeOcclusionObjects;
        let occlusionSourceFrame;
        let noMultisample = true;

        const occlusionObjects = this.occlusionObjects;

        if (occlusionObjects) {
            for (const occlusionObject of occlusionObjects) {
                if (occlusionObject.destroyed || !occlusionObject.visible || !occlusionObject.renderable || occlusionObject.worldAlpha <= 0) {
                    continue;
                }

                bounds = bounds ?? this.getBounds(true, tempRect).fit(renderTextureSystem.sourceFrame);

                const occlusionObjectBounds = occlusionObject.getBounds(true);

                if (!occlusionObjectBounds.intersects(bounds)) {
                    continue;
                }

                if (occlusionMaskState) {
                    occlusionSourceFrame.enlarge(occlusionObjectBounds);
                } else {
                    occlusionMaskState = this._occlusionMaskState = occlusionMaskStatePool.pop() ?? new OcclusionMaskState();
                    occlusionSourceFrame = occlusionMaskState.occlusionSourceFrame.copyFrom(occlusionObjectBounds);
                    activeOcclusionObjects = occlusionMaskState.occlusionObjects;
                }

                activeOcclusionObjects.push(occlusionObject);

                noMultisample = noMultisample && occlusionObject.isSprite;
            }
        }

        if (!occlusionMaskState) {
            shader.occlusionMask = PIXI.Texture.WHITE;

            return;
        }

        renderer.batch.flush();

        const filterStack = renderer.filter.defaultFilterStack;

        const currentSourceFrame = occlusionMaskState.currentSourceFrame.copyFrom(renderTextureSystem.sourceFrame);
        const currentDestinationFrame = occlusionMaskState.currentDestinationFrame.copyFrom(renderTextureSystem.destinationFrame);

        const resolution = currentRenderTexture ? currentRenderTexture.resolution : renderer.resolution;
        const multisample = noMultisample ? PIXI.MSAA_QUALITY.NONE : (currentRenderTexture ? currentRenderTexture.multisample : renderer.multisample);

        occlusionSourceFrame.fit(bounds);
        occlusionSourceFrame.ceil(resolution);

        const occlusionDestinationFrame = occlusionMaskState.occlusionDestinationFrame;

        occlusionDestinationFrame.x = 1 / resolution;
        occlusionDestinationFrame.y = 1 / resolution;
        occlusionDestinationFrame.width = occlusionSourceFrame.width + 2 / resolution;
        occlusionDestinationFrame.height = occlusionSourceFrame.height + 2 / resolution;

        const occlusionTexture = occlusionMaskState.occlusionTexture = renderer.filter.texturePool.getOptimalTexture(
            occlusionDestinationFrame.width,
            occlusionDestinationFrame.height,
            resolution,
            multisample);

        occlusionTexture.filterFrame = occlusionSourceFrame;

        renderTextureSystem.bind(occlusionTexture, occlusionSourceFrame, occlusionDestinationFrame);
        renderer.framebuffer.clear(1, 1, 1, 1);

        if (filterStack.length > 1) {
            filterStack[filterStack.length - 1].renderTexture = occlusionTexture;
        }

        for (const occlusionObject of activeOcclusionObjects) {
            occlusionObject.render(renderer);
        }

        renderer.batch.flush();
        renderer.framebuffer.blit();

        if (filterStack.length > 1) {
            filterStack[filterStack.length - 1].renderTexture = currentRenderTexture;
        }

        renderTextureSystem.bind(currentRenderTexture, currentSourceFrame, currentDestinationFrame);

        occlusionSourceFrame.x -= occlusionDestinationFrame.x;
        occlusionSourceFrame.y -= occlusionDestinationFrame.y;
        occlusionSourceFrame.width = occlusionTexture.width;
        occlusionSourceFrame.height = occlusionTexture.height;

        shader.occlusionMask = occlusionTexture;
    }

    _returnOcclusionMask(renderer) {
        const occlusionMaskState = this._occlusionMaskState;

        if (occlusionMaskState) {
            this.shader.occlusionMask = PIXI.Texture.WHITE;

            renderer.filter.texturePool.returnTexture(occlusionMaskState.occlusionTexture);

            occlusionMaskState.occlusionTexture.filterFrame = null;
            occlusionMaskState.occlusionTexture = null;
            occlusionMaskState.occlusionObjects.length = 0;

            occlusionMaskStatePool.push(occlusionMaskState);

            this._occlusionMaskState = null;
        }
    }
}

class OcclusionMaskState {
    occlusionTexture = null;
    occlusionObjects = [];
    occlusionSourceFrame = new PIXI.Rectangle();
    occlusionDestinationFrame = new PIXI.Rectangle();
    currentSourceFrame = new PIXI.Rectangle();
    currentDestinationFrame = new PIXI.Rectangle();
}
