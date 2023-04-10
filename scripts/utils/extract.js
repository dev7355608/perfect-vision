class ExtractSystem {
    /** @readonly */
    static extension = {
        type: PIXI.ExtensionType.RendererPlugin,
        name: "extractAsync"
    };

    /**
     * @type {PIXI.Renderer}
     * @readonly
     */
    renderer;

    /** @type {ExtractWorker} */
    #worker = new ExtractWorker();

    /** @type {Object.<number,{reference:Uint8ClampedArray,touched:number}>} */
    #arrays = {};

    /** @type {Object.<number,{reference:WebGLBuffer,touched:number}>} */
    #buffers = {};

    /** @type {number} */
    #count = 0;

    /** @type {number} */
    #checkCount = 0;

    /** @type {number} */
    #checkCountMax = PIXI.settings.GC_MAX_CHECK_COUNT * 3;

    /** @type {number} */
    #maxIdle = PIXI.settings.GC_MAX_IDLE * 5;

    /** @param {PIXI.Renderer} renderer */
    constructor(renderer) {
        this.renderer = renderer;

        renderer.runners.contextChange.add(this);
        renderer.runners.postrender.add(this);
    }

    /**
     * Extract a rectangular block of pixels and convert them to base64.
     * @param {PIXI.DisplayObject|PIXI.RenderTexture|null} target - The target the pixels are extracted from; if `null`, the pixels are extracted from the renderer.
     * @param {string} [format] - A string indicating the image format. The default type is `image/png`; this image format will be also used if the specified type is not supported.
     * @param {number} [quality] - A number between 0 and 1 indicating the image quality to be used when creating images using file formats that support lossy compression (such as image/jpeg or image/webp).
     *  A user agent will use its default quality value if this option is not specified, or if the number is outside the allowed range.
     * @param {PIXI.Rectangle} [frame] - The rectangle the pixels are extracted from.
     * @returns {Promise<string>} The base64 data url created from the extracted pixels.
     */
    async base64(target, format, quality, frame) {
        return this.#extract(target, frame, "base64", format, quality);
    }

    /**
     * Extract a rectangular block of pixels and convert them to a bitmap.
     * @param {PIXI.DisplayObject|PIXI.RenderTexture|null} target - The target the pixels are extracted from; if `null`, the pixels are extracted from the renderer.
     * @param {PIXI.Rectangle} [frame] - The rectangle the pixels are extracted from.
     * @returns {Promise<ImageBitmap>} The image bitmap created from the extracted pixels.
     */
    async bitmap(target, frame) {
        return this.#extract(target, frame, "bitmap");
    }

    /**
     * Extract a rectangular block of pixels and put them in a canvas.
     * @param {PIXI.DisplayObject|PIXI.RenderTexture|null} target - The target the pixels are extracted from; if `null`, the pixels are extracted from the renderer.
     * @param {PIXI.Rectangle} [frame] - The rectangle the pixels are extracted from.
     * @returns {Promise<HTMLCanvasElement>} The canvas element.
     */
    async canvas(target, frame) {
        return this.#extract(target, frame, "canvas");
    }

    /**
     * Extract a rectangular block of pixels and convert them to an image.
     * @param {PIXI.DisplayObject|PIXI.RenderTexture|null} target - The target the pixels are extracted from; if `null`, the pixels are extracted from the renderer.
     * @param {string} [format] - A string indicating the image format. The default type is `image/png`; this image format will be also used if the specified type is not supported.
     * @param {number} [quality] - A number between 0 and 1 indicating the image quality to be used when creating images using file formats that support lossy compression (such as image/jpeg or image/webp).
     *  A user agent will use its default quality value if this option is not specified, or if the number is outside the allowed range.
     * @param {PIXI.Rectangle} [frame] - The rectangle the pixels are extracted from.
     * @returns {Promise<HTMLImageElement>} The image element created from the extracted pixels.
     */
    async image(target, format, quality, frame) {
        const image = new Image();

        image.src = await this.base64(target, format, quality, frame);

        return image;
    }

    /**
     * Extract a rectangular block of pixels.
     * @param {PIXI.DisplayObject|PIXI.RenderTexture|null} target - The target the pixels are extracted from; if `null`, the pixels are extracted from the renderer.
     * @param {PIXI.Rectangle} [frame] - The rectangle the pixels are extracted from.
     * @returns {Promise<HTMLCanvasElement>} The canvas element created from the extracted pixels.
     */
    async pixels(target, frame) {
        return this.#extract(target, frame, "pixels");
    }

    contextChange() {
        this.#arrays = {};
        this.#buffers = {};
    }

    postrender() {
        const renderer = this.renderer;

        if (!renderer.renderingToScreen) {
            return;
        }

        this.#count++;
        this.#checkCount++;

        if (this.#checkCount > this.#checkCountMax) {
            this.#checkCount = 0;

            const threshold = this.#count - this.#maxIdle;

            this.#deleteArrays(threshold);
            this.#deleteBuffers(threshold);
        }
    }

    destroy() {
        this.renderer = null;
        this.#arrays = null;
        this.#buffers = null;
        this.#worker.terminate();
        this.#worker = null;
    }

    /**
     * Extract a rectangular block of pixels from the texture.
     * @param {PIXI.DisplayObject|PIXI.RenderTexture|null} target - The target the pixels are extracted from; if `null`, the pixels are extracted from the renderer.
     * @param {PIXI.Rectangle} [frame] - The rectangle the pixels are extracted from.
     * @param {"base64"|"bitmap"|"canvas"|"pixels"} func
     * @param {...*} args
     * @returns {Promise<string|ImageBitmap|HTMLCanvasElement|Uint8ClampedArray>}
     */
    async #extract(target, frame, func, ...args) {
        const renderer = this.renderer;
        let renderTexture;
        let resolution;
        let flipped;
        let premultiplied;
        let generated = false;

        if (target) {
            if (target instanceof PIXI.RenderTexture) {
                renderTexture = target;
            } else {
                renderTexture = renderer.generateTexture(target, {
                    resolution: renderer.resolution,
                    multisample: renderer.multisample
                });
                generated = true;
            }
        }

        if (renderTexture) {
            frame ??= renderTexture.frame;
            resolution = renderTexture.baseTexture.resolution;
            premultiplied = renderTexture.baseTexture.alphaMode > 0
                && renderTexture.baseTexture.format === PIXI.FORMATS.RGBA;
            flipped = false;

            if (!generated) {
                renderer.renderTexture.bind(renderTexture);

                const fbo = renderTexture.framebuffer.glFramebuffers[renderer.CONTEXT_UID];

                if (fbo.blitFramebuffer) {
                    renderer.framebuffer.bind(fbo.blitFramebuffer);
                }
            }
        } else {
            const { alpha, premultipliedAlpha } = gl.getContextAttributes();

            frame ??= renderer.screen;
            resolution = renderer.resolution;
            flipped = true;
            premultiplied = alpha && premultipliedAlpha;
            renderer.renderTexture.bind(null);
        }

        const x = Math.round(frame.left * resolution);
        const y = Math.round(frame.top * resolution);
        const width = Math.round(frame.right * resolution) - x;
        const height = Math.round(frame.bottom * resolution) - y;
        const pixelsSize = width * height * 4;
        const bufferSize = PIXI.utils.nextPow2(pixelsSize);
        const extract = { pixels: null, x, y, width, height, flipped, premultiplied };
        const gl = renderer.gl;

        try {
            if (renderer.context.webGLVersion === 1) {
                const pixels = extract.pixels = this.#getArray(bufferSize);

                gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            } else {
                const buffer = this.#getBuffer(bufferSize);

                try {
                    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

                    await new Promise(function (resolve, reject) {
                        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
                        const wait = (flags = 0) => {
                            const status = gl.clientWaitSync(sync, flags, 0);

                            if (status === gl.TIMEOUT_EXPIRED) {
                                setTimeout(wait, 10);
                            } else {
                                gl.deleteSync(sync);

                                if (status === gl.WAIT_FAILED) {
                                    reject();
                                } else {
                                    resolve();
                                }
                            }
                        };

                        setTimeout(wait, 0, gl.SYNC_FLUSH_COMMANDS_BIT);
                    });

                    const pixels = extract.pixels = this.#getArray(bufferSize);

                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
                    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels, 0, pixelsSize);
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                } finally {
                    this.#returnBuffer(buffer, bufferSize);
                }
            }
        } finally {
            if (generated) {
                renderTexture.destroy(true);
            }
        }

        const result = await this.#worker[func](extract, ...args);

        this.#returnArray(extract.pixels);

        return result;
    }

    /**
     * @param {number} size
     * @returns {Uint8ClampedArray}
     */
    #getArray(size) {
        return (this.#arrays[size] ??= []).pop()?.reference
            ?? new Uint8ClampedArray(size);
    }

    /**
     * @param {Uint8ClampedArray} array
     */
    #returnArray(array) {
        if (!array?.byteLength) {
            return;
        }

        this.#arrays[array.length].push({ reference: array, touched: this.#count });
    }

    /**
     * @param {number} [threshold]
     */
    #deleteArrays(threshold) {
        for (const size in this.#arrays) {
            const arrays = this.#arrays[size];

            for (let i = arrays.length - 1; i >= 0; i--) {
                const array = arrays[i];

                if (!(array.touched >= threshold)) {
                    arrays[i] = arrays[arrays.length - 1];
                    arrays.length--;
                }
            }
        }
    }

    /**
     * @param {number} size
     * @returns {WebGLBuffer}
     */
    #getBuffer(size) {
        const gl = this.renderer.gl;
        const entry = (this.#buffers[size] ??= []).pop();
        let buffer;

        if (entry) {
            buffer = entry.reference;
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
        } else {
            buffer = gl.createBuffer();
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
            gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.DYNAMIC_READ);
        }

        return buffer;
    }

    /**
     * @param {WebGLBuffer} buffer
     * @param {number} size
     */
    #returnBuffer(buffer, size) {
        this.#buffers[size].push({ reference: buffer, touched: this.#count });
    }

    /**
     * @param {number} [threshold]
     */
    #deleteBuffers(threshold) {
        for (const size in this.#buffers) {
            const buffers = this.#buffers[size];

            for (let i = buffers.length - 1; i >= 0; i--) {
                const buffer = buffers[i];

                if (!(buffer.touched >= threshold)) {
                    this.renderer.gl.deleteBuffer(buffer.reference);

                    buffers[i] = buffers[buffers.length - 1];
                    buffers.length--;
                }
            }
        }
    }
}

