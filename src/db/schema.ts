import { pgTable, timestamp, uuid, text, integer } from "drizzle-orm/pg-core";

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
    ownerId: uuid().notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    label: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    lastAddress: text(),
    revokedAt: timestamp()
})

export const suppressions = pgTable("suppressions", {
    email: text().primaryKey(),
    reason: text().notNull(),
    createdAt: timestamp().notNull().defaultNow()
})
