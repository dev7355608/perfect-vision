import { StencilShader } from "./point-source-shader.js";
import { SmoothGeometry, SmoothMesh } from "../utils/smooth-mesh.js";
import { Console } from "../utils/console.js";

Hooks.once("libWrapper.Ready", () => {
    libWrapper.register(
        "perfect-vision",
        "PointSource.prototype._updateLosGeometry",
        /**
         * Create or update the source geometry.
         * @param {PIXI.Polygon} polygon - The polygon.
         * @protected
         */
        function _updateLosGeometry(polygon) {
            // TODO: find a way to a handle weakly-simple polygons with "zero-one" fill rule
            const softEdges = this._flags.renderSoftEdges;
            const options = {
                falloffDistance: softEdges ? -PointSource.EDGE_OFFSET : 0,
                fillRule: softEdges ? "even-odd" : "zero-one",
                vertexTransform: new PIXI.Matrix()
                    .translate(-this.x, -this.y)
                    .scale(1 / this.radius, 1 / this.radius)
            };

            if (!this._sourceGeometry || this._sourceGeometry._explored) {
                /** @type {SmoothGeometry} */
                this._sourceGeometry = new SmoothGeometry([polygon], options);
                this._sourceGeometry._explored = false;
            } else {
                this._sourceGeometry.update([polygon], options);
            }

            if (PerfectVision.debug && softEdges && this._sourceGeometry.depthStencil) {
                Console.warn("PointSource (%O) | Failed to compute proper smooth geometry; falling back to depth/stencil technique", this);
            }
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "PointSource.prototype._createMesh",
        /**
         * Create a new mesh for this source using a provided shader class.
         * @param {AdaptiveLightingShader} shaderCls - The subclass of {@link AdaptiveLightingShader} being used for this mesh.
         * @returns {PointSourceMesh}
         * @protected
         */
        function _createMesh(shaderCls) {
            const state = new PIXI.State();
            const mesh = new PointSourceMesh(this._sourceGeometry, shaderCls.create(), state);

            mesh.source = this;

            return mesh;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "PointSource.prototype._updateMesh",
        /**
         * Update the position and scale of the mesh each time it is drawn.
         * @param {PointSourceMesh} mesh - The mesh being updated.
         * @returns {PointSourceMesh} - The updated mesh.
         * @protected
         */
        function _updateMesh(mesh) {
            mesh.geometry = this._sourceGeometry;
            mesh.position.set(0, 0);
            mesh.scale.set(1);
            mesh.visible = mesh.renderable = true;
            mesh.elevation = this.elevation;
            mesh.sort = Infinity;

            return mesh;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "PointSource.prototype.destroy",
        function () {
            this._meshesInit = false;
        },
        libWrapper.OVERRIDE,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );

    libWrapper.register(
        "perfect-vision",
        "VisionSource.prototype.initialize",
        function (wrapped, ...args) {
            wrapped(...args);

            const options = { fillRule: "zero-one" };

            if (!this._sourceLosGeometry || this._sourceLosGeometry._explored) {
                this._sourceLosGeometry = new SmoothGeometry([this.los], options);
                this._sourceLosGeometry._explored = false;
            } else {
                this._sourceLosGeometry.update([this.los], options);
            }

            return this;
        },
        libWrapper.WRAPPER,
        { perf_mode: PerfectVision.debug ? libWrapper.PERF_AUTO : libWrapper.PERF_FAST }
    );
});

/**
 * Create a mesh for rendering to a stencil mask.
 * @returns {PointSourceMesh}
 */
PointSource.prototype._createMask = function () {
    const mesh = this._updateMesh(this._createMesh(StencilShader));

    mesh.zIndex = this.data.z ?? (this.isDarkness ? 10 : 0);

    const shader = mesh.shader;

    shader.texture = this._texture ?? PIXI.Texture.WHITE;
    shader.textureMatrix = this._textureMatrix?.clone() ?? PIXI.Matrix.IDENTITY;

    return mesh;
};

/**
 * Create a mesh for rendering to a stencil mask.
 * @param {boolean} [los=false] - Use LOS instead FOV.
 * @returns {PointSourceMesh}
 */
VisionSource.prototype._createMask = function (los = false) {
    const mesh = PointSource.prototype._createMask.call(this);

    if (los) {
        mesh.geometry = this._sourceLosGeometry;
    }

    return mesh;
};

/**
 * The mesh for {@link PointSource}.
 */
PointSourceMesh = class PointSourceMesh extends SmoothMesh {
    /**
     * Comparator for sorting by z-index.
     * @param {PointSourceMesh} mesh1
     * @param {PointSourceMesh} mesh2
     * @returns {number}
     * @internal
     */
    static _compareByZIndex(mesh1, mesh2) {
        return (mesh1.zIndex || 0) - (mesh2.zIndex || 0)
            || (mesh1._lastSortedIndex || 0) - (mesh2._lastSortedIndex || 0)
            || 0;
    }

    /**
     * Comparator for sorting by elevation and sort.
     * @param {PointSourceMesh} mesh1
     * @param {PointSourceMesh} mesh2
     * @returns {number}
     * @internal
     */
    static _compareByElevation(mesh1, mesh2) {
        return (mesh1.elevation || 0) - (mesh2.elevation || 0)
            || (mesh1.sort || 0) - (mesh2.sort || 0)
            || (mesh1.zIndex || 0) - (mesh2.zIndex || 0)
            || (mesh1._lastSortedIndex || 0) - (mesh2._lastSortedIndex || 0)
            || 0;
    }

    /**
     * Sort array by comparing z-indices.
     * @param {PointSourceMesh[]} meshes
     * @internal
     * @returns {PointSourceMesh[]} The same array.
     */
    static _sortByZIndex(meshes) {
        for (let i = 0, j = meshes.length; i < j; i++) {
            meshes[i]._lastSortedIndex = i;
        }

        return meshes.sort(this._compareByZIndex);
    }

    /**
     * Sort array by comparing elevation and sort.
     * @param {PointSourceMesh[]} meshes
     * @internal
     * @returns {PointSourceMesh[]} The same array.
     */
    static _sortByElevation(meshes) {
        for (let i = 0, j = meshes.length; i < j; i++) {
            meshes[i]._lastSortedIndex = i;
        }

        return meshes.sort(this._compareByElevation);
    }

    /**
     * The blend mode of the last rendered {@link PointSourceMesh}.
     * @type {PIXI.BLEND_MODES}
     * @protected
     */
    static _priorBlendMode;

    /**
     * The current texture used by the mesh.
     * @type {PIXI.Texture}
     * @protected
     */
    static _currentTexture;

    /**
     * The point source.
     * @type {PointSource}
     */
    source;

    /**
     * The elevation.
     * @type {number}
     */
    elevation = 0;

    /**
     * The sort.
     * @type {number}
     */
    sort = 0;

    constructor(...args) {
        super(...args);

        this.cullable = true;
    }

    /**
     * The uniforms of the shader.
     * @type {object}
     * @readonly
     */
    get uniforms() {
        return this.shader.uniforms;
    }

    /** @override */
    _render(renderer) {
        if (this.uniforms.framebufferTexture !== undefined) {
            if (canvas.blur.enabled) {
                const priorBlendMode = PointSourceMesh._priorBlendMode;
                let blendMode = this.state.blendMode;

                if (blendMode === PIXI.BLEND_MODES.NORMAL) {
                    blendMode = PIXI.BLEND_MODES[this.uniforms.darkness ? "MIN_COLOR" : "MAX_COLOR"];
                    PointSourceMesh._priorBlendMode = blendMode !== priorBlendMode && priorBlendMode !== undefined ? -1 : blendMode;
                } else {
                    if (blendMode !== priorBlendMode && priorBlendMode !== undefined) {
                        PointSourceMesh._currentTexture = canvas.snapshot.getFramebufferTexture(renderer);
                    }

                    PointSourceMesh._priorBlendMode = blendMode;
                }
            }

            this.uniforms.framebufferTexture = PointSourceMesh._currentTexture;
        }

        super._render(renderer);
    }
}