/**
 * @typedef {{pixels:Uint8ClampedArray,width:number,height:number,flipped:boolean,premultiplied:boolean}} ExtractData
 */

class ExtractWorker extends Worker {
    /** @type {string} */
    static #objectURL;

    /**
     * @type {string}
     * @readonly
     */
    static get objectURL() {
        return this.#objectURL ??= URL.createObjectURL(
            new Blob([EXTRACT_WORKER_SOURCE],
                { type: "application/javascript" }));
    }

    /**
     * Is OffscreenCanvas with 2d context supported?
     * @type {boolean}
     * @readonly
     */
    static #isOffscreenCanvasSupported = typeof OffscreenCanvas !== "undefined"
        && !!new OffscreenCanvas(0, 0).getContext("2d");

    /** @type {Map<number,{extract:ExtractData,resolve:(result:Uint8ClampedArray|string)=>void,reject:(error:Error)=>void}} */
    #tasks = new Map();

    /** @type {number} */
    #nextTaskId = 0;

    constructor() {
        super(ExtractWorker.objectURL);

        this.onmessage = this.#onMessage.bind(this);
    }

    /**
     * @param {ExtractData} extract
     * @param {string} [type]
     * @param {number} [quality]
     * @returns {Promise<string>}
     */
    async base64(extract, type = "image/png", quality) {
        if (ExtractWorker.#isOffscreenCanvasSupported) {
            return this.#process(extract, type, quality);
        }

        const pixels = await this.#process(extract);
        const { width, height } = extract;
        const canvas = await pixelsToCanvas(pixels, width, height);

        return canvasToBase64(canvas, type, quality);
    }

    /**
     * @param {ExtractData} extract
     * @returns {Promise<ImageBitmap>}
     */
    async bitmap(extract) {
        const pixels = await this.#process(extract);
        const { width, height } = extract;
        const size = width * height * 4;
        const imageData = new ImageData(pixels.subarray(0, size), width, height);

        return createImageBitmap(imageData, {
            imageOrientation: "none",
            premultiplyAlpha: "none",
            colorSpaceConversion: "none"
        });
    }

    /**
     * @param {ExtractData} extract
     * @returns {Promise<HTMLCanvasElement>}
     */
    async canvas(extract) {
        const pixels = await this.#process(extract);
        const { width, height } = extract;

        return pixelsToCanvas(pixels, width, height);
    }

    /**
     * @param {ExtractData} extract
     * @returns {Promise<Uint8ClampedArray>}
     */
    async pixels(extract) {
        return this.#process(extract);
    }

    /**
     * @param {ExtractData} extract
     * @param {string} [type]
     * @param {number} [quality]
     * @returns {Promise<Uint8ClampedArray|string>}
     */
    async #process(extract, type, quality) {
        const taskId = this.#nextTaskId++;
        const taskData = { id: taskId, ...extract, type, quality };

        return new Promise((resolve, reject) => {
            this.#tasks.set(taskId, { extract, resolve, reject });
            this.postMessage(taskData, [extract.pixels.buffer]);
        });
    }

    /** @param {MessageEvent} event */
    #onMessage(event) {
        const { id, result, error, pixels } = event.data;
        const task = this.#tasks.get(id);

        if (!task) {
            return;
        }

        this.#tasks.delete(id);
        task.extract.pixels = pixels;

        if (error) {
            return task.reject(new Error(error));
        } else {
            return task.resolve(result);
        }
    }
}

