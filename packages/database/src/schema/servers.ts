import { relations } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'
import { organization } from './auth.js'

export const servers = pgTable(
  'servers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('servers_organization_id_name_unique').on(
      table.organizationId,
      table.name
    ),
  ]
)

export const serversRelations = relations(servers, ({ one }) => ({
  organization: one(organization, {
    fields: [servers.organizationId],
    references: [organization.id],
  }),
}))
