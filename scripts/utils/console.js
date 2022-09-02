export class Console {
    /**
     * The console message header.
     * @type {string}
     * @readonly
     */
    static HEADER = "%cPerfect Vision: %c";

    /**
     * Output the message to the console.
     * @param {string} message - The message.
     * @param {...*} [args] - The substitution arguments.
     */
    static log(message, ...args) {
        if (message) {
            console.log(this.HEADER + message, "font-weight: bold;", "", ...args);
        }
    }

    /**
     * Output the info message to the console.
     * @param {string} message - The message.
     * @param {...*} args - The substitution arguments.
     */
    static info(message, ...args) {
        if (message) {
            console.info(this.HEADER + message, "font-weight: bold;", "", ...args);
        }
    }

    /**
     * Output the warning message to the console.
     * @param {string} message - The message.
     * @param {...*} args - The substitution arguments.
     */
    static warn(message, ...args) {
        if (message) {
            console.warn(this.HEADER + message, "font-weight: bold;", "", ...args);
        }
    }

    /**
     * Output the error message to the console.
     * @param {string} message - The message.
     * @param {...*} args - The substitution arguments.
     */
    static error(message, ...args) {
        if (message) {
            console.error(this.HEADER + message, "font-weight: bold;", "", ...args);
        }
    }

    /**
     * Output the debug message to the console.
     * @param {string} message - The message.
     * @param {...*} args - The substitution arguments.
     */
    static debug(message, ...args) {
        if (message) {
            console.debug(this.HEADER + message, "font-weight: bold;", "", ...args);
        }
    }
}
