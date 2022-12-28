/**
 * @typedef {PIXI.DisplayObject} StencilMaskDisplayObject
 * @property {boolean} [_stencilHole=false] - Render the object as a hole?
 * @property {StencilMaskDisplayObject[]} [_stencilMasks] - The masks of the object.
 * @property {function(PIXI.Renderer):void} [_stencilRender] - The render function.
 */

const quadGeometry = new PIXI.Geometry()
    .addAttribute("position",
        new PIXI.Buffer(new Float32Array([-1, -1, +1, -1, -1, +1, +1, +1]), true, false),
        2, false, PIXI.TYPES.FLOAT
    );

const quadShader = new PIXI.Shader(PIXI.Program.from(
    `attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }`,
    `void main() { }`
));

const quadState = new PIXI.State.for2d();

function quadRender(renderer) {
    renderer.batch.flush();
    renderer.state.set(quadState);
    renderer.shader.bind(quadShader, false);
    renderer.geometry.bind(quadGeometry, quadShader);
    renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLE_STRIP, 4, 0);
}

const tempMatrix = new PIXI.Matrix();

export class StencilMask extends PIXI.Container {
    /** @override */
    render(renderer) {
        if (!this.visible || !this.renderable || !this.isMask) {
            return;
        }

        renderer.batch.flush();

        const maskData = renderer.stencil.maskStack[renderer.stencil.maskStack.length - 1];

        if (maskData.maskObject !== this) {
            return quadRender(renderer);
        }

        if (this.cullable) {
            const sourceFrame = renderer.renderTexture.sourceFrame;

            if (!(sourceFrame.width > 0 && sourceFrame.height > 0)) {
                return;
            }

            let bounds;
            let transform;

            if (this.cullArea) {
                bounds = this.cullArea;
                transform = this.worldTransform;
            } else if (this._render !== StencilMask.prototype._render) {
                bounds = this.getBounds(true);
            }

            const projectionTransform = renderer.projection.transform;

            if (projectionTransform) {
                if (transform) {
                    transform = tempMatrix.copyFrom(transform);
                    transform.prepend(projectionTransform);
                } else {
                    transform = projectionTransform;
                }
            }

            if (bounds && sourceFrame.intersects(bounds, transform)) {
                this._render(renderer);
            } else if (this.cullArea) {
                return;
            }
        }

        const cullChildren = this.cullable && !this.cullArea;
        const prevMaskCount = maskData._stencilCounter - 1;
        const children = this.children;
        const gl = renderer.gl;
        let holed = false;
        let lifted = false;

        for (let i = 0, n = children.length; i < n; i++) {
            const child = children[i];
            const childHole = !!child._stencilHole;
            const masks = child._stencilMasks;
            const maskCount = masks?.length;

            if (!child.visible || !child.renderable || maskCount === 0) {
                continue;
            }

            if (maskCount >= 0) {
                renderer.batch.flush();

                if (lifted) {
                    gl.stencilOp(gl.KEEP, gl.KEEP, holed ? gl.INCR : gl.DECR);
                } else {
                    if (holed) {
                        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
                    } else {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                    }
                }

                quadRender(renderer);

                let holing;

                for (let j = 0; j < maskCount; j++) {
                    const mask = masks[j];

                    if (!mask.visible) {
                        continue;
                    }

                    const maskHole = !!mask._stencilHole;

                    if (holing !== maskHole) {
                        holing = maskHole;

                        renderer.batch.flush();

                        gl.stencilFunc(gl.EQUAL, prevMaskCount + (holing ? 1 : (childHole ? 2 : 0)), 0xFFFFFFFF);
                        gl.stencilOp(gl.KEEP, gl.KEEP, holing === childHole ? gl.INCR : gl.DECR);
                    }

                    const maskRenderable = mask.renderable;
                    const maskCullable = mask.cullable;

                    mask.renderable = true;
                    mask.cullable = maskCullable || cullChildren;

                    if (mask._stencilRender) {
                        mask._stencilRender(renderer);
                    } else {
                        mask.render(renderer);
                    }

                    mask.renderable = maskRenderable;
                    mask.cullable = maskCullable;
                }

                renderer.batch.flush();

                if (!holing) {
                    gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                } else {
                    gl.stencilOp(gl.KEEP, gl.KEEP, childHole ? gl.DECR : gl.INCR);
                }

                lifted = true;
            } else {
                if (lifted) {
                    renderer.batch.flush();

                    if (holed) {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount + 2, 0xFFFFFFFF);
                    } else {
                        gl.stencilFunc(gl.LEQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                        gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
                    }

                    quadRender(renderer);

                    if (childHole) {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                    } else {
                        gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
                    }
                } else {
                    if (holed !== childHole) {
                        renderer.batch.flush();

                        if (childHole) {
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

            const childCullable = child.cullable;

            child.cullable = childCullable || cullChildren;

            if (child._stencilRender) {
                child._stencilRender(renderer);
            } else {
                child.render(renderer);
            }

            child.cullable = childCullable;

            holed = childHole;
        }

        if (lifted) {
            renderer.batch.flush();

            if (holed) {
                gl.stencilFunc(gl.EQUAL, prevMaskCount + 2, 0xFFFFFFFF);
            } else {
                gl.stencilFunc(gl.LEQUAL, prevMaskCount + 1, 0xFFFFFFFF);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
            }

            quadRender(renderer);

            gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        } else {
            if (holed) {
                renderer.batch.flush();

                gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
            }
        }
    }
}
