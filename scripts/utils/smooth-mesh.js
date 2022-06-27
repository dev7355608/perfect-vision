import { GeometrySegment } from "./geometry-segment.js";
import { Tess2 } from "./tess2.js";

const tempPoint = new PIXI.Point();
const clearDepthBuffer = new Float32Array([1]);
const invalidateDepthAttachment = [WebGL2RenderingContext.DEPTH_ATTACHMENT];

export class SmoothMesh extends PIXI.Container {
    _blendColor = null;
    _colorMask = null;

    constructor(geometry, shader, state) {
        super();

        this.geometry = geometry;
        this.shader = shader;
        this.state = state || PIXI.State.for2d();
        this.state.depthTest = true;
        this.state.depthMask = true;
    }

    get geometry() {
        return this._geometry;
    }

    set geometry(value) {
        if (this._geometry === value) {
            return;
        }

        if (this._geometry) {
            this._geometry.refCount--;

            if (this._geometry.refCount === 0) {
                this._geometry.dispose();
            }
        }

        this._geometry = value;

        if (this._geometry) {
            this._geometry.refCount++;
        }
    }

    set blendMode(value) {
        this.state.blendMode = value;
    }

    get blendMode() {
        return this.state.blendMode;
    }

    get drawMode() {
        return this.geometry.drawMode;
    }

    get blendColor() {
        return this._blendColor;
    }

    set blendColor(value) {
        if (value) {
            if (!this._blendColor) {
                this._blendColor = new Float32Array(4);
            }

            this._blendColor[0] = value[0];
            this._blendColor[1] = value[1];
            this._blendColor[2] = value[2];
            this._blendColor[3] = value[3];
        } else {
            this._blendColor = null;
        }
    }

    get colorMask() {
        return this._colorMask;
    }

    set colorMask(value) {
        if (value) {
            if (!this._colorMask) {
                this._colorMask = Object.seal([true, true, true, true]);
            }

            this._colorMask[0] = !!value[0];
            this._colorMask[1] = !!value[1];
            this._colorMask[2] = !!value[2];
            this._colorMask[3] = !!value[3];
        } else {
            this._colorMask = null;
        }
    }

    _render(renderer) {
        const gl = renderer.gl;
        const { geometry, shader, state, drawMode } = this;

        shader.alpha = this.worldAlpha;
        shader.update?.(renderer, this);
        shader.uniforms.translationMatrix = this.worldTransform.toArray(true);
        state.depthTest = !!geometry.falloff;

        renderer.batch.flush();
        renderer.state.set(state);
        renderer.shader.bind(shader);
        renderer.geometry.bind(geometry, shader);

        let prevMaskCount;

        if (geometry.falloff) {
            gl.colorMask(false, false, false, false);
            gl.depthRange(0, 1);
            gl.depthFunc(gl.LEQUAL);

            prevMaskCount = renderer.stencil.getStackLength();

            if (prevMaskCount === 0) {
                renderer.framebuffer.forceStencil();

                gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
                gl.enable(gl.STENCIL_TEST);
                gl.stencilFunc(gl.EQUAL, 0, 0xFFFFFFFF);
            } else {
                gl.clearBufferfv(gl.DEPTH, 0, clearDepthBuffer);
            }

            gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);

            renderer.geometry.draw(drawMode, geometry.fill.size, geometry.fill.start);

            gl.stencilFunc(gl.LESS, prevMaskCount, 0xFFFFFFFF);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

            renderer.geometry.draw(drawMode, geometry.falloff.size, geometry.falloff.start);

            gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        }

        const blendColor = this._blendColor;

        if (blendColor) {
            const [red, green, blue, alpha] = blendColor;

            gl.blendColor(red, green, blue, alpha);
        }

        let colorMask = this._colorMask;

        if (colorMask) {
            const [red, green, blue, alpha] = colorMask;

            if (red && green && blue && alpha) {
                colorMask = null;
            }

            if (colorMask || prevMaskCount !== undefined) {
                gl.colorMask(red, green, blue, alpha);
            }
        } else if (prevMaskCount !== undefined) {
            gl.colorMask(true, true, true, true);
        }

        renderer.geometry.draw(drawMode);

        if (colorMask) {
            gl.colorMask(true, true, true, true);
        }

