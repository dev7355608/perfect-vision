const Tess2 = typeof WebAssembly === "object" ? await createTess2Wasm().then(m => m.Tess) : undefined;

const tempPoint = new PIXI.Point();
const tempMatrix = new PIXI.Matrix();
const emptyFloat32Array = new Float32Array(0);
const emptyUint16Array = new Uint16Array(0);
const clearDepthBuffer = new Float32Array([1]);
const invalidateDepthAttachment = [WebGL2RenderingContext.DEPTH_ATTACHMENT];

/**
 * This mesh is rendered with smooth edges.
 */
export class SmoothMesh extends PIXI.Container {
    /**
     * @type {SmoothGeometry}
     * @protected
     */
    _geometry;

    /**
     * The shader.
     * @type {SmoothShader}
     */
    shader;

    /**
     * The state.
     * @type {PIXI.State}
     */
    state;

    /**
     * The bounds of the geometry in world space.
     * @type {PIXI.Bounds}
     * @protected
     * @readonly
     */
    _geometryBounds = new PIXI.Bounds();

    /**
     * The transform dirty ID of the geometry bounds.
     * @type {number}
     * @protected
     */
    _geometryBoundsTransformDirty = -1;

    /**
     * The geometry dirty ID of the geometry bounds.
     * @type {number}
     * @protected
     */
    _geometryBoundsVertexDirty = -1;

    /**
     * The translation matrix uniform.
     * @type {Float32Array}
     * @protected
     * @readonly
     */
    _translationMatrix = new Float32Array(9);

    /**
     * The transform dirty ID of the translation matrix.
     * @type {number}
     * @protected
     */
    _translationMatrixTransformDirty = -1;

    /**
     * The geometry dirty ID of the translation matrix.
     * @type {number}
     * @protected
     */
    _translationMatrixVertexDirty = -1;

    /**
     * @param {SmoothGeometry} [geometry] - The geometry.
     * @param {SmoothShader} [shader] - The shader.
     * @param {PIXI.State} [state] - The state.
     */
    constructor(geometry, shader, state) {
        super();

        this.geometry = geometry ?? SmoothGeometry.EMPTY;
        this.shader = shader ?? new SmoothShader();
        this.state = state ?? PIXI.State.for2d();
        this.state.depthMask = true;
    }

    /**
     * The geometry.
     * @type {SmoothGeometry}
     */
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

