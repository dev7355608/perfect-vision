import "./utils/extract.js";

PIXI.GeometrySystem.prototype.checkCompatibility = function (geometry, program) { };

const GLSLOptimizer = typeof WebAssembly === "object" ? await createGLSLOptimizerWasm() : undefined;

/**
 * Optimize the shader source.
 * @param {string} shaderSource - The shader source.
 * @param {boolean} [isVertexShader=false] - Is vertex shader?
 * @returns {string} The optimized shader source.
 */
function optimizeGLSL(shaderSource, isVertexShader = false) {
    let isVersion300es = false;

    shaderSource = shaderSource.trim();

    if (shaderSource.startsWith("#version")) {
        isVersion300es = /^#version[ \t]+300[ \t]+es\b/.test(shaderSource);
        shaderSource = shaderSource.split("\n").slice(1).join("\n");
    }

    if (!isVersion300es) {
        shaderSource = (isVertexShader ? `\
            #define attribute in
            #define varying out
            ` : `\
            #define varying in
            #define texture2D texture
            #define textureCube texture
            #define texture2DProj textureProj
            #define texture2DLodEXT textureLod
            #define texture2DProjLodEXT textureProjLod
            #define textureCubeLodEXT textureLod
            #define texture2DGradEXT textureGrad
            #define texture2DProjGradEXT textureProjGrad
            #define textureCubeGradEXT textureGrad
            #define gl_FragDepthEXT gl_FragDepth
            #define gl_FragColor fragColor_6g5Z9h6S
            layout(location = 0) out highp vec4 fragColor_6g5Z9h6S;
            `) + "\n\n" + shaderSource.replace(
            /\b(layout|centroid|smooth|case|mat2x2|mat2x3|mat2x4|mat3x2|mat3x3|mat3x4|mat4x2|mat4x3|mat4x4|uvec2|uvec3|uvec4|samplerCubeShadow|sampler2DArray|sampler2DArrayShadow|isampler2D|isampler3D|isamplerCube|isampler2DArray|usampler2D|usampler3D|usamplerCube|usampler2DArray|coherent|restrict|readonly|writeonly|resource|atomic_uint|noperspective|patch|sample|subroutine|common|partition|active|filter|image1D|image2D|image3D|imageCube|iimage1D|iimage2D|iimage3D|iimageCube|uimage1D|uimage2D|uimage3D|uimageCube|image1DArray|image2DArray|iimage1DArray|iimage2DArray|uimage1DArray|uimage2DArray|image1DShadow|image2DShadow|image1DArrayShadow|image2DArrayShadow|imageBuffer|iimageBuffer|uimageBuffer|sampler1DArray|sampler1DArrayShadow|isampler1D|isampler1DArray|usampler1D|usampler1DArray|isampler2DRect|usampler2DRect|samplerBuffer|isamplerBuffer|usamplerBuffer|sampler2DMS|isampler2DMS|usampler2DMS|sampler2DMSArray|isampler2DMSArray|usampler2DMSArray)\b/g,
            `$&_9j7Y8o6M`
        );
    }

    shaderSource = `#version 300 es\nprecision ${isVertexShader
        ? PIXI.settings.PRECISION_VERTEX
        : PIXI.settings.PRECISION_FRAGMENT} float;\n${shaderSource}`;
    shaderSource = GLSLOptimizer.optimize(shaderSource, isVertexShader, true);

    return shaderSource;
}

/**
 * Process the shader source. If the preprocessor variable `OPTIMIZE_GLSL`
 * is defined in the source, run the GLSL optimizer.
 * @param {PIXI.Program} program - The shader program.
 * @param {string} shaderSource - The shader source.
 * @param {boolean} isVertexShader - Is vertex shader?
 * @returns {string} The (optimized) shader source.
 */
function processShaderSource(program, shaderSource, isVertexShader) {
    const optimize = program._optimizeGLSL || (/^[ \t]*#[ \t]*define[ \t]+OPTIMIZE_GLSL*$/m).test(shaderSource);

    if (optimize && !program._optimizeGLSL) {
        if (program._vertexSrc) {
            program._vertexSrc = optimizeGLSL(program._vertexSrc, true);
        }
        if (program._fragmentSrc) {
            program._fragmentSrc = optimizeGLSL(program._fragmentSrc, false);
        }

        program._optimizeGLSL = optimize;
    }

    if (optimize) {
        shaderSource = optimizeGLSL(
            shaderSource,
            isVertexShader,
            false
        );
    }

    return shaderSource;
}

Object.defineProperties(
    PIXI.Program.prototype,
    {
        vertexSrc: {
            get() { return this._vertexSrc; },
            set(value) { this._vertexSrc = processShaderSource(this, value, true); }
        },
        fragmentSrc: {
            get() { return this._fragmentSrc; },
            set(value) { this._fragmentSrc = processShaderSource(this, value, false); }
        }
    }
);

PIXI.Container.prototype._renderWithCulling = function (renderer) {
    const sourceFrame = renderer.renderTexture.sourceFrame;

    if (!(sourceFrame.width > 0 && sourceFrame.height > 0)) {
        return;
    }

    let bounds;
    let transform;

    if (this.cullArea) {
        bounds = this.cullArea;
        transform = this.worldTransform;
    } else if (this._render !== PIXI.Container.prototype._render) {
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

    for (let i = 0, j = this.children.length; i < j; ++i) {
        const child = this.children[i];
        const childCullable = child.cullable;

        child.cullable = childCullable || !this.cullArea;
        child.render(renderer);
        child.cullable = childCullable;
    }
};
