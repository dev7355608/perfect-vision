import { Logger } from "../../utils/logger.js";

// TODO: remove in pixi.js v6.2.1

Logger.debug("Patching PIXI.GeometrySystem.prototype.getSignature (OVERRIDE)");

PIXI.GeometrySystem.prototype.getSignature = function (geometry, program) {
    const attribs = geometry.attributes;
    const shaderAttributes = program.attributeData;

    const strings = ['g', geometry.id];

    for (const i in attribs) {
        if (shaderAttributes[i]) {
            strings.push(i, shaderAttributes[i].location);
        }
    }

    return strings.join('-');
};
