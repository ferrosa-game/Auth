import { pgTable, timestamp, uuid, text, integer, index } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    createdAt: timestamp().notNull().defaultNow(),
    bannedUntil: timestamp()
});

export const loginCodes = pgTable("login_codes", {
    email: text().primaryKey(),
    code: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    attempts: integer().notNull().default(0)
})

export const sessions = pgTable("sessions", {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    lastSeenAt: timestamp().notNull().defaultNow(),
    expiresAt: timestamp().notNull(),
    revokedAt: timestamp()
})

export const gameServers = pgTable("game_servers", {
    id: uuid().primaryKey().defaultRandom(),
    listKey: uuid().notNull().references(() => serverlistKeys.id, { onDelete: "cascade" }),
    label: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    lastAddress: text(),
    revokedAt: timestamp()
}, (t) => [index().on(t.listKey)])

export const serverlistKeys = pgTable("server_list_keys", {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    label: text(),
    tokenHash: text().notNull().unique(),
    createdAt: timestamp().notNull().defaultNow(),
    revokedAt: timestamp()
}, (t) => [index().on(t.userId)])

export const suppressions = pgTable("suppressions", {
    email: text().primaryKey(),
    reason: text().notNull(),
    createdAt: timestamp().notNull().defaultNow()
})
