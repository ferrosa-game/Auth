import { Type, type Static, type FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { and, eq, isNull } from "drizzle-orm";
import { bearer, requireUser } from "./auth.js";
import db from "./db.js";
import { serverlistKeys } from "./db/schema.js";
import { hashToken, newToken } from "./tokens.js";

const MAX_KEYS_PER_USER = 10;

const serverRegistration = Type.Object({
    port: Type.Integer({ minimum: 1, maximum: 65535 }),
    name: Type.String({ maxLength: 63, minLength: 3 }),
    version: Type.String({ maxLength: 32 }),
    mode: Type.String({ maxLength: 32 }),
    client_mode: Type.Union([
        Type.Literal("driving"),
        Type.Literal("racing"),
        Type.Literal("round"),
        Type.Literal("world"),
        Type.Literal("eliminator"),
        Type.Literal("coop"),
        Type.Literal("versus"),
        Type.Literal("none")
    ]),
    map: Type.String({ maxLength: 64 }),
    players: Type.Integer({ minimum: 0, maximum: 255 }),
    max_players: Type.Integer({ minimum: 0, maximum: 255 }),
    password: Type.Boolean(),
    voice_chat: Type.Boolean()
}, { additionalProperties: false });

type Listing = Static<typeof serverRegistration> & {
    keyId: string;
    address: string;
    lastSeen: number;
};

const serverlistCache = new Map<string, Listing>();

function dropListingsFor(keyId: string) {
    for (const [cacheKey, listing] of serverlistCache) {
        if (listing.keyId === keyId) {
            serverlistCache.delete(cacheKey);
        }
    }
}

export const serverlistRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
    fastify.post("/serverlist/keys", {
        schema: {
            body: Type.Object({
                label: Type.String({ maxLength: 64, minLength: 1 })
            }, { additionalProperties: false })
        }
    }, async (req, res) => {
        const user = await requireUser(req);

        const existing = await db.select({ id: serverlistKeys.id })
            .from(serverlistKeys)
            .where(and(eq(serverlistKeys.userId, user.userId), isNull(serverlistKeys.revokedAt)));

        if (existing.length >= MAX_KEYS_PER_USER) {
            throw Object.assign(new Error('too many keys, revoke one first'), { statusCode: 409 });
        }

        const token = newToken();

        const [created] = await db.insert(serverlistKeys)
            .values({ userId: user.userId, label: req.body.label, tokenHash: hashToken(token) })
            .returning({ id: serverlistKeys.id, label: serverlistKeys.label, createdAt: serverlistKeys.createdAt });

        return res.code(201).send({ ...created, token });
    });

    fastify.get("/serverlist/keys", async (req, res) => {
        const user = await requireUser(req);

        const keys = await db.select({
            id: serverlistKeys.id,
            label: serverlistKeys.label,
            createdAt: serverlistKeys.createdAt,
            revokedAt: serverlistKeys.revokedAt
        })
            .from(serverlistKeys)
            .where(eq(serverlistKeys.userId, user.userId));

        const live = [...serverlistCache.values()];

        return res.code(200).send(keys.map((key) => ({
            ...key,
            servers: live.filter((listing) => listing.keyId === key.id).length
        })));
    });

    fastify.delete("/serverlist/keys/:id", {
        schema: {
            params: Type.Object({ id: Type.String({ format: 'uuid' }) })
        }
    }, async (req, res) => {
        const user = await requireUser(req);

        const [revoked] = await db.update(serverlistKeys)
            .set({ revokedAt: new Date() })
            .where(and(
                eq(serverlistKeys.id, req.params.id),
                eq(serverlistKeys.userId, user.userId),
                isNull(serverlistKeys.revokedAt)
            ))
            .returning({ id: serverlistKeys.id });

        if (!revoked) {
            throw Object.assign(new Error('no such key'), { statusCode: 404 });
        }

        dropListingsFor(revoked.id);

        return res.code(204).send();
    });

    fastify.post("/serverlist/register", { schema: { body: serverRegistration } }, async (req, res) => {
        const key = bearer(req);

        if (!key) {
            throw Object.assign(new Error('No serverlist key, please provide it as a Bearer token!'), { statusCode: 401 });
        }

        const [listToken] = await db.select().from(serverlistKeys).where(eq(serverlistKeys.tokenHash, hashToken(key)));

        if (!listToken || listToken.revokedAt) {
            throw Object.assign(new Error('Bad serverlist key, you need to make one in the launcher!'), { statusCode: 401 });
        }

        serverlistCache.set(`${listToken.id}:${req.ip}:${req.body.port}`, {
            ...req.body,
            keyId: listToken.id,
            address: req.ip,
            lastSeen: Date.now()
        });

        return res.code(204).send();
    });

    fastify.get("/serverlist", async () => {
        const cutoff = Date.now() - 90_000;

        return [...serverlistCache.values()]
            .filter((listing) => listing.lastSeen > cutoff)
            .map(({ keyId, lastSeen, ...listing }) => ({ ...listing, stale_for: Math.round((Date.now() - lastSeen) / 1000) }));
    });
};
