import { OcclusionMaskMixin } from "../../utils/occlusion-mask.js";
import { SmoothMesh } from "../../utils/smooth-mesh.js";
import { ViewportTextureMixin } from "../../utils/viewport-texture.js";

export class PointSourceMesh extends ViewportTextureMixin(OcclusionMaskMixin(SmoothMesh)) {
    constructor(...args) {
        super(...args);

        this.cullable = true;
    }
}
