import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

import * as schema from './schema.js';

export type Db = ReturnType<typeof makeDb>;

export function makeDb(databaseUrl: string) {
  const client = createClient({ url: databaseUrl });
  return drizzle(client, { schema });
}
