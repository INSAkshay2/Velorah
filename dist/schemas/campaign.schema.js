"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaignSchema = exports.recipientSchema = void 0;
const zod_1 = require("zod");
exports.recipientSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1),
});
exports.createCampaignSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    subject: zod_1.z.string().min(1),
    body: zod_1.z.string().min(1),
    recipients: zod_1.z.array(exports.recipientSchema).min(1),
});
//# sourceMappingURL=campaign.schema.js.map