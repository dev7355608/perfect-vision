import { RenderTargetData } from "../../../display/render-target.js";
import { Board } from "../../board.js";
import { SpriteMesh } from "../../../display/sprite-mesh.js";
import { SMAAColorEdgeDetectionShader as SMAAEdgeDetectionShader } from "./edges.js";
import { SMAABlendingWeightCalculationFilter } from "./weights.js";
import { SMAANeighborhoodBlendingFilter } from "./blend.js";

Hooks.once("init", () => {
    const smaaEdgeDetectionShader = new SMAAEdgeDetectionShader();
    const smaaBlendingWeightCalculationFilter = new SMAABlendingWeightCalculationFilter();
    const smaaNeighborhoodBlendingFilter = new SMAANeighborhoodBlendingFilter();

    const smaaSprite = new SpriteMesh(smaaEdgeDetectionShader);

    smaaSprite.shader = smaaEdgeDetectionShader;
    smaaSprite.filters = [smaaBlendingWeightCalculationFilter, smaaNeighborhoodBlendingFilter];

    smaaEdgeDetectionShader.sprite = smaaSprite;
    smaaBlendingWeightCalculationFilter.sprite = smaaSprite;
    smaaNeighborhoodBlendingFilter.sprite = smaaSprite;

    const renderTargetData = new RenderTargetData(smaaSprite);

    Hooks.on("canvasInit", () => {
        const segment = Board.getSegment(Board.SEGMENTS.LIGHTING);

        if (game.settings.get("core", "softShadows")) {
            segment.renderTarget = renderTargetData;
        } else {
            segment.renderTarget = null;
        }
    });
});
