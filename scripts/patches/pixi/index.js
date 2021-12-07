import "./framebuffer-system.js";
import "./geometry-system.js";
import "./graphics-smooth.js";
import "./shader-system.js";
import "./stencil-system.js";

if (!PIXI.Rectangle.prototype.intersects) {
    PIXI.Rectangle.prototype.intersects = function (other) {
        const x0 = this.x < other.x ? other.x : this.x;
        const x1 = this.right > other.right ? other.right : this.right;

        if (x1 <= x0) {
            return false;
        }

        const y0 = this.y < other.y ? other.y : this.y;
        const y1 = this.bottom > other.bottom ? other.bottom : this.bottom;

        return y1 > y0;
    };
}

Object.defineProperty(PIXI.Renderer.prototype, "globalUniforms", {
    set(value) {
        Object.defineProperty(this, "globalUniforms", { value });

        this.globalUniforms.uniforms.projectionMatrixInverse = new PIXI.Matrix();
        this.globalUniforms.uniforms.viewportFrame = new PIXI.Rectangle();
    }
});

PIXI.ProjectionSystem.prototype.update = function (destinationFrame, sourceFrame, resolution, root) {
    this.destinationFrame = destinationFrame || this.destinationFrame || this.defaultFrame;
    this.sourceFrame = sourceFrame || this.sourceFrame || destinationFrame;

    if (!this.projectionMatrixInverse) {
        this.projectionMatrixInverse = new PIXI.Matrix();
    }

    this.calculateProjection(this.destinationFrame, this.sourceFrame, resolution, root);

    if (this.transform) {
        this.projectionMatrix.append(this.transform);
        this.projectionMatrixInverse.copyFrom(this.projectionMatrix).invert();
    } else {
        this.calculateProjectionInverse(this.destinationFrame, this.sourceFrame, resolution, root);
    }

    const renderer = this.renderer;

    renderer.globalUniforms.uniforms.projectionMatrix = this.projectionMatrix;
    renderer.globalUniforms.uniforms.projectionMatrixInverse = this.projectionMatrixInverse;
    renderer.globalUniforms.uniforms.viewportFrame = renderer.renderTexture.viewportFrame;
    renderer.globalUniforms.update();

    if (renderer.shader.shader) {
        renderer.shader.syncUniformGroup(renderer.shader.shader.uniforms.globals);
    }
};

PIXI.ProjectionSystem.prototype.calculateProjectionInverse = function (_destinationFrame, sourceFrame, _resolution, root) {
    const pmi = this.projectionMatrixInverse;
    const sign = !root ? 1 : -1;

    pmi.identity();

    pmi.a = sourceFrame.width / 2;
    pmi.d = sign * sourceFrame.height / 2;

    pmi.tx = pmi.a + sourceFrame.x;
    pmi.ty = sign * pmi.d + sourceFrame.y;
};

PIXI.Transform.prototype._localInverseID = -1;
PIXI.Transform.prototype._worldInverseID = -1;
PIXI.Transform.prototype._localTransformInverse = null;
PIXI.Transform.prototype._worldTransformInverse = null;

Object.defineProperties(PIXI.Transform.prototype, {
    localTransformInverse: {
        get() {
            let lti = this._localTransformInverse;

            if (!lti) {
                lti = this._localTransformInverse = new PIXI.Matrix();
            }

            if (this._localInverseID !== this._currentLocalID) {
                this._localInverseID = this._currentLocalID;
                lti.copyFrom(this.localTransform).invert();
            }

            return lti;
        }
    },
    worldTransformInverse: {
        get() {
            let wti = this._worldTransformInverse;

            if (!wti) {
                wti = this._worldTransformInverse = new PIXI.Matrix();
            }

            if (this._worldInverseID !== this._worldID) {
                this._worldInverseID = this._worldID;
                wti.copyFrom(this.worldTransform).invert();
            }

            return wti;
        }
    }
});

Object.defineProperties(PIXI.DisplayObject.prototype, {
    localTransformInverse: {
        get() {
            return this.transform.localTransformInverse;
        }
    },
    worldTransformInverse: {
        get() {
            return this.transform.worldTransformInverse;
        }
    }
});