        this._geometryBoundsVertexDirty = -1;
        this._translationMatrixVertexDirty = -1;
    }

    /**
     * The vertex buffer. {@link SmoothGeometry#vertexBuffer}
     * @type {PIXI.Buffer}
     * @readonly
     */
    get vertexBuffer() {
        return this.geometry.vertexBuffer;
    }

    /**
     * Alias for {@link SmoothMesh#vertexBuffer}.
     * @type {PIXI.Buffer}
     * @readonly
     */
    get verticesBuffer() {
        return this.vertexBuffer;
    }

    /**
     * The index buffer. {@link SmoothGeometry#indexBuffer}
     * @type {PIXI.Buffer}
     * @readonly
     */
    get indexBuffer() {
        return this.geometry.indexBuffer;
    }

    /**
     * Alias for {@link SmoothMesh#indexBuffer}.
     * @type {PIXI.Buffer}
     * @readonly
     */
    get indicesBuffer() {
        return this.indexBuffer;
    }

    /**
     * Alias for {@link SmoothMesh#shader}.
     * @type {SmoothShader}
     */
    set material(value) {
        this.shader = value;
    }

    get material() {
        return this.shader;
    }

    /**
     * The blend mode.
     * @type {PIXI.BLEND_MODES}
     */
    set blendMode(value) {
        this.state.blendMode = value;
    }

    get blendMode() {
        return this.state.blendMode;
    }

    /**
     * The draw mode.
     * @type {PIXI.BLEND_MODES}
     * @readonly
     */
    get drawMode() {
        return PIXI.DRAW_MODES.TRIANGLES;
    }

    /**
     * The tint.
     * @type {number}
     */
    get tint() {
        return "tint" in this.shader ? this.shader.tint : null;
    }

    set tint(value) {
        this.shader.tint = value;
    }

    /**
     * The texture.
     * @type {PIXI.Texture}
     */
    get texture() {
        return "texture" in this.shader ? this.shader.texture : null;
    }

    set texture(value) {
        this.shader.texture = value;
    }

    /** @override */
    _render(renderer) {
        const { geometry, shader, state, drawMode, transform } = this;

        if (this._translationMatrixTransformDirty !== transform._worldID
            || this._translationMatrixVertexDirty !== geometry.vertexBuffer._updateID) {
            this._translationMatrixTransformDirty = transform._worldID;
            this._translationMatrixVertexDirty = geometry.vertexBuffer._updateID;

            if (geometry.inverseVertexTransform) {
                tempMatrix.copyFrom(transform.worldTransform);
                tempMatrix.append(geometry.inverseVertexTransform);
                tempMatrix.toArray(true, this._translationMatrix);
            } else {
                transform.worldTransform.toArray(true, this._translationMatrix);
            }
        }

        shader.update?.(this, renderer);
        shader.uniforms.translationMatrix = this._translationMatrix;

        renderer.batch.flush();
        renderer.shader.bind(shader);
        renderer.geometry.bind(geometry, shader);

        const depthStencil = state.depthTest = geometry.depthStencil
            && geometry.falloffAttributeName in shader.program.attributeData;

        renderer.state.set(state);

        if (depthStencil) {
            const gl = renderer.gl;

            gl.colorMask(false, false, false, false);
            gl.depthRange(0, 1);
            gl.depthFunc(gl.LEQUAL);

            const prevMaskCount = renderer.stencil.getStackLength();

            if (prevMaskCount === 0) {
                renderer.framebuffer.forceStencil();

                gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
                gl.enable(gl.STENCIL_TEST);
                gl.stencilFunc(gl.EQUAL, 0, 0xFFFFFFFF);
            } else {
                gl.clearBufferfv(gl.DEPTH, 0, clearDepthBuffer);
            }

            gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);

            renderer.geometry.draw(drawMode, geometry.depthStencilOffset, 0);

            gl.stencilFunc(gl.LESS, prevMaskCount, 0xFFFFFFFF);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

            renderer.geometry.draw(
                drawMode,
                geometry.indexBuffer.data.length - geometry.depthStencilOffset,
                geometry.depthStencilOffset
            );

            gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
            gl.colorMask(true, true, true, true);

            renderer.geometry.draw(drawMode);

            if (prevMaskCount === 0) {
                gl.disable(gl.STENCIL_TEST);
            } else {
                gl.stencilFunc(gl.EQUAL, prevMaskCount, 0xFFFFFFFF);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
            }

            if (renderer.framebuffer.current) {
                gl.invalidateFramebuffer(gl.FRAMEBUFFER, invalidateDepthAttachment);
            }
        } else {
            renderer.geometry.draw(drawMode, geometry.depthStencilOffset, 0);
        }
    }

    /** @override */
    _calculateBounds() {
        const { transform, geometry } = this;
        const bounds = this._bounds;
        const geometryBounds = this._geometryBounds;

        if (this._geometryBoundsTransformDirty !== transform._worldID
            || this._geometryBoundsVertexDirty !== geometry.vertexBuffer._updateID) {
            this._geometryBoundsTransformDirty = transform._worldID;
            this._geometryBoundsVertexDirty = geometry.vertexBuffer._updateID;

            const { x, y, width, height } = this.geometry.bounds;

            geometryBounds.clear();
            geometryBounds.addFrame(transform, x, y, x + width, y + height);
        }

        bounds.minX = geometryBounds.minX;
        bounds.minY = geometryBounds.minY;
        bounds.maxX = geometryBounds.maxX;
        bounds.maxY = geometryBounds.maxY;
    }

    /** @override */
    containsPoint(point) {
        this.worldTransform.applyInverse(point, tempPoint);

        return this.geometry.containsPoint(tempPoint);
    }

    /** @override */
    destroy(options) {
        super.destroy(options);

        this.geometry = null;
        this.shader = null;
        this.state = null;
    }
}

/**
 * The geometry of {@link SmoothMesh}.
 */
export class SmoothGeometry extends PIXI.Geometry {
    /**
     * The fill rules.
     * @typedef {"even-odd"|"nonzero"|"positive"|"negative"|"abs-geq-two"|"zero-one"} FillRule
     */

    /**
     * Empty geometry.
     * @type {SmoothGeometry}
     * @readonly
     */
    static EMPTY = new SmoothGeometry().retain();

    /**
     * The contours.
     * @type {number[][]}
     * @readonly
     */
    contours = [];

