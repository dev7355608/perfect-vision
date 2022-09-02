import { Console } from "./console.js";

export class Notifications {
    /**
     * The notification header.
     * @type {string}
     * @readonly
     */
    static HEADER = `<b>Perfect Vision:</b> `;

    /**
     * Display a notification with the "info" type.
     * @param {string} message - The message.
     * @param {NotifyOptions} [options] - The notification options.
     */
    static info(message, options) {
        if (message) {
            if (options?.console ?? true) {
                Console.info(message);
            }

            options ??= {};
            options.console = false;
            ui.notifications.info(this.HEADER + message, options);
        }
    }

    /**
     * Display a notification with the "warning" type.
     * @param {string} message - The message.
     * @param {NotifyOptions} [options] - The notification options.
     */
    static warn(message, options) {
        if (message) {
            if (options?.console ?? true) {
                Console.warn(message);
            }

            options ??= {};
            options.console = false;
            ui.notifications.warn(this.HEADER + message, options);
        }
    }

    /**
     * Display a notification with the "error" type.
     * @param {string} message - The message.
     * @param {NotifyOptions} [options] - The notification options.
     */
    static error(message, options) {
        if (message) {
            if (options?.console ?? true) {
                Console.error(message);
            }

            options ??= {};
            options.console = false;
            ui.notifications.error(this.HEADER + message, options);
        }
    }
}
