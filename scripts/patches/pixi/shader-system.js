import { Logger } from "../../utils/logger.js";

let GL_TABLE = null;

const GL_TO_GLSL_TYPES = {
    FLOAT: 'float',
    FLOAT_VEC2: 'vec2',
    FLOAT_VEC3: 'vec3',
    FLOAT_VEC4: 'vec4',

    INT: 'int',
    INT_VEC2: 'ivec2',
    INT_VEC3: 'ivec3',
    INT_VEC4: 'ivec4',

    UNSIGNED_INT: 'uint',
    UNSIGNED_INT_VEC2: 'uvec2',
    UNSIGNED_INT_VEC3: 'uvec3',
    UNSIGNED_INT_VEC4: 'uvec4',

    BOOL: 'bool',
    BOOL_VEC2: 'bvec2',
    BOOL_VEC3: 'bvec3',
    BOOL_VEC4: 'bvec4',

    FLOAT_MAT2: 'mat2',
    FLOAT_MAT3: 'mat3',
    FLOAT_MAT4: 'mat4',

    SAMPLER_2D: 'sampler2D',
    INT_SAMPLER_2D: 'sampler2D',
    UNSIGNED_INT_SAMPLER_2D: 'sampler2D',
    SAMPLER_CUBE: 'samplerCube',
    INT_SAMPLER_CUBE: 'samplerCube',
    UNSIGNED_INT_SAMPLER_CUBE: 'samplerCube',
    SAMPLER_2D_ARRAY: 'sampler2DArray',
    INT_SAMPLER_2D_ARRAY: 'sampler2DArray',
    UNSIGNED_INT_SAMPLER_2D_ARRAY: 'sampler2DArray',
};

function mapType(gl, type) {
    if (!GL_TABLE) {
        const typeNames = Object.keys(GL_TO_GLSL_TYPES);

        GL_TABLE = {};

        for (let i = 0; i < typeNames.length; ++i) {
            const tn = typeNames[i];

            GL_TABLE[gl[tn]] = GL_TO_GLSL_TYPES[tn];
        }
    }

    return GL_TABLE[type];
}

const GLSL_TO_SIZE = {
    float: 1,
    vec2: 2,
    vec3: 3,
    vec4: 4,

    int: 1,
    ivec2: 2,
    ivec3: 3,
    ivec4: 4,

    uint: 1,
    uvec2: 2,
    uvec3: 3,
    uvec4: 4,

    bool: 1,
    bvec2: 2,
    bvec3: 3,
    bvec4: 4,

    mat2: 4,
    mat3: 9,
    mat4: 16,

    sampler2D: 1,
};

function mapSize(type) {
    return GLSL_TO_SIZE[type];
}

function booleanArray(size) {
    const array = new Array(size);

    for (let i = 0; i < array.length; i++) {
        array[i] = false;
    }

    return array;
}

function defaultValue(type, size) {
    switch (type) {
        case 'float':
            return 0;

        case 'vec2':
            return new Float32Array(2 * size);

        case 'vec3':
            return new Float32Array(3 * size);

        case 'vec4':
            return new Float32Array(4 * size);

        case 'int':
        case 'uint':
        case 'sampler2D':
        case 'sampler2DArray':
            return 0;

        case 'ivec2':
            return new Int32Array(2 * size);

        case 'ivec3':
            return new Int32Array(3 * size);

        case 'ivec4':
            return new Int32Array(4 * size);

        case 'uvec2':
            return new Uint32Array(2 * size);

        case 'uvec3':
            return new Uint32Array(3 * size);

        case 'uvec4':
            return new Uint32Array(4 * size);

        case 'bool':
            return false;

        case 'bvec2':

            return booleanArray(2 * size);

        case 'bvec3':
            return booleanArray(3 * size);

        case 'bvec4':
            return booleanArray(4 * size);

        case 'mat2':
            return new Float32Array([1, 0,
                0, 1]);

        case 'mat3':
            return new Float32Array([1, 0, 0,
                0, 1, 0,
                0, 0, 1]);

        case 'mat4':
            return new Float32Array([1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1]);
    }

    return null;
}

function compileShader(gl, type, src) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    return shader;
}

function getAttributeData(program, gl) {
    const attributes = {};
    const totalAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

    for (let i = 0; i < totalAttributes; i++) {
        const attribData = gl.getActiveAttrib(program, i);

        if (attribData.name.indexOf('gl_') === 0) {
            continue;
        }

        const type = mapType(gl, attribData.type);
        const data = {
            type,
            name: attribData.name,
            size: mapSize(type),
            location: gl.getAttribLocation(program, attribData.name),
        };

        attributes[attribData.name] = data;
    }

    return attributes;
}