    /**
     * The bounds.
     * @type {PIXI.Rectangle}
     * @readonly
     */
    bounds = new PIXI.Rectangle();

    /**
     * The falloff distance.
     * @type {number}
     * @readonly
     */
    falloffDistance = 0;

    /**
     * The miter limit.
     * @type {number}
     * @readonly
     */
    miterLimit = 0;

    /**
     * The inverse vertex transform.
     * @type {PIXI.Matrix}
     * @readonly
     */
    inverseVertexTransform = null;

    /**
     * The attribute name of the vertices.
     * @type {string}
     * @readonly
     */
    vertexAttributeName;

    /**
     * The attribute name of the falloff.
     * @type {string}
     * @readonly
     */
    falloffAttributeName;

    /**
     * If true, computation of the proper geometry failed and
     * the mesh needs to be render with the depth/stencil technique.
     * @type {boolean}
     * @readonly
     */
    depthStencil = false;

    /**
     * The the first element in the geometry used by the depth/stencil technique
     * to render the falloff. The elements before this offset are a triangulation
     * of the geometry without falloff.
     * If the depth/stencil technique is not required to render the geometry,
     * this offset matches the size of the proper geometry.
     * @type {number}
     * @readonly
     */
    depthStencilOffset = 0;

    /**
     * The vertex buffer ([x, y, depth, x, y, ...]).
     * @type {PIXI.Buffer}
     * @readonly
     */
    vertexBuffer;

    /**
     * Alias for {@link SmoothGeometry#vertexBuffer}.
     * @type {PIXI.Buffer}
     * @readonly
     */
    get verticesBuffer() {
        return this.vertexBuffer;
    }

    /**
     * Alias for {@link PIXI.Geometry#indexBuffer}.
     * @type {PIXI.Buffer}
     * @readonly
     */
    get indicesBuffer() {
        return this.indexBuffer;
    }

    /**
     * @param {(number[]|PIXI.Polygon)[]} [polygons] - The polygons.
     * @param {object} [options] @see {@link SmoothGeometry#update}
     * @param {string} [options.vertexAttributeName="aVertexPosition"] - The attribute name of the vertices.
     * @param {string} [options.falloffAttributeName="aDepthValue"] - The attribute name of the falloff.
     */
    constructor(polygons, options) {
        super();

        const buffer = new PIXI.Buffer(emptyFloat32Array, true, false);

        this.vertexAttributeName = options?.vertexAttributeName ?? "aVertexPosition";
        this.falloffAttributeName = options?.falloffAttributeName ?? "aDepthValue";

        this.addAttribute(this.vertexAttributeName, buffer, 2, false, PIXI.TYPES.FLOAT)
            .addAttribute(this.falloffAttributeName, buffer, 1, false, PIXI.TYPES.FLOAT)
            .addIndex(new PIXI.Buffer(emptyUint16Array, true, true));
        this.vertexBuffer = this.buffers[0];
        this.update(polygons, options);
    }

    /**
     * Update the geometry.
     * @param {(number[]|PIXI.Polygon)[]} [polygons] - The polygons, which are filled according to the `fillRule`.
     * @param {object} [options]
     * @param {number} [options.falloffDistance=0] - The falloff distance.
     * @param {number} [options.miterLimit=0] - The miter limit for reflex vertices.
     * @param {FillRule} [options.fillRule="even-odd"] - The fill rule.
     * @param {PIXI.Matrix} [options.vertexTransform] - Transform the vertices.
     * @returns {this}
     */
    update(polygons, { falloffDistance = 0, miterLimit = 0, fillRule = "even-odd", vertexTransform } = {}) {
        this.contours = [];
        this.falloffDistance = Math.max(falloffDistance, 0);
        this.miterLimit = Math.max(miterLimit, 0);

        const triangulation = {};

        {
            let tess;

            tess = this.#computeContours(polygons, fillRule);
            tess = this.#computeTriangulation(triangulation, tess);
            tess?.dispose();
        }

        this.depthStencil = false;
        this.depthStencilOffset = triangulation.indices.length;

        if (this.depthStencilOffset > 0 && falloffDistance > 0) {
            try {
                const [vertices, indices] = sskelmesh(
                    triangulation.vertices,
                    triangulation.indices,
                    {
                        distance: this.falloffDistance,
                        miterLimit: this.miterLimit,
                        normalize: true,
                        precision: 10
                    }
                );

                triangulation.vertices = vertices;
                triangulation.indices = indices;
                this.depthStencilOffset = indices.length;
            } catch (e) {
                this.depthStencil = true;
                this.#buildDepthStencil(triangulation);
            }
        } else {
            this.#buildFoundation(triangulation);
        }

        const { vertices, indices } = triangulation;

        if (vertexTransform) {
            for (let i = 0, n = vertices.length; i < n; i += 3) {
                vertexTransform.apply(tempPoint.set(vertices[i], vertices[i + 1]), tempPoint);
                vertices[i] = tempPoint.x;
                vertices[i + 1] = tempPoint.y;
            }

            if (this.inverseVertexTransform) {
                this.inverseVertexTransform.copyFrom(vertexTransform);
                this.inverseVertexTransform.invert();
            } else {
                this.inverseVertexTransform = vertexTransform.clone().invert();
            }
        } else {
            this.inverseVertexTransform = null;
        }

        this.#updateBuffers(vertices, indices);
        this.#calculateBounds();

        return this;
    }

