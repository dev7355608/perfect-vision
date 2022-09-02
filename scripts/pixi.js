PIXI.GeometrySystem.prototype.checkCompatibility = function (geometry, program) { };

const GLSLOptimizer = typeof WebAssembly === "object" ? await createGLSLOptimizerWasm() : undefined;

/**
 * Optimize the shader source.
 * @param {string} shaderSource - The shader source.
 * @param {boolean} [isVertexShader=false] - Is vertex shader?
 * @param {boolean} [isVersion300es=false] - Is OpenGL 3.00 ES?
 * @returns {string} The optimized shader source.
 */
function optimizeGLSL(shaderSource, isVertexShader = false, isVersion300es = false) {
    return GLSLOptimizer.optimize(shaderSource, isVertexShader, isVersion300es);
}

/**
 * Process the shader source. If the preprocessor variable `OPTIMIZE_GLSL`
 * is defined in the source, run the GLSL optimizer.
 * @param {string} shaderSource - The shader source.
 * @param {boolean} [isVertexShader=false] - Is vertex shader?
 * @returns {string} The (optimized) shader source.
 */
function processShaderSource(shaderSource, isVertexShader) {
    if ((/^[ \t]*#[ \t]*define[ \t]+OPTIMIZE_GLSL*$/m).test(shaderSource)) {
        const precision = isVertexShader
            ? PIXI.settings.PRECISION_VERTEX
            : PIXI.settings.PRECISION_FRAGMENT;

        shaderSource = shaderSource.trim();
        shaderSource = optimizeGLSL(
            !shaderSource.startsWith("#version")
                ? `precision ${precision} float;\n${shaderSource}`
                : shaderSource.replace(/^(.*)$/m, `$1\nprecision ${precision} float;\n`),
            isVertexShader,
            /^#version[ \t]+300[ \t]+es\b/.test(shaderSource)
        );
    }

    return shaderSource;
}

Object.defineProperties(
    PIXI.Program.prototype,
    {
        vertexSrc: {
            get() { return this._vertexSrc; },
            set(value) { this._vertexSrc = processShaderSource(value, true); }
        },
        fragmentSrc: {
            get() { return this._fragmentSrc; },
            set(value) { this._fragmentSrc = processShaderSource(value, false); }
        }
    }
);