function getUniformData(program, gl) {
    const uniforms = {};
    const totalUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

    for (let i = 0; i < totalUniforms; i++) {
        const uniformData = gl.getActiveUniform(program, i);
        const name = uniformData.name.replace(/\[.*?\]$/, '');

        const isArray = !!(uniformData.name.match(/\[.*?\]$/));

        const type = mapType(gl, uniformData.type);

        uniforms[name] = {
            name,
            index: i,
            type,
            size: uniformData.size,
            isArray,
            value: defaultValue(type, uniformData.size),
        };
    }

    return uniforms;
}

function logPrettyShaderError(gl, shader) {
    const shaderSrc = gl.getShaderSource(shader)
        .split('\n')
        .map((line, index) => `${index}: ${line}`);

    const shaderLog = gl.getShaderInfoLog(shader);
    const splitShader = shaderLog.split('\n');

    const dedupe = {};

    const lineNumbers = splitShader.map((line) => parseFloat(line.replace(/^ERROR\: 0\:([\d]+)\:.*$/, '$1')))
        .filter((n) => {
            if (n && !dedupe[n]) {
                dedupe[n] = true;

                return true;
            }

            return false;
        });

    const logArgs = [''];

    lineNumbers.forEach((number) => {
        shaderSrc[number - 1] = `%c${shaderSrc[number - 1]}%c`;
        logArgs.push('background: #FF0000; color:#FFFFFF; font-size: 10px', 'font-size: 10px');
    });

    const fragmentSourceToLog = shaderSrc.join('\n');

    logArgs[0] = fragmentSourceToLog;

    console.error(shaderLog);

    console.groupCollapsed('click to view full shader code');
    console.warn(...logArgs);
    console.groupEnd();
}

function logProgramError(gl, program, vertexShader, fragmentShader) {
    // if linking fails, then log and cleanup
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            logPrettyShaderError(gl, vertexShader);
        }

        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            logPrettyShaderError(gl, fragmentShader);
        }

        console.error('PixiJS Error: Could not initialize shader.');

        // if there is a program info log, log it
        if (gl.getProgramInfoLog(program) !== '') {
            console.warn('PixiJS Warning: gl.getProgramInfoLog()', gl.getProgramInfoLog(program));
        }
    }
}

function generateProgram(gl, program) {
    const glVertShader = compileShader(gl, gl.VERTEX_SHADER, program.vertexSrc);
    const glFragShader = compileShader(gl, gl.FRAGMENT_SHADER, program.fragmentSrc);

    const webGLProgram = gl.createProgram();

    gl.attachShader(webGLProgram, glVertShader);
    gl.attachShader(webGLProgram, glFragShader);

    gl.linkProgram(webGLProgram);

    if (!gl.getProgramParameter(webGLProgram, gl.LINK_STATUS)) {
        logProgramError(gl, webGLProgram, glVertShader, glFragShader);
    }

    program.attributeData = getAttributeData(webGLProgram, gl);
    program.uniformData = getUniformData(webGLProgram, gl);

    // GLSL 1.00: bind attributes sorted by name in ascending order
    // GLSL 3.00: don't change the attribute locations that where chosen by the compiler
    //            or assigned by the layout specifier in the shader source code
    if (!(/^[ \t]*#[ \t]*version[ \t]+300[ \t]+es[ \t]*$/m).test(program.vertexSrc)) {
        const keys = Object.keys(program.attributeData);

        keys.sort((a, b) => (a > b) ? 1 : -1); // eslint-disable-line no-confusing-arrow

        for (let i = 0; i < keys.length; i++) {
            program.attributeData[keys[i]].location = i;

            gl.bindAttribLocation(webGLProgram, i, keys[i]);
        }

        gl.linkProgram(webGLProgram);
    }

    gl.deleteShader(glVertShader);
    gl.deleteShader(glFragShader);

    const uniformData = {};

    for (const i in program.uniformData) {
        const data = program.uniformData[i];

        uniformData[i] = {
            location: gl.getUniformLocation(webGLProgram, i),
            value: defaultValue(data.type, data.size),
        };
    }

    const glProgram = new PIXI.GLProgram(webGLProgram, uniformData);

    return glProgram;
}

Logger.debug("PIXI.ShaderSystem.prototype.generateProgram (OVERRIDE)");

PIXI.ShaderSystem.prototype.generateProgram = function (shader) {
    const gl = this.gl;
    const program = shader.program;

    const glProgram = generateProgram(gl, program);

    program.glPrograms[this.renderer.CONTEXT_UID] = glProgram;

    return glProgram;
};
