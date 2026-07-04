"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                error: 'Validation failed',
                details: result.error.issues,
            });
            return;
        }
        req.body = result.data;
        next();
    };
}
//# sourceMappingURL=validate.js.map