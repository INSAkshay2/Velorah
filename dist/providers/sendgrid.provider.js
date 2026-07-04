"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendGridProvider = void 0;
const mail_1 = __importDefault(require("@sendgrid/mail"));
class SendGridProvider {
    constructor(apiKey, fromEmail) {
        this.fromEmail = fromEmail;
        mail_1.default.setApiKey(apiKey);
    }
    async send(to, subject, html) {
        await mail_1.default.send({ to, from: this.fromEmail, subject, html });
    }
}
exports.SendGridProvider = SendGridProvider;
//# sourceMappingURL=sendgrid.provider.js.map