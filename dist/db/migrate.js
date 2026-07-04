"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pool_1 = __importDefault(require("./pool"));
async function migrate() {
    const client = await pool_1.default.connect();
    try {
        const migrationsDir = path_1.default.join(__dirname, 'migrations');
        const files = fs_1.default.readdirSync(migrationsDir).sort();
        for (const file of files) {
            if (!file.endsWith('.sql'))
                continue;
            const filePath = path_1.default.join(migrationsDir, file);
            const sql = fs_1.default.readFileSync(filePath, 'utf-8');
            console.log(`Running migration: ${file}`);
            await client.query(sql);
            console.log(`Completed migration: ${file}`);
        }
        console.log('All migrations completed successfully.');
    }
    catch (err) {
        console.error('Migration failed:', err);
        throw err;
    }
    finally {
        client.release();
        await pool_1.default.end();
    }
}
migrate();
//# sourceMappingURL=migrate.js.map