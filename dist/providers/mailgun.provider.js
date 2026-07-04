"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailgunProvider = void 0;
const mailgun_js_1 = __importDefault(require("mailgun.js"));
const form_data_1 = __importDefault(require("form-data"));
class MailgunProvider {
    constructor(apiKey, domain, fromEmail) {
        this.fromEmail = fromEmail;
        const mg = new mailgun_js_1.default(form_data_1.default);
        this.client = mg.client({ username: 'api', key: apiKey });
    }
    async send(to, subject, html) {
        await this.client.messages.create(this.fromEmail.split('@')[1] ?? '', {
            from: this.fromEmail,
            to,
            subject,
            html,
        });
    }
}
exports.MailgunProvider = MailgunProvider;
//# sourceMappingURL=mailgun.provider.js.map