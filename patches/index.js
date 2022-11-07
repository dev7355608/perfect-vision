import "./fog.js";
import "./mask.js";

InverseOcclusionSamplerShader.fragmentShader = `
precision ${PIXI.settings.PRECISION_FRAGMENT} float;
varying vec2 vUvs;
varying vec2 vUvsMask;
uniform vec4 tintAlpha;
uniform sampler2D sampler;
uniform sampler2D maskSampler;
uniform float alphaOcclusion;
uniform float alpha;
uniform float depthElevation;
uniform bool roof;
uniform bool vision;
void main() {
  vec4 otex = texture2D(maskSampler, vUvsMask);
  float occlusionElevation = roof ? otex.a : (vision ? otex.b : otex.g);
  float tex = 1.0 - step(depthElevation, occlusionElevation);
  float mask = 1.0 - tex + (alphaOcclusion * tex);
  float calpha = tex + alpha * (1.0 - tex);
  gl_FragColor = texture2D(sampler, vUvs) * mask * calpha * tintAlpha;
}
`;
