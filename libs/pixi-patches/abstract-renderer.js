import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.AbstractRenderer.prototype.resize (OVERRIDE)");

PIXI.AbstractRenderer.prototype.resize = function (screenWidth, screenHeight) {
    this.view.width = Math.round(screenWidth * this.resolution);
    this.view.height = Math.round(screenHeight * this.resolution);

    screenWidth = this.view.width / this.resolution;
    screenHeight = this.view.height / this.resolution;

    this.screen.width = screenWidth;
    this.screen.height = screenHeight;

    if (this.autoDensity || this.view.id === "board" /* Foundry VTT */) {
        this.view.style.width = `${screenWidth}px`;
        this.view.style.height = `${screenHeight}px`;
    }

    this.emit('resize', screenWidth, screenHeight);
};
