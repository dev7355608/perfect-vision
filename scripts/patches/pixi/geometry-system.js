import { Logger } from "../../utils/logger.js";

Logger.debug("Patching PIXI.GeometrySystem.prototype.checkCompatibility (OVERRIDE)");

PIXI.GeometrySystem.prototype.checkCompatibility = function (geometry, program) { };

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
