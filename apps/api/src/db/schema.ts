import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const collects = sqliteTable('collects', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull(),
  word: text('word').notNull(),
  lang: text('lang').notNull(),
  sourceUrl: text('source_url').notNull(),
  context: text('context').notNull().default(''),
  pageTitle: text('page_title').notNull().default(''),
  hostname: text('hostname').notNull().default(''),
  capturedAt: integer('captured_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(),
  word: text('word').notNull(),
  lang: text('lang').notNull(),
  normalizedJson: text('normalized_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
