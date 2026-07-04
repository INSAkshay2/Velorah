import fs from 'fs';
import path from 'path';
import pool from './pool';

async function migrate() {
  const client = await pool.connect();

  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (!file.endsWith('.sql')) continue;

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`Running migration: ${file}`);
      await client.query(sql);
      console.log(`Completed migration: ${file}`);
    }

    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
