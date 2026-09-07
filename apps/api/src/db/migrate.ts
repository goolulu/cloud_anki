import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';

import { makeDb } from './client.js';

const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

await migrate(makeDb(databaseUrl), { migrationsFolder });
console.log('Database migrations applied');
