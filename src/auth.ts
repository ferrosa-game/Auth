import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { loginCodes, sessions, suppressions, usersTable } from './db/schema.js';
import crypto from 'crypto';
import db from './db.js'
import resend, { hasMailServer } from './email.js';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { hashToken } from './tokens.js';

export const authRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
    fastify.post("/auth/login", {
        schema: {
            body: Type.Object({
                email: Type.String({ format: 'email', maxLength: 254 })
            }, { additionalProperties: false })
        },
        config: { rateLimit: { max: 5, timeWindow: '15 minutes' } }
    }, async (req, res) => {
        const email = req.body.email.toLowerCase();
        const [blocked] = await db.select().from(suppressions).where(eq(suppressions.email, email));

        if (blocked) {
            return res.code(401).send();
        }

        if (!(await hasMailServer(email))) {
            throw Object.assign(new Error('address does not have mail server'), { statusCode: 400 });
        }

        await sendLoginCode(req.body.email.toLowerCase());

        return res.code(204).send();
    })

    fastify.post("/auth/verify", {
        schema: {
            body: Type.Object({
                email: Type.String({ format: 'email', maxLength: 254 }),
                code: Type.Number({ maximum: 999999, minimum: 100000 })
            }, { additionalProperties: false })
        }
    }, async (req, res) => {
        let email = req.body.email.toLowerCase();
        let code = req.body.code;

        const session = await verifyLoginCode(email, code.toString());

        if (!session) {
            return res.code(401).send();
        }

        return res.code(200).send(session);
    })

    fastify.get("/auth/me", async (req, res) => {
        const user = await requireUser(req);

        return res.code(200).send({ email: user.email });
    })

    fastify.post("/auth/logout", async (req, res) => {
        const token = bearer(req);

        if (!token) {
            return res.code(401).send();
        }

        await db.update(sessions)
            .set({ revokedAt: new Date() })
            .where(eq(sessions.tokenHash, hashToken(token)));

        return res.code(204).send();
    })
}


async function sendLoginCode(email: string): Promise<typeof loginCodes.$inferSelect | undefined> {
    let code = crypto.randomInt(100000, 1000000).toString();

    const [row] = await db.insert(loginCodes)
        .values({ email, code })
        .onConflictDoUpdate({
            target: loginCodes.email,
            set: { code, createdAt: new Date(), attempts: 0 },
            setWhere: lt(loginCodes.createdAt, new Date(Date.now() - 60_000))
        })
        .returning();

    if (!row) {
        return;
    }

    await resend.emails.send({
        from: 'auth@playferrosa.com',
        to: email,
        subject: 'Ferrosa login code',
        text: `Here is your authentication code: ${code}`
    });

    return row;
}

async function verifyLoginCode(email: string, code: string) {
    const result = await db.transaction(async (tx) => {
        const [consumed] = await tx.delete(loginCodes)
            .where(and(
                eq(loginCodes.email, email),
                eq(loginCodes.code, code),
                lt(loginCodes.attempts, 5),
                gt(loginCodes.createdAt, new Date(Date.now() - 15 * 60_000))
            ))
            .returning();

        if (!consumed) {
            return undefined;
        }

        const [user] = await tx.insert(usersTable)
            .values({ email })
            .onConflictDoUpdate({ target: usersTable.email, set: { email } })
            .returning({
                id: usersTable.id,
                created: sql<boolean>`xmax = 0`,
                bannedUntil: usersTable.bannedUntil
            });

        if (!user) {
            throw new Error('user upsert returned no row');
        }

        if (user.bannedUntil && user.bannedUntil > new Date()) {
            throw Object.assign(new Error('banned'), { statusCode: 403 })
        }

        const token = crypto.randomBytes(32).toString('base64url');

        await tx.insert(sessions).values({
            userId: user.id,
            tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000)
        });

        return { token, created: user.created }
    });

    if (!result) {
        await db.update(loginCodes)
            .set({ attempts: sql`${loginCodes.attempts} + 1` })
            .where(eq(loginCodes.email, email));
    }

    return result;
}

export function bearer(req: FastifyRequest) {
    const header = req.headers.authorization;

    if (!header) {
        return undefined;
    }

    const [scheme, ...rest] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer') {
        return undefined
    }

    const token = rest.join(' ').trim();

    return token.length > 0 ? token : undefined;
}

export async function requireUser(req: FastifyRequest) {
    const token = bearer(req);

    if (!token) {
        throw Object.assign(new Error('no session token'), { statusCode: 401 });
    }

    const [row] = await db.select({
        sessionId: sessions.id,
        userId: usersTable.id,
        email: usersTable.email,
        bannedUntil: usersTable.bannedUntil,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt
    })
        .from(sessions)
        .innerJoin(usersTable, eq(sessions.userId, usersTable.id))
        .where(eq(sessions.tokenHash, hashToken(token)));

    if (!row || row.revokedAt || row.expiresAt < new Date()) {
        throw Object.assign(new Error('bad session token'), { statusCode: 401 });
    }

    if (row.bannedUntil && row.bannedUntil > new Date()) {
        throw Object.assign(new Error('banned'), { statusCode: 403 });
    }

    await db.update(sessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(sessions.id, row.sessionId));

    return { userId: row.userId, email: row.email };
}
