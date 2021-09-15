const vertexSourceFilter = `\
#define mad(a, b, c) (a * b + c)

attribute vec2 aVertexPosition;

uniform mat3 projectionMatrix;
uniform vec4 inputSize;
uniform vec4 inputPixel;
uniform vec4 outputFrame;

#define resolution (inputPixel.xy)
#define SMAA_RT_METRICS (inputPixel.zwxy)

varying vec2 vTexCoord0;
varying vec4 vOffset[3];

void main() {
    vTexCoord0 = aVertexPosition * (outputFrame.zw * inputSize.zw);

    vOffset[0] = mad(SMAA_RT_METRICS.xyxy, vec4(-1.0, 0.0, 0.0, -1.0), vTexCoord0.xyxy);
    vOffset[1] = mad(SMAA_RT_METRICS.xyxy, vec4( 1.0, 0.0, 0.0,  1.0), vTexCoord0.xyxy);
    vOffset[2] = mad(SMAA_RT_METRICS.xyxy, vec4(-2.0, 0.0, 0.0, -2.0), vTexCoord0.xyxy);

    vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);
    gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
}`;

const vertexSourceShader = `\
#define mad(a, b, c) (a * b + c)

attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform vec4 inputPixel;

#define resolution (inputPixel.xy)
#define SMAA_RT_METRICS (inputPixel.zwxy)

varying vec2 vTexCoord0;
varying vec4 vOffset[3];

void main() {
    vTexCoord0 = aTextureCoord;

    vOffset[0] = mad(SMAA_RT_METRICS.xyxy, vec4(-1.0, 0.0, 0.0, -1.0), vTexCoord0.xyxy);
    vOffset[1] = mad(SMAA_RT_METRICS.xyxy, vec4( 1.0, 0.0, 0.0,  1.0), vTexCoord0.xyxy);
    vOffset[2] = mad(SMAA_RT_METRICS.xyxy, vec4(-2.0, 0.0, 0.0, -2.0), vTexCoord0.xyxy);

    vec3 position = translationMatrix * vec3(aVertexPosition, 1.0);
    gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
}`;


const fragmentSourceLuma = `\
precision highp float;

/**
 * Luma Edge Detection
 *
 * IMPORTANT NOTICE: luma edge detection requires gamma-corrected colors, and
 * thus 'colorTex' should be a non-sRGB texture.
 */

#ifndef SMAA_THRESHOLD
#define SMAA_THRESHOLD 0.1
#endif
#ifndef SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR
#define SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR 2.0
#endif

uniform sampler2D uSampler; // colorTex

#define colorTex uSampler
#define resolution (inputPixel.xy)
#define SMAA_RT_METRICS (inputPixel.zwxy)

varying vec2 vTexCoord0;
varying vec4 vOffset[3];

void main() {
    vec2 threshold = vec2(SMAA_THRESHOLD);

    // Calculate lumas:
    vec3 weights = vec3(0.2126, 0.7152, 0.0722);
    float L = dot(texture2D(colorTex, vTexCoord0).rgb, weights);

    float Lleft = dot(texture2D(colorTex, vOffset[0].xy).rgb, weights);
    float Ltop  = dot(texture2D(colorTex, vOffset[0].zw).rgb, weights);

    // We do the usual threshold:
    vec4 delta;
    delta.xy = abs(L - vec2(Lleft, Ltop));
    vec2 edges = step(threshold, delta.xy);

    // Then discard if there is no edge:
    if (dot(edges, vec2(1.0, 1.0)) == 0.0)
        discard;

    // Calculate right and bottom deltas:
    float Lright = dot(texture2D(colorTex, vOffset[1].xy).rgb, weights);
    float Lbottom  = dot(texture2D(colorTex, vOffset[1].zw).rgb, weights);
    delta.zw = abs(L - vec2(Lright, Lbottom));

    // Calculate the maximum delta in the direct neighborhood:
    vec2 maxDelta = max(delta.xy, delta.zw);

    // Calculate left-left and top-top deltas:
    float Lleftleft = dot(texture2D(colorTex, vOffset[2].xy).rgb, weights);
    float Ltoptop = dot(texture2D(colorTex, vOffset[2].zw).rgb, weights);
    delta.zw = abs(vec2(Lleft, Ltop) - vec2(Lleftleft, Ltoptop));

    // Calculate the final maximum delta:
    maxDelta = max(maxDelta.xy, delta.zw);
    float finalDelta = max(maxDelta.x, maxDelta.y);

    // Local contrast adaptation:
    edges.xy *= step(finalDelta, SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR * delta.xy);

    gl_FragColor = vec4(edges, 0.0, 1.0);
}`;

