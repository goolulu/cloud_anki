import { defineConfig } from 'drizzle-kit';

const dbUrl = process.env.DATABASE_URL ?? 'file:./dev.db';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // For libsql, file: prefix is supported.
    url: dbUrl,
  },
});
