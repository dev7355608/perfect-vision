/**
 * Create an offscreen canvas element containing the pixel data.
 * @param {Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 * @returns {OffscreenCanvas}
 */
function pixelsToCanvas(pixels, width, height) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    const imageData = new ImageData(pixels, width, height);

    context.putImageData(imageData, 0, 0);

    return canvas;
}

/**
 * Asynchronously convert an offscreen canvas element to base64.
 * @param {OffscreenCanvas} canvas
 * @param {string} [type="image/png"]
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
 * Asynchronously convert the pixel data to base64.
 * @param {Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 * @param {string} [type="image/png"]
 * @param {number} [quality]
 * @returns {Promise<string>} The base64 string of the canvas.
 */
async function pixelsToBase64(pixels, width, height, type, quality) {
    const canvas = pixelsToCanvas(pixels, width, height);

    return canvasToBase64(canvas, type, quality);
}

onmessage = function (event) {
    const { id, pixels, width, height, type, quality } = event.data;

    pixelsToBase64(pixels, width, height, type, quality)
        .then(base64 => postMessage({ id, result: base64 }))
        .catch(e => { postMessage({ id, error: e.message }); throw e; });
};

