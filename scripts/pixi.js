PIXI.GeometrySystem.prototype.checkCompatibility = function (geometry, program) { };

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
