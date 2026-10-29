import { Type, type Static, type FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { eq } from "drizzle-orm";
import { bearer } from "./auth.js";
import db from "./db.js";
import { serverlistKeys } from "./db/schema.js";
import { hashToken } from "./tokens.js";

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

export const serverlistRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
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
