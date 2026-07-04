"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
});
pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
    process.exit(-1);
});
exports.default = pool;
//# sourceMappingURL=pool.js.map