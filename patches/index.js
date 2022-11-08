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

Drawing.prototype._onUpdate = function (changed, options, userId) {
  // Fully re-draw when some drawing elements have changed
  const textChanged = ("text" in changed)
    || (this.document.text && ["fontFamily", "fontSize", "textColor", "width"].some(k => k in changed));
  if (changed.shape?.type || ("texture" in changed) || textChanged) {
    this.draw().then(() => PlaceableObject.prototype._onUpdate.call(this, changed, options, userId));
  }
  // Otherwise, simply refresh the existing drawing
  else PlaceableObject.prototype._onUpdate.call(this, changed, options, userId);
};

Hooks.once("init", () => {
  if (!game.modules.get("levels")?.active) {
    const elevation = Symbol("elevation");

    Object.defineProperty(DrawingDocument.prototype, "elevation", {
      get() {
        return this[elevation] ?? 0;
      },
      set(value) {
        this[elevation] = value;

        if (this.rendered) {
          canvas.primary.sortChildren();
        }
      }
    });
  }
});
