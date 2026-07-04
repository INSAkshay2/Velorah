"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.personalise = personalise;
const logger_js_1 = require("../utils/logger.js");
const enabled = process.env.AI_PERSONALISATION_ENABLED === "true";
async function personalise(recipient, baseContent) {
    if (!enabled)
        return baseContent;
    logger_js_1.logger.info("AI personalisation requested", { recipient });
    return baseContent;
}
//# sourceMappingURL=aiService.js.map