const fragmentSourceColor = `\
precision highp float;

/**
 * Color Edge Detection
 *
 * IMPORTANT NOTICE: color edge detection requires gamma-corrected colors, and
 * thus 'colorTex' should be a non-sRGB texture.
 */

#ifndef SMAA_THRESHOLD
#define SMAA_THRESHOLD 0.1
#endif

#ifndef SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR
#define SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR 2.0
#endif

uniform sampler2D uSampler; // colorTex

#define colorTex uSampler
#define resolution (inputPixel.xy)
#define SMAA_RT_METRICS (inputPixel.zwxy)

varying vec2 vTexCoord0;
varying vec4 vOffset[3];

void main() {
    // Calculate the threshold:
    vec2 threshold = vec2(SMAA_THRESHOLD);

    // Calculate color deltas:
    vec4 delta;
    vec3 c = texture2D(colorTex, vTexCoord0).rgb;

    vec3 cLeft = texture2D(colorTex, vOffset[0].xy).rgb;
    vec3 t = abs(c - cLeft);
    delta.x = max(max(t.r, t.g), t.b);

    vec3 cTop  = texture2D(colorTex, vOffset[0].zw).rgb;
    t = abs(c - cTop);
    delta.y = max(max(t.r, t.g), t.b);

    // We do the usual threshold:
    vec2 edges = step(threshold, delta.xy);

    // Then discard if there is no edge:
    if (dot(edges, vec2(1.0, 1.0)) == 0.0)
        discard;

    // Calculate right and bottom deltas:
    vec3 cRight = texture2D(colorTex, vOffset[1].xy).rgb;
    t = abs(c - cRight);
    delta.z = max(max(t.r, t.g), t.b);

    vec3 cBottom  = texture2D(colorTex, vOffset[1].zw).rgb;
    t = abs(c - cBottom);
    delta.w = max(max(t.r, t.g), t.b);

    // Calculate the maximum delta in the direct neighborhood:
    vec2 maxDelta = max(delta.xy, delta.zw);

    // Calculate left-left and top-top deltas:
    vec3 cLeftLeft  = texture2D(colorTex, vOffset[2].xy).rgb;
    t = abs(c - cLeftLeft);
    delta.z = max(max(t.r, t.g), t.b);

    vec3 cTopTop = texture2D(colorTex, vOffset[2].zw).rgb;
    t = abs(c - cTopTop);
    delta.w = max(max(t.r, t.g), t.b);

    // Calculate the final maximum delta:
    maxDelta = max(maxDelta.xy, delta.zw);
    float finalDelta = max(maxDelta.x, maxDelta.y);

    // Local contrast adaptation:
    edges.xy *= step(finalDelta, SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR * delta.xy);

    gl_FragColor = vec4(edges, 0.0, 1.0);
}`;

export class SMAALumaEdgeDetectionFilter extends PIXI.Filter {
    constructor(sprite) {
        super(vertexSourceFilter, fragmentSourceLuma);

        this.sprite = sprite;
    }

    get resolution() {
        return this.sprite.texture.resolution;
    }

    set resolution(value) { }

    get multisample() {
        return this.sprite.texture.multisample;
    }

    set multisample(value) { }
}

export class SMAAColorEdgeDetectionFilter extends PIXI.Filter {
    constructor(sprite) {
        super(vertexSourceFilter, fragmentSourceColor);

        this.sprite = sprite;
    }

    get resolution() {
        return this.sprite.texture.resolution;
    }

    set resolution(value) { }

    get multisample() {
        return this.sprite.texture.multisample;
    }

    set multisample(value) { }
}

class SMAABaseEdgeDetectionShader extends PIXI.Shader {
    constructor(sprite, fragmentSource) {
        super(PIXI.Program.from(vertexSourceShader, fragmentSource));

        this.sprite = sprite;
        this.uniforms.inputPixel = new Float32Array(4);
    }

    get texture() {
        return this.uniforms.uSampler;
    }

    set texture(value) {
        this.uniforms.uSampler = value;
    }

    update() {
        const texture = this.uniforms.uSampler;
        const width = texture.width;
        const height = texture.height;
        const resolution = texture.resolution;
        const inputPixel = this.uniforms.inputPixel;

        inputPixel[0] = Math.round(width * resolution);
        inputPixel[1] = Math.round(height * resolution);
        inputPixel[2] = 1 / inputPixel[0];
        inputPixel[3] = 1 / inputPixel[1];
    }
}

export class SMAALumaEdgeDetectionShader extends SMAABaseEdgeDetectionShader {
    constructor(sprite) {
        super(sprite, fragmentSourceLuma);
    }
}

export class SMAAColorEdgeDetectionShader extends SMAABaseEdgeDetectionShader {
    constructor(sprite) {
        super(sprite, fragmentSourceColor);
    }
}