    /**
     * Compute the contours.
     * @param {(number[]|PIXI.Polygon)[]} [polygons] - The polygons.
     * @param {FillRule} fillRule - The fill rule.
     * @returns {Tess2|undefined} The Tess2 instance.
     */
    #computeContours(polygons, fillRule) {
        polygons = polygons?.map(p => p.points ?? p)?.filter(p => p.length >= 6);

        if (!polygons?.length) {
            return;
        }

        if (fillRule === "zero-one") {
            for (const polygon of polygons) {
                if (polygon.length >= 6) {
                    this.contours.push(Array.from(polygon));
                }
            }

            return;
        }

        const tess = new Tess2();

        tess.addContours(polygons);

        let windingRule;

        switch (fillRule) {
            default:
            case "even-odd": windingRule = 0; break; // WINDING_ODD
            case "nonzero": windingRule = 1; break; // WINDING_NONZERO
            case "positive": windingRule = 2; break; // WINDING_POSITIVE
            case "negative": windingRule = 3; break; // WINDING_NEGATIVE
            case "abs-geq-two": windingRule = 4; break; // WINDING_ABS_GEQ_TWO
        };

        const result = tess.tesselate({
            windingRule,
            elementType: 2 // BOUNDARY_CONTOURS
        });

        if (result) {
            for (let i = 0, n = result.elementCount * 2; i < n; i += 2) {
                const k = result.elements[i] * 2;
                const m = result.elements[i + 1] * 2;

                if (m < 6) {
                    continue;
                }

                const contour = new Array(m);

                for (let j = 0; j < m; j++) {
                    contour[j] = result.vertices[k + j];
                }

                this.contours.push(contour);
            }
        }

