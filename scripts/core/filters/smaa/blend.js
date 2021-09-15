const vertexSource = `\
#define mad(a, b, c) (a * b + c)

attribute vec2 aVertexPosition;

uniform mat3 projectionMatrix;
uniform vec4 inputSize;
uniform vec4 inputPixel;
uniform vec4 outputFrame;

#define resolution (inputPixel.xy)
#define SMAA_RT_METRICS (inputPixel.zwxy)

varying vec2 vTexCoord0;
varying vec4 vOffset;

void main() {
    vTexCoord0 = aVertexPosition * (outputFrame.zw * inputSize.zw);
    vOffset = mad(SMAA_RT_METRICS.xyxy, vec4(1.0, 0.0, 0.0,  1.0), vTexCoord0.xyxy);

    vec3 position = vec3(aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy, 1.0);
    gl_Position = vec4((projectionMatrix * position).xy, 0.0, 1.0);
}`;

const fragmentSource = `\
precision highp float;

#define mad(a, b, c) (a * b + c)

uniform sampler2D uSampler; // blendTex
uniform sampler2D colorTex;
uniform vec4 inputPixel;

#define blendTex uSampler
#define resolution (inputPixel.xy)
#define SMAA_RT_METRICS (inputPixel.zwxy)

varying vec2 vTexCoord0;
varying vec4 vOffset;

/**
 * Conditional move:
 */
void SMAAMovc(bvec2 cond, inout vec2 variable, vec2 value) {
  if (cond.x) variable.x = value.x;
  if (cond.y) variable.y = value.y;
}

void SMAAMovc(bvec4 cond, inout vec4 variable, vec4 value) {
  SMAAMovc(cond.xy, variable.xy, value.xy);
  SMAAMovc(cond.zw, variable.zw, value.zw);
}

void main() {
  vec4 color;

  // Fetch the blending weights for current pixel:
  vec4 a;
  a.x = texture2D(blendTex, vOffset.xy).a; // Right
  a.y = texture2D(blendTex, vOffset.zw).g; // Top
  a.wz = texture2D(blendTex, vTexCoord0).xz; // Bottom / Left

  // Is there any blending weight with a value greater than 0.0?
  if (dot(a, vec4(1.0, 1.0, 1.0, 1.0)) <= 1e-5) {
    color = texture2D(colorTex, vTexCoord0); // LinearSampler
  } else {
    bool h = max(a.x, a.z) > max(a.y, a.w); // max(horizontal) > max(vertical)

    // Calculate the blending offsets:
    vec4 blendingOffset = vec4(0.0, a.y, 0.0, a.w);
    vec2 blendingWeight = a.yw;
    SMAAMovc(bvec4(h, h, h, h), blendingOffset, vec4(a.x, 0.0, a.z, 0.0));
    SMAAMovc(bvec2(h, h), blendingWeight, a.xz);
    blendingWeight /= dot(blendingWeight, vec2(1.0, 1.0));

    // Calculate the texture coordinates:
    vec4 blendingCoord = mad(blendingOffset, vec4(SMAA_RT_METRICS.xy, -SMAA_RT_METRICS.xy), vTexCoord0.xyxy);

    // We exploit bilinear filtering to mix current pixel with the chosen
    // neighbor:
    color = blendingWeight.x * texture2D(colorTex, blendingCoord.xy); // LinearSampler
    color += blendingWeight.y * texture2D(colorTex, blendingCoord.zw); // LinearSampler
  }

  gl_FragColor = color;
}`;

export class SMAANeighborhoodBlendingFilter extends PIXI.Filter {
    constructor(sprite) {
        super(vertexSource, fragmentSource);

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

    apply(filterManager, input, output, clearMode, currentState) {
        this.uniforms.colorTex = this.sprite.texture;

        super.apply(filterManager, input, output, clearMode, currentState);
    }
}
