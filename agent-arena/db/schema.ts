import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const arenas = sqliteTable('arenas', {
  owner: text('owner').primaryKey(), state: text('state').notNull(), version: integer('version').notNull().default(0),
  lockToken: text('lock_token'), lockUntil: integer('lock_until').notNull().default(0), connection: text('connection'),
});