        return tess;
    }

    /**
     * Compute the vertices and indices from the contours.
     * @param {{vertices: number[], indices: number[]}} triangulation - The output for the triangulation.
     * @param {Tess2} [tess] - The Tess2 instance.
     * @returns {Tess2|undefined} The Tess2 instance.
     */
    #computeTriangulation(triangulation, tess) {
        if (this.contours.length === 0) {
            triangulation.vertices = [];
            triangulation.indices = [];

            return tess;
        }

        if (this.contours.length === 1) {
            const contour = this.contours[0];

            if (contour.length >= 6) {
                triangulation.vertices = contour;
                triangulation.indices = PIXI.utils.earcut(contour);
            } else {
                triangulation.vertices = [];
                triangulation.indices = [];
            }

            return tess;
        }

        tess = tess ?? new Tess2();
        tess.addContours(this.contours);

        const result = tess.tesselate({
            windingRule: 0, // WINDING_ODD
            elementType: 0 // POLYGONS
        });

        if (result) {
            triangulation.vertices = Array.from(result.vertices);
            triangulation.indices = Array.from(result.elements);
        } else {
            triangulation.vertices = [];
            triangulation.indices = [];
        }

        return tess;
    }

    /**
     * Build the foundation.
     * @param {{vertices: number[], indices: number[]}} triangulation - The triangulation of the polygons.
     */
    #buildFoundation(triangulation) {
        const v = triangulation.vertices;
        const n = v.length;
        const vertices = new Array(n / 2 * 3);

        for (let i = 0, j = 0; i < n; i += 2) {
            vertices[j++] = v[i];
            vertices[j++] = v[i + 1];
            vertices[j++] = 1;
        }

        triangulation.vertices = vertices;
    }

    /**
     * Build the geometry for the depth/stencil technique.
     * @param {{vertices: number[], indices: number[]}} triangulation - The triangulation of the polygons.
     */
    #buildDepthStencil(triangulation) {
        this.#buildFoundation(triangulation);

        const { vertices, indices } = triangulation;

        for (const contour of this.contours) {
            this.#buildDepthStencilFalloff(contour, vertices, indices);
        }
    }

    /**
     * Build falloff edges from the contour for the depth/stencil technique.
     * @param {number[]} contour - The contour.
     * @param {number[]} vertices - The output array for the vertices.
     * @param {number[]} indices - The output array for the indices.
     */
    #buildDepthStencilFalloff(contour, vertices, indices) {
        const m = contour.length;
        const r = this.falloffDistance;
        const l = this.miterLimit ** 2;

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

            vertices.push(x1, y1, 0);
            indices.push(j - 1, j, k++);

            if (nx01 * ny12 < ny01 * nx12) {
                let nx1 = nx01 + nx12;
                let ny1 = ny01 + ny12;
                const p1 = nx01 * nx1 + ny01 * ny1;

                nx1 /= p1;
                ny1 /= p1;

                let n = nx1 * nx1 + ny1 * ny1;

                if (n > l) {
                    n = Math.sqrt(n);
                    nx1 /= n;
                    ny1 /= n;

                    let nx0 = nx01 + nx1;
                    let ny0 = ny01 + ny1;
                    const p0 = nx01 * nx0 + ny01 * ny0;

                    nx0 /= p0;
                    ny0 /= p0;

                    let nx2 = nx12 + nx1;
                    let ny2 = ny12 + ny1;
                    const p2 = nx12 * nx2 + ny12 * ny2;

                    nx2 /= p2;
                    ny2 /= p2;

                    vertices.push(x1 + nx0 * r, y1 + ny0 * r, 1, x1 + nx2 * r, y1 + ny2 * r, 1);
                    indices.push(j, k - 1, k, k, j, ++k);
                } else {
                    vertices.push(x1 + nx1 * r, y1 + ny1 * r, 1);
                    indices.push(k - 1, j, k);
                }
            } else {
                vertices.push(x1 + nx01 * r, y1 + ny01 * r, 1, x1 + nx12 * r, y1 + ny12 * r, 1);
                indices.push(k, j, ++k);
            }

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

    /**
     * Update the buffers.
     * @param {number[]|Float32Array} vertices - The vertices.
     * @param {number[]|Uint16Array|Uint32Array} indices - The indices.
     */
    #updateBuffers(vertices, indices) {
        const vertexBuffer = this.vertexBuffer;

        if (vertices instanceof Array) {
            if (vertexBuffer.data.length === vertices.length) {
                vertexBuffer.data.set(vertices);
            } else {
                vertexBuffer.data = new Float32Array(vertices);
            }
        } else {
            vertexBuffer.data = vertices;
        }

        vertexBuffer.update();

        const indexBuffer = this.indexBuffer;

        if (indices instanceof Array) {
            if (indexBuffer.data.length === indices.length) {
                indexBuffer.data.set(indices);
            } else {
                indexBuffer.data = new (vertices.length / 3 > 65536 ? Uint32Array : Uint16Array)(indices);
            }
        } else {
            indexBuffer.data = indices;
        }

        indexBuffer.update();
    }

    /**
     * Calculate the bounds of the geometry.
     */
    #calculateBounds() {
        let minX = +Infinity;
        let minY = +Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const contour of this.contours) {
            const m = contour.length;

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

        const bounds = this.bounds;

        if (minX < maxX && minY < maxY) {
            bounds.x = minX;
            bounds.y = minY;
            bounds.width = maxX - minX;
            bounds.height = maxY - minY;
        } else {
            bounds.x = bounds.y = bounds.width = bounds.height = 0;
        }
    }

    /**
     * Tests if the point is contained in the geometry.
     * @param {{x: number, y: number}} point - The point.
     * @returns {boolean} True if and only if the point is contained.
     */
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

    /**
     * Creates a mesh from this geometry.
     * @param {SmoothShader} [shader] - The shader.
     * @param {PIXI.State} [state] - The state.
     * @returns {SmoothMesh} The mesh.
     */
    createMesh(shader, state) {
        return new SmoothMesh(this, shader, state);
    }

    /**
     * Increase the reference count.
     * @returns {this}
     */
    retain() {
        this.refCount++;

        return this;
    }

    /**
     * Decrease the reference count and dispose the geometry if zero.
     * @returns {this}
     */
    release() {
        if (this.refCount > 0) {
            this.refCount--;

            if (this.refCount === 0) {
                this.dispose();
            }
        }

        return this;
    }

    /** @override */
    destroy(options) {
        super.destroy(options);

        this.contours = null;
        this.bounds = null;
    }
}

