/**
 * GLSL shader patcher.
 */
export class ShaderPatcher {
    /**
     * The seed of the random number generator.
     * @type {number}
     * @readonly
     */
    static #seed = 0;

    /**
     * The shader type.
     * @type {"vert"|"frag"}
     * @readonly
     */
    #type;

    /**
     * The shader source.
     * @type {string}
     */
    #source;

    /**
     * The shader version.
     * @type {"100"|"300 es"|""}
     */
    #version;

    /**
     * The unique sequence.
     * @type {string}
     */
    #unique;

    /**
     * The patcher count.
     * @type {string}
     */
    #counter;

    /**
     * The stashed comments.
     * @type {string[]}
     */
    #comments = [];

    /**
     * The file name and line number that that applies a patch.
     * @type {string[]}
     */
    #caller = null;

    /**
     * The stashed local scopes.
     * @type {string[]}
     */
    #scopes = null;

    /**
     * @param {"vert"|"frag"} type - The shader type.
     */
    constructor(type) {
        console.assert(type === "vert" || type === "frag");

        this.#type = type;
    }

    /**
     * @param {boolean} [stashLocalScopes=false] 
     * @returns {this}
     */
    #preprocess(stashLocalScopes = false) {
        if (this.#caller === null) {
            const error = new Error();
            let caller;

            if (typeof error.stacktrace !== "undefined" || typeof error["opera#sourceloc"] !== "undefined") { // Opera
                caller = error.stack.split("\n")
                    .filter(line => line.match(/(^|@)\S+:\d+/) && !line.match(/^Error created at/))[2]
                    ?.split("@").pop();
            } else if (error.stack && error.stack.match(/^\s*at .*(\S+:\d+|\(native\))/m)) { // V8/IE
                caller = error.stack.split("\n")
                    .filter(line => line.match(/^\s*at .*(\S+:\d+|\(native\))/m))[2]
                    ?.match(/ \((.+:\d+:\d+)\)$/)?.[1];
            } else if (error.stack) { // FF/Safari
                caller = error.stack.split("\n").filter(line => !line.match(/^(eval@)?(\[native code])?$/))[2];
                caller = !caller || caller.indexOf("@") === -1 && caller.indexOf(":") === -1
                    ? caller : caller.replace(/(.*".+"[^@]*)?[^@]*@/, "");
            }

            this.#caller = caller || "unkown";
        }

        if (stashLocalScopes) {
            this.#scopes = [];

            let index = 0;

            outer: while (index !== this.#source.length) {
                while (this.#source[index++] !== "{") {
                    if (index === this.#source.length) {
                        break outer;
                    }
                }

                const start = index;
                let level = 1;

                do {
                    switch (this.#source[index++]) {
                        case "{":
                            level++;
                            break;
                        case "}":
                            level--;
                            break;
                    }
                } while (level !== 0);

                this.#scopes.push(this.#source.slice(start, index - 1));
                this.#source = this.#source.slice(0, start)
                    + ` scope_${this.#unique}_s${this.#scopes.length - 1} `
                    + this.#source.slice(index - 1);

                index = start + 1;
            }
        }

