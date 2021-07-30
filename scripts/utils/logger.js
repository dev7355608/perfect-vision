export class Logger {
    static HEADER = "Perfect Vision | ";

    static log(message, ...args) {
        if (message) {
            return console.log(this.HEADER + message, ...args);
        }
    }

    static warn(message, ...args) {
        if (message) {
            return console.warn(this.HEADER + message, ...args);
        }
    }

    static debug(message, ...args) {
        if (message) {
            return console.debug(this.HEADER + message, ...args);
        }
    }
}