const vertexSrc = `\
attribute vec2 aVertexPosition;
attribute lowp float aDepthValue;

uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform mat3 uTextureMatrix;

varying vec2 vTextureCoord;
varying float vDepthValue;

void main() {
    vTextureCoord = (uTextureMatrix * vec3(aVertexPosition, 1.0)).xy;
    vDepthValue = aDepthValue;
    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, aDepthValue * 2.0 - 1.0, 1.0);
}`;

const fragmentSrc = `\
varying vec2 vTextureCoord;
varying float vDepthValue;

uniform sampler2D uSampler;
uniform vec4 uColor;

void main() {
    gl_FragColor = texture2D(uSampler, vTextureCoord) * uColor * smoothstep(0.0, 1.0, vDepthValue);
}`;

/**
 * The shader for {@link SmoothMesh}.
 */
export class SmoothShader extends PIXI.Shader {
    /**
     * Default vertex shader source.
     * @type {string}
     * @readonly
     */
    static defaultVertexSrc = vertexSrc;

    /**
     * Default fragment shader source.
     * @type {string}
     * @readonly
     */
    static defaultFragmentSrc = fragmentSrc;

    /**
     * The texture matrix.
     * @type {PIXI.TextureMatrix}
     * @readonly
     */
    uvMatrix;

    /**
     * The tint.
     * @param {number}
     * @protected
     */
    _tint = 0xFFFFFF;

    /**
     * Is the tint dirty?
     * @param {boolean}
     * @protected
     */
    _tintDirty = true;

    /**
     * The alpha.
     * @param {number}
     * @protected
     */
    _worldAlpha = 1;

    /**
     * @param {PIXI.Texture} [texture=PIXI.Texture.WHITE] - The texture.
     * @param {object} [options]
     * @param {number} [options.tint=0xFFFFFF] - The tint.
     * @param {PIXI.Program} [options.program] - The program.
     * @param {object} [options.uniforms] - The uniforms.
     */
    constructor(texture, options) {
        const uniforms = {
            uSampler: texture ?? PIXI.Texture.WHITE,
            uTextureMatrix: PIXI.Matrix.IDENTITY,
            uColor: new Float32Array([1, 1, 1, 1])
        };

        options = { tint: 0xFFFFFF, ...options };

        if (options.uniforms) {
            Object.assign(uniforms, options.uniforms);
        }

        super(options.program ?? PIXI.Program.from(vertexSrc, fragmentSrc), uniforms);

        this.uvMatrix = new PIXI.TextureMatrix(texture);
        this.tint = options.tint;
    }

    /**
     * The texture.
     * @type {PIXI.Texture}
     */
    get texture() {
        return this.uniforms.uSampler;
    }

    set texture(value) {
        if (this.uniforms.uSampler !== value) {
            if (!this.uniforms.uSampler.baseTexture.alphaMode !== !value.baseTexture.alphaMode) {
                this._colorDirty = true;
            }

            this.uniforms.uSampler = value;
            this.uvMatrix.texture = value;
        }
    }

    /**
     * The tint.
     * @type {number}
     */
    get tint() {
        return this._tint;
    }

    set tint(value) {
        if (value !== this._tint) {
            this._tint = value;
            this._tintDirty = true;
        }
    }

    /**
     * Called by {@link SmoothMesh} before rendering.
     * @param {SmoothMesh} mesh - The mesh.
     * @param {PIXI.Renderer} renderer - The renderer.
     */
    update(mesh, renderer) {
        if (this._tintDirty || this._worldAlpha !== mesh.worldAlpha) {
            this._tintDirty = false;
            this._worldAlpha = mesh.worldAlpha;

            PIXI.utils.premultiplyTintToRgba(
                this._tint,
                this._worldAlpha,
                this.uniforms.uColor,
                this.texture.baseTexture.alphaMode
            );
        }

        if (this.uvMatrix.update()) {
            this.uniforms.uTextureMatrix = this.uvMatrix.mapCoord;
        }
    }
}