const EXTRACT_WORKER_SOURCE = `\
/**
 * Create an offscreen canvas element containing the pixels.
 * @param {Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 * @returns {Promise<OffscreenCanvas>}
 */
async function pixelsToCanvas(pixels, width, height) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    const size = width * height * 4;
    const imageData = new ImageData(pixels.subarray(0, size), width, height);

    context.putImageData(imageData, 0, 0);

    return canvas;
}

/**
 * Asynchronously convert an offscreen canvas element to base64.
 * @param {OffscreenCanvas} canvas
 * @param {string} [type]
 * @param {number} [quality]
 * @returns {Promise<string>} The base64 string of the canvas.
 */
async function canvasToBase64(canvas, type, quality) {
    return canvas.convertToBlob({ type, quality }).then(
        blob => new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        })
    );
}

/**
 * Asynchronously convert the pixels to base64.
 * @param {Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 * @param {string} [type]
 * @param {number} [quality]
 * @returns {Promise<string>} The base64 string of the canvas.
 */
async function pixelsToBase64(pixels, width, height, type, quality) {
    const canvas = await pixelsToCanvas(pixels, width, height);

    return canvasToBase64(canvas, type, quality);
}

/**
 * Flip the pixels.
 * @param {Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 */
function flipPixels(pixels, width, height) {
    const w = width << 2;
    const h = height >> 1;
    const temp = new Uint8ClampedArray(w);

    for (let y = 0; y < h; y++) {
        const t = y * w;
        const b = (height - y - 1) * w;

        temp.set(pixels.subarray(t, t + w));
        pixels.copyWithin(t, b, b + w);
        pixels.set(temp, b);
    }
}

/**
 * Unpremultiply the pixels.
 * @param {Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 */
function unpremultiplyPixels(pixels, width, height) {
   const n = width * height * 4;

   for (let i = 0; i < n; i += 4) {
       const alpha = pixels[i + 3];

       if (alpha !== 0) {
           const a = 255 / alpha;

           pixels[i] = pixels[i] * a ;
           pixels[i + 1] = pixels[i + 1] * a;
           pixels[i + 2] = pixels[i + 2] * a;
       }
   }
}

onmessage = function(event) {
    const { id, pixels, width, height, flipped, premultiplied, type, quality } = event.data;

    setTimeout(async () => {
        try {
            if (flipped) {
                flipPixels(pixels, width, height);
            }

            if (premultiplied) {
                unpremultiplyPixels(pixels, width, height);
            }

            if (type !== undefined) {
                const result = await pixelsToBase64(pixels, width, height, type, quality);

                postMessage({ id, result, pixels }, [pixels.buffer]);
            } else {
                const result = pixels.slice(0, width * height * 4);

                postMessage({ id, result, pixels }, [pixels.buffer, result.buffer]);
            }
        } catch (e) {
            postMessage({ id, error: e.message, pixels }, [pixels.buffer]);

            throw e;
        }
    }, 0);
};
`;

/**
 * Create a canvas element containing the pixels.
 * @param {Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 * @returns {Promise<HTMLCanvasElement>}
 */
async function pixelsToCanvas(pixels, width, height) {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    const size = width * height * 4;
    const imageData = new ImageData(pixels.subarray(0, size), width, height);

    context.putImageData(imageData, 0, 0);

    return canvas;
}

/**
 * Asynchronously convert a canvas element to base64.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [type]
 * @param {number} [quality]
 * @returns {Promise<string>} The base64 string of the canvas.
 */
async function canvasToBase64(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        }, type, quality);
    });
}

PIXI.extensions.add(ExtractSystem);
