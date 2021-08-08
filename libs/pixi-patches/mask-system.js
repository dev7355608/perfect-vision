import { Logger } from "../../scripts/utils/logger.js";

Logger.debug("Patching PIXI.MaskSystem.prototype.push (OVERRIDE)");

PIXI.MaskSystem.prototype.push = function (target, maskDataOrTarget) {
    let maskData = maskDataOrTarget;

    if (!maskData.isMaskData) {
        const d = this.maskDataPool.pop() || new PIXI.MaskData();

        d.pooled = true;
        d.maskObject = maskDataOrTarget;
        maskData = d;
    }

    if (maskData.autoDetect) {
        this.detect(maskData);
    }

    const maskAbove = this.maskStack.length !== 0 ? this.maskStack[this.maskStack.length - 1] : null;

    maskData.copyCountersOrReset(maskAbove);
    maskData._target = target;

    if (maskData.type !== PIXI.MASK_TYPES.SPRITE) {
        this.maskStack.push(maskData);
    }

    if (maskData.enabled) {
        switch (maskData.type) {
            case PIXI.MASK_TYPES.SCISSOR:
                this.renderer.scissor.push(maskData);
                break;
            case PIXI.MASK_TYPES.STENCIL:
                this.renderer.stencil.push(maskData);
                break;
            case PIXI.MASK_TYPES.SPRITE:
                maskData.copyCountersOrReset(null);
                this.pushSpriteMask(maskData);
                break;
            default:
                break;
        }
    }

    if (maskData.type === PIXI.MASK_TYPES.SPRITE) {
        this.maskStack.push(maskData);
    }
};

Logger.debug("Patching PIXI.MaskSystem.prototype.pop (OVERRIDE)");

PIXI.MaskSystem.prototype.pop = function (target) {
    const maskData = this.maskStack.pop();

    if (!maskData || maskData._target !== target) {
        // TODO: add an assert when we have it
        return;
    }

    if (maskData.enabled) {
        switch (maskData.type) {
            case PIXI.MASK_TYPES.SCISSOR:
                this.renderer.scissor.pop();
                break;
            case PIXI.MASK_TYPES.STENCIL:
                this.renderer.stencil.pop(maskData.maskObject);
                break;
            case PIXI.MASK_TYPES.SPRITE:
                this.popSpriteMask(maskData);
                break;
            default:
                break;
        }
    }

    maskData.reset();

    if (maskData.pooled) {
        this.maskDataPool.push(maskData);
    }

    if (this.maskStack.length !== 0) {
        const maskCurrent = this.maskStack[this.maskStack.length - 1];

        if (maskCurrent.type === PIXI.MASK_TYPES.SPRITE && maskCurrent._filters) {
            maskCurrent._filters[0].maskSprite = maskCurrent.maskObject;
        }
    }
};

Logger.debug("Patching PIXI.MaskSystem.prototype.pushSpriteMask (OVERRIDE)");

PIXI.MaskSystem.prototype.pushSpriteMask = function (maskData) {
    const { maskObject } = maskData;
    const target = maskData._target;
    let alphaMaskFilter = maskData._filters;

    if (!alphaMaskFilter) {
        alphaMaskFilter = this.alphaMaskPool[this.alphaMaskIndex];

        if (!alphaMaskFilter) {
            alphaMaskFilter = this.alphaMaskPool[this.alphaMaskIndex] = [new PIXI.SpriteMaskFilter(maskObject)];
        }
    }

    const renderer = this.renderer;
    const renderTextureSystem = renderer.renderTexture;

    let resolution;
    let multisample;

    if (renderTextureSystem.current) {
        const renderTexture = renderTextureSystem.current;

        resolution = maskData.resolution || renderTexture.resolution;
        multisample = maskData.multisample ?? renderTexture.multisample;
    } else {
        resolution = maskData.resolution || renderer.resolution;
        multisample = maskData.multisample ?? renderer.multisample;
    }

    alphaMaskFilter[0].resolution = resolution;
    alphaMaskFilter[0].multisample = multisample;
    alphaMaskFilter[0].maskSprite = maskObject;

    const stashFilterArea = target.filterArea;

    target.filterArea = maskData.filterArea || maskObject.getBounds(true);
    renderer.filter.push(target, alphaMaskFilter);
    target.filterArea = stashFilterArea;

    if (!maskData._filters) {
        this.alphaMaskIndex++;
    }
};

Logger.debug("Patching PIXI.MaskSystem.prototype.popSpriteMask (OVERRIDE)");

PIXI.MaskSystem.prototype.popSpriteMask = function (maskData) {
    this.renderer.filter.pop();

    if (maskData._filters) {
        maskData._filters[0].maskSprite = null;
    } else {
        this.alphaMaskIndex--;
        this.alphaMaskPool[this.alphaMaskIndex][0].maskSprite = null;
    }
};
