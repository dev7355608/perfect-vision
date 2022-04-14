import { Logger } from "./logger.js";

const wrappers = {};

export function patch(target, type, func) {
    Logger.debug("Patching %s (%s)", target, type);

    if (type === "PRE") {
        type = "WRAPPER";
        func = (func => function (wrapped, ...args) {
            return wrapped(...func.apply(this, args));
        })(func);
    } else if (type === "POST") {
        type = "WRAPPER";
        func = (func => function (wrapped, ...args) {
            return func.call(this, wrapped(...args), ...args);
        })(func);
    }

    let priority;

    if (type === "OVERRIDE") {
        priority = 0;
    } else if (type === "MIXED") {
        priority = 1;
    } else {
        priority = 2;
    }

    let chain = wrappers[target];

    if (!chain) {
        wrappers[target] = chain = [];
    } else {
        libWrapper.unregister("perfect-vision", target);
    }

    chain.push({ type, func, priority });
    chain.sort((a, b) => a.priority - b.priority);

    ({ type, func } = chain[0]);

    for (let i = 1; i < chain.length; i++) {
        if (type !== "OVERRIDE") {
            func = ((prev, next) => function (wrapped, ...args) {
                return next.call(this, (...args) => prev.call(this, wrapped, ...args), ...args);
            })(func, chain[i].func);
        } else {
            console.assert(chain[i].type !== "OVERRIDE", "OVERRIDE cannot be registered more than once!");

            func = ((prev, next) => function (...args) {
                return next.call(this, prev.bind(this), ...args);
            })(func, chain[i].func);
        }
    }

    libWrapper.register("perfect-vision", target, func, type);
}