        if (prevMaskCount !== undefined) {
            if (prevMaskCount === 0) {
                gl.disable(gl.STENCIL_TEST);
            } else {
                gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
            }

            if (renderer.framebuffer.current) {
                gl.invalidateFramebuffer(gl.FRAMEBUFFER, invalidateDepthAttachment);
            }
        }
    }

    _calculateBounds() {
        const { x, y, width, height } = this.geometry.bounds;

        this._bounds.addFrame(this.transform, x, y, x + width, y + height);
    }

    containsPoint(point) {
        this.worldTransform.applyInverse(point, tempPoint);

        return this.geometry.containsPoint(tempPoint);
    }

    destroy(options) {
        super.destroy(options);

        this.geometry = null;
        this.shader = null;
        this.state = null;
    }
}

export class SmoothGeometry extends PIXI.Geometry {
    static EMPTY = new SmoothGeometry().retain();

    contours;
    inset;
    winding;
    bounds;
    fill;
    falloff;
    size;
    start;
    drawMode = PIXI.DRAW_MODES.TRIANGLES;

    constructor(contours, inset = 0, winding = "ODD") {
        super();

        this.contours = [];
        this.inset = inset;
        this.winding = winding;
        this.bounds = new PIXI.Rectangle();

        this._buildGeometry(contours);
        this._calculateBounds();
    }

    _calculateBounds() {
        let minX = +Infinity;
        let minY = +Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const contour of this.contours) {
            const m = contour.length;

            if (m < 6) {
                continue;
            }

            for (let i = 0; i < m; i += 2) {
                const x = contour[i];
                const y = contour[i + 1];

                if (minX > x) {
                    minX = x;
                }

                if (maxX < x) {
                    maxX = x;
                }

                if (minY > y) {
                    minY = y;
                }

                if (maxY < y) {
                    maxY = y;
                }
            }
        }