        return this;
    }

    /**
     * @returns {this}
     */
    #postprocess() {
        this.#source = this.#source
            .replace(/(?:\/\*[\s\S]*?\*\/)|(?:\/\/.*)/gm, comment => {
                this.#comments.push(comment);
                return ` comment_${this.#unique}_c${this.#comments.length - 1} `;
            })
            .replace(/@@(\w+)/g, `$1_${this.#unique}_p${this.#counter}`)
            .replace(/@(\w+)/g, `$1_${this.#unique}_i`);
        this.#caller = null;

        if (this.#scopes) {
            this.#source = this.#source
                .replace(new RegExp(` scope_${this.#unique}_s(\\d+) `, "g"), (_, i) => this.#scopes[parseInt(i, 10)]);
            this.#scopes = null;
        }

        return this;
    }

    /**
     * Set the shader source.
     * @param {string} source - The shader source.
     * @returns {this}
     */
    setSource(source) {
        console.assert(typeof source === "string");

        if (this.#source !== undefined) {
            throw new Error("Source was set already!");
        }

        this.#source = source.trim();
        this.#version = "";

        if (this.#source.startsWith("#version")) {
            this.#version = this.#source.match(/#version\s+(.+)/)[1].trim().replace(/\s+/g, " ");
            this.#source = this.#source.split("\n").slice(1).join("\n").trim();
        }

        const [, unique, counter] = this.#source.match(/\/\/ ShaderPatcher-((?:[0-9][a-zA-Z]){4,})-(\d+)\n/) ?? [];

        this.#unique = unique;
        this.#counter = counter;

        if (!this.#unique) {
            function mulberry32(a) {
                return function () {
                    let t = a = a + 0x6D2B79F5 | 0;

                    t = Math.imul(t ^ t >>> 15, t | 1);
                    t ^= t + Math.imul(t ^ t >>> 7, t | 61);

                    return ((t ^ t >>> 14) >>> 0) / 4294967296;
                }
            }

            const random = mulberry32(ShaderPatcher.#seed);

            do {
                this.#unique = String.fromCharCode(49 + Math.floor(random() * 9)) + String.fromCharCode(103 + Math.floor(random() * 20));

                for (let i = 2; i < 8; i++) {
                    if (i % 2) {
                        this.#unique += String.fromCharCode(((i - 1) % 4 ? 65 : 97) + Math.floor(random() * 26));
                    } else {
                        this.#unique += String.fromCharCode(48 + Math.floor(random() * 10));
                    }
                }
            } while (this.#source.includes(this.#unique));

            this.#counter = 0;
        } else {
            this.#counter = parseInt(this.#counter, 10);
            this.#source = this.#source.replace(/\/\/ ShaderPatcher-((?:[0-9][a-zA-Z]){4,})-(\d+)\n/g, "");
        }

        this.#postprocess();

        if (this.#counter === 0) {
            this.#preprocess(true);
            this.#source = this.#source.replace(
                /\b(?:(?:const|attribute|uniform|varying|in)\s+)?(?:(?:lowp|mediump|highp)\s+)?(?:\w+)\s+(\w+)\s*(?:=[^;]+?)?;/gm,
                `\n/* Patched by ${this.#caller} */\n#ifndef $1_${this.#unique}_d\n#define $1_${this.#unique}_d\n$&\n#endif\n`
            );
            this.#postprocess();
        }

        return this;
    }

    /**
     * Get the patched shader source.
     * @param {object} [options]
     * @param {"100"|"300 es"} [options.version]
     * @param {"lowp"|"mediump"|"highp"} [options.precision]
     * @returns {this}
     */
    getSource({ version, precision } = {}) {
        console.assert(version === undefined || version === "100" || version === "300 es");
        console.assert(precision === undefined || precision === "lowp" || precision === "mediump" || precision === "highp");

        if (version === "100" && this.#version === "300 es") {
            throw new Error("Shader cannot be converted from version 300 es to 100!");
        }

        if (this.#source === undefined) {
            throw new Error("Source has not been set yet!");
        }

        let source = this.#source;

        if (version === "300 es" && this.#version !== "300 es") {
            source = (this.#type === "vert" ? `\
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
#define gl_FragColor fragColor_${this.#unique}_o
layout(location = 0) out highp vec4 fragColor_${this.#unique}_o;
`) + "\n\n" + source.replace(
                /\b(layout|centroid|smooth|case|mat2x2|mat2x3|mat2x4|mat3x2|mat3x3|mat3x4|mat4x2|mat4x3|mat4x4|uvec2|uvec3|uvec4|samplerCubeShadow|sampler2DArray|sampler2DArrayShadow|isampler2D|isampler3D|isamplerCube|isampler2DArray|usampler2D|usampler3D|usamplerCube|usampler2DArray|coherent|restrict|readonly|writeonly|resource|atomic_uint|noperspective|patch|sample|subroutine|common|partition|active|filter|image1D|image2D|image3D|imageCube|iimage1D|iimage2D|iimage3D|iimageCube|uimage1D|uimage2D|uimage3D|uimageCube|image1DArray|image2DArray|iimage1DArray|iimage2DArray|uimage1DArray|uimage2DArray|image1DShadow|image2DShadow|image1DArrayShadow|image2DArrayShadow|imageBuffer|iimageBuffer|uimageBuffer|sampler1DArray|sampler1DArrayShadow|isampler1D|isampler1DArray|usampler1D|usampler1DArray|isampler2DRect|usampler2DRect|samplerBuffer|isamplerBuffer|usamplerBuffer|sampler2DMS|isampler2DMS|usampler2DMS|sampler2DMSArray|isampler2DMSArray|usampler2DMSArray)\b/g,
                `$&_${this.#unique}_r`
            );
        }

        version ??= this.#version;
        precision ??= this.#type === "vert" ? "highp" : "mediump";

        return (version ? `#version ${version}\n\n` : "")
            + `precision ${precision} float;\n\n`
            + `// ShaderPatcher-${this.#unique}-${this.#counter + 1}\n\n`
            + source
                .replace(/\bprecision\s+(?:lowp|mediump|highp)\s+float\s*;/gm, "")
                .replace(new RegExp(`\\b(\\w+)_${this.#unique}_i`, "g"), `\n#undef $1\n$1\n#define $1 $1_${this.#unique}_v\n`)
                .replace(new RegExp(` comment_${this.#unique}_c(\\d+) `, "g"), (_, i) => this.#comments[parseInt(i, 10)])
                .trim();
    }

    /**
     * Search and replace the pattern.
     * @param {Regex} searchPattern - The search pattern.
     * @param {string} replaceValue - The replacement string.
     * @param {boolean} [requireMatch=true] - Require a match?
     * @param {boolean} [noLocalScope=false] - Only search inside the global scope.
     * @returns {this}
     * @throws Throws an error if the pattern isn't found and a match is required.
     */
    replace(searchPattern, replaceValue, requireMatch = true, noLocalScope = false) {
        if (this.#source === undefined) {
            throw new Error("Source has not been set yet!");
        }

        if (requireMatch && !this.#source.match(searchPattern)) {
            throw new Error("No match was found!");
        }

        this.#preprocess(noLocalScope);
        this.#source = this.#source.replace(
            searchPattern,
            typeof replaceValue === "string"
                ? `${replaceValue} /* Patched by ${this.#caller} */`
                : (...args) => `${replaceValue(...args)} /* Patched by ${this.#caller} */`
        );

        return this.#postprocess();
    }

    /**
     * Require that the variable exists
     * @param {string} variableName - The name of the variable.
     * @returns {this}
     * @throws Throws an error if variable doesn't exist.
     */
    requireVariable(variableName) {
        if (this.#source === undefined) {
            throw new Error("Source has not been set yet!");
        }

        const regex = new RegExp(`\\b(?:const|attribute|uniform|varying|in)(?:\\s+(lowp|mediump|highp))?\\s+(\\w+)\\s+(${variableName})\\s*;`, "gm");

        if (!this.#source.match(regex)) {
            throw new Error(`Variable '${variableName}' was not found!`);
        }

        return this;
    }

    /**
     * Override the variable.
     * @param {string} variableName - The name of the variable.
     * @param {string} [constantValue] - The constant to replace the variable by.
     * @param {boolean} [requireMatch=true] - Require a match?
     * @returns {this}
     * @throws Throws an error if the variable doesn't exist and a match is required.
     */
    overrideVariable(variableName, constantValue, requireMatch = true) {
        if (this.#source === undefined) {
            throw new Error("Source has not been set yet!");
        }

        if (this.#source.match(new RegExp(`#define ${variableName} ${variableName}_${this.#unique}_v\\b`))) {
            if (constantValue) {
                throw new Error(`Variable '${variableName}' was already replaced by a constant!`);
            }

            return this;
        }

        const regex = new RegExp(`\\b(?:const|attribute|uniform|varying|in)(?:\\s+(lowp|mediump|highp))?\\s+(\\w+)\\s+(${variableName})\\s*;`, "gm");

        if (requireMatch && !this.#source.match(regex)) {
            throw new Error(`Variable '${variableName}' was not found!`);
        }

        this.#preprocess(true);
        this.#source = this.#source.replace(
            regex,
            `\n/* Patched by ${this.#caller} */\n$&\n`
            + (constantValue
                ? `const $1 $2 $3_${this.#unique}_v = ${constantValue};\n`
                : `$1 $2 $3_${this.#unique}_v;\n`)
            + `#define $3 $3_${this.#unique}_v\n`
        );

        return this.#postprocess();
    }

    /**
     * Override the function.
     * @param {string} functionName - The name of the function.
     * @param {string} functionBody - The new function body.
     * @param {boolean} [requireMatch=true] - Require a match?
     * @returns {this}
     * @throws Throws an error if the variable doesn't exist and a match is required.
     */
    overrideFunction(functionName, functionBody, requireMatch = true) {
        if (this.#source === undefined) {
            throw new Error("Source has not been set yet!");
        }

        let index = this.#source.search(new RegExp(`\\b(?:\\w+\\s+)+${functionName}\\s*\\([^)]*?\\)\\s*{`, "gm"));

        if (index < 0) {
            if (requireMatch) {
                throw new Error(`Function '${functionName}' was not found!`);
            }

            return this;
        }

        while (this.#source[index++] !== "{");

        const start = index;
        let level = 1;

        do {
            switch (this.#source[index++]) {
                case "{":
                    level++;
                    break;
                case "}":
                    level--;
                    break;
            }
        } while (level !== 0);

        this.#preprocess();
        this.#source = this.#source.slice(0, start)
            + `\n/* Patched by ${this.#caller} */\n/* ${this.#source.slice(start, index - 1)} */\n${functionBody}\n`
            + this.#source.slice(index - 1);

        return this.#postprocess();
    }

    /**
     * Prepend a code block.
     * @param {string} code - The code block.
     * @returns {this}
     */
    prependBlock(code) {
        this.#preprocess(true);
        this.#source = `\n\n/* Patched by ${this.#caller} */\n` + code.trim() + `\n\n` + this.#source;

        return this.#postprocess();
    }

    /**
     * Prepend a code block.
     * @param {string} code - The code block.
     * @returns {this}
     */
    appendBlock(code) {
        this.#preprocess(true);
        this.#source += `\n\n/* Patched by ${this.#caller} */\n` + code.trim() + `\n\n`;

        return this.#postprocess();
    }

    /**
     * Add the variable.
     * @param {string} name - The name of the variable.
     * @param {string} type - The type of the variable.
     * @param {string} [value] - The value of the variable.
     * @returns {this}
     */
    #addVariable(name, type, value) {
        let array = [];

        if (type.includes("[")) {
            [type, ...array] = type.split(/(?=\[)/g);
        }

        return this.#preprocess().prependBlock(`#ifndef ${name}_${this.#unique}_d\n#define ${name}_${this.#unique}_d\n${type} ${name}${array.join("")}${value !== undefined ? ` = ${value}` : ""};\n#endif\n`);
    }

    /**
     * Add the global variable.
     * @param {string} name - The name of the global variable.
     * @param {string} type - The type of the global variable.
     * @param {string} [value] - The value of the global variable.
     * @returns {this}
     */
    addGlobal(name, type, value) {
        return this.#preprocess().#addVariable(name, type, value);
    }

    /**
     * Add the constant.
     * @param {string} name - The name of the constant.
     * @param {string} type - The type of the constant.
     * @param {string} [value] - The value of the constant.
     * @returns {this}
     */
    addConst(name, type, value) {
        return this.#preprocess().#addVariable(name, `const ${type}`, value);
    }

    /**
     * Add the attribute.
     * @param {string} name - The name of the attribute.
     * @param {string} type - The type of the attribute.
     * @returns {this}
     */
    addAttribute(name, type) {
        return this.#preprocess().#addVariable(name, `attribute ${type}`);
    }

    /**
     * Add the varying.
     * @param {string} name - The name of the varying.
     * @param {string} type - The type of the varying.
     * @returns {this}
     */
    addVarying(name, type) {
        return this.#preprocess().#addVariable(name, `varying ${type}`);
    }

    /**
     * Add the uniform.
     * @param {string} name - The name of the uniform.
     * @param {string} type - The type of the uniform.
     * @returns {this}
     */
    addUniform(name, type) {
        return this.#preprocess().#addVariable(name, `uniform ${type}`);
    }

    /**
     * Add the function.
     * @param {string} name - The name of the function.
     * @param {string} type - The type of the function.
     * @param {string} body - The body of the function.
     * @returns {this}
     */
    addFunction(name, type, body) {
        const [returnType, params] = type.split(/(?=\()/g);

        this.#preprocess().prependBlock(`#ifndef ${name}_${this.#unique}_d\n#define ${name}_${this.#unique}_d\n${returnType} ${name}${params};\n#endif\n`);
        this.#preprocess().appendBlock(`#ifndef ${name}_${this.#unique}_f\n#define ${name}_${this.#unique}_f\n${returnType} ${name}${params} {\n${body}\n}\n#endif\n`)

        return this;
    }

    /**
     * Wrap the main function.
     * @param {string} code - The body of the new main function.
     * @returns {this}
     */
    wrapMain(code) {
        if (this.#source === undefined) {
            throw new Error("Source has not been set yet!");
        }

        this.#preprocess();

        let i = 0;

        for (const match of this.#source.matchAll(new RegExp(`\\bmain_${this.#unique}_w(\\d+)\\b`, "g"))) {
            i = Math.max(i, parseInt(match[1], 10) + 1);
        }

        this.#source = this.#source.replace(
            /\bvoid\s+main(?=\s*\([^)]*?\))/gm,
            `void main_${this.#unique}_w${i}`
        );

        this.#source += `\n\n\n/* Patched by ${this.#caller} */\n\n`;
        this.#source += code.trim().replace(/@main(?=\()/g, `main_${this.#unique}_w${i}`);
        this.#source += `\n\n\n`;

        return this.#postprocess();
    }
}