        if (minX < maxX && minY < maxY) {
            this.bounds.x = minX;
            this.bounds.y = minY;
            this.bounds.width = maxX - minX;
            this.bounds.height = maxY - minY;
        } else {
            this.bounds.x = this.bounds.y = this.bounds.width = this.bounds.height = 0;
        }
    }

    _buildGeometry(contours) {
        const vertices = [];
        const indices = [];

        {
            let tess;

            tess = this._buildContours(contours);
            tess = this._buildFill(vertices, indices, tess);
            tess?.dispose();
        }

        this.fill = new GeometrySegment(this, PIXI.DRAW_MODES.TRIANGLES, indices.length, 0);
        this.size = this.fill.size;
        this.start = this.fill.start;

        if (this.inset > 0) {
            for (const contour of this.contours) {
                this._buildFalloff(contour, vertices, indices);
            }
        }

        this.falloff = indices.length > this.fill.size
            ? new GeometrySegment(this, PIXI.DRAW_MODES.TRIANGLES, indices.length - this.fill.size, this.fill.size)
            : null;

        const buffer = new PIXI.Buffer(new Float32Array(vertices), true, false);

        this.addAttribute("aVertexPosition", buffer, 2, false, PIXI.TYPES.FLOAT)
            .addAttribute("aVertexDepth", buffer, 1, false, PIXI.TYPES.FLOAT)
            .addIndex(new PIXI.Buffer(new (vertices.length / 3 > 65536 ? Uint32Array : Uint16Array)(indices), true, true));
    }

    _buildContours(contours) {
        contours = contours?.filter(c => c.length >= 6);

        if (!contours?.length) {
            return;
        }

        if (this.winding === "ONE") {
            for (const contour of contours) {
                this.contours.push(Array.from(contour));
            }

            return;
        }

        const tess = new Tess2();

        tess.addContours(contours);

        const result = tess.tesselate({
            windingRule: Tess2[`WINDING_${this.winding}`],
            elementType: Tess2.BOUNDARY_CONTOURS
        });

        if (result) {
            for (let i = 0, n = result.elementCount * 2; i < n; i += 2) {
                const k = result.elements[i] * 2;
                const m = result.elements[i + 1] * 2;
                const contour = new Array(m);

                for (let j = 0; j < m; j++) {
                    contour[j] = result.vertices[k + j];
                }

                this.contours.push(contour);
            }
        }

        return tess;
    }

    _buildFill(vertices, indices, tess) {
        if (this.contours.length === 0) {
            return tess;
        }

        if (this.contours.length === 1 && this.winding === "ONE") {
            const contour = this.contours[0];

            if (contour.length >= 6) {
                for (let i = 0; i < contour.length; i += 2) {
                    vertices.push(contour[i], contour[i + 1], +1);
                }

                const triangles = PIXI.utils.earcut(contour);
                const size = triangles.length;

                for (let i = 0; i < size; i++) {
                    indices.push(triangles[i]);
                }
            }

            return tess;
        }

        tess = tess ?? new Tess2();
        tess.addContours(this.contours);

        const result = tess.tesselate({
            windingRule: Tess2[`WINDING_${this.winding !== "ONE" ? this.winding : "ODD"}`],
            elementType: Tess2.POLYGONS
        });

        if (result) {
            for (let i = 0, n = result.vertexCount * 2; i < n; i += 2) {
                vertices.push(result.vertices[i], result.vertices[i + 1], +1);
            }

            for (let i = 0, n = result.elementCount * 3; i < n; i++) {
                indices.push(result.elements[i])
            }
        }

        return tess;
    }

    _buildFalloff(contour, vertices, indices) {
        if (!contour) {
            return;
        }

        const m = contour.length;

        if (m === 0) {
            return;
        }

        const r = this.inset;

        if (!(r > 0)) {
            return;
        }

        const a = Math.PI / (2 * Math.sqrt(r));

        const start = indices.length;
        const first = vertices.length / 3;
        let j = first;

        for (let i = 0, x0 = contour[m - 4], y0 = contour[m - 3], x1 = contour[m - 2], y1 = contour[m - 1],
            dx01 = x1 - x0, dy01 = y1 - y0, dd01 = Math.sqrt(dx01 * dx01 + dy01 * dy01), nx01 = -dy01 / dd01, ny01 = dx01 / dd01; i < m; i += 2) {
            const x2 = contour[i];
            const y2 = contour[i + 1];
            const dx12 = x2 - x1;
            const dy12 = y2 - y1;
            const dd12 = Math.sqrt(dx12 * dx12 + dy12 * dy12);
            const nx12 = -dy12 / dd12;
            const ny12 = dx12 / dd12;

            let k = j + 1;

            vertices.push(x1, y1, -1, x1 + nx01 * r, y1 + ny01 * r, +1);
            indices.push(j - 1, j, k++);

            if (nx01 * ny12 < ny01 * nx12) {
                let a1 = Math.atan2(ny01, nx01);
                let a2 = Math.atan2(ny12, nx12);

                if (a2 > a1) {
                    a2 -= Math.PI * 2;
                }

                const o = Math.max(Math.ceil((a1 - a2) / a), 1);

                indices.push(j, k - 1, k);

                for (let l = 1; l < o; l++) {
                    const t = (a1 * (o - l) + a2 * l) / o;

                    vertices.push(x1 + Math.cos(t) * r, y1 + Math.sin(t) * r, +1);
                    indices.push(j, k, ++k);
                }
            }

            vertices.push(x1 + nx12 * r, y1 + ny12 * r, +1);
            indices.push(k, j, ++k);

            j = k;
            x1 = x2;
            y1 = y2;
            nx01 = nx12;
            ny01 = ny12;
        }

        const end = indices.length;
        const last = j - 1;

        indices[end - 1] = first;
        indices[start] = last;
    }

    containsPoint(point) {
        const { x, y } = point;

        if (!this.bounds.contains(x, y)) {
            return false;
        }

        let inside = false;

        for (const contour of this.contours) {
            const m = contour.length;

            for (let i = 0, x1 = contour[m - 2], y1 = contour[m - 1]; i < m; i += 2) {
                const x2 = contour[i];
                const y2 = contour[i + 1];

                if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * ((y - y1) / (y2 - y1)) + x1) {
                    inside = !inside;
                }

                x1 = x2;
                y1 = y2;
            }
        }

        return inside;
    }

    createMesh(shader, state) {
        return new this.constructor(this, shader, state);
    }

    retain() {
        this.refCount++;

        return this;
    }

    release() {
        this.refCount--;

        if (this.refCount === 0) {
            this.dispose();
        }

        return this;
    }

    destroy(options) {
        super.destroy(options);

        this.contours = null;
        this.bounds = null;
        this.fill = null;
        this.falloff = null;
    }
}
