import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import 'dotenv/config';
import { Resend } from 'resend';
import { Webhook } from 'svix';
import db from './db.js';
import { suppressions } from './db/schema.js';
import { Resolver } from 'node:dns/promises';

export default new Resend(process.env.RESEND_KEY!);

export const webhookRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
    fastify.removeAllContentTypeParsers();
    fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body))

    fastify.post("/webhooks/resend", async (req, res) => {
        const raw = req.body as string;

        try {
            new Webhook(process.env.RESEND_WEBHOOK_SECRET!).verify(raw, req.headers as Record<string, string>);
        } catch {
            throw Object.assign(new Error('bad sig'), { statusCode: 400 })
        }

        const event = JSON.parse(raw) as { type: string; data?: { to?: string[] } }
        const email = event.data?.to?.[0]?.toLowerCase()

        if ((event.type == 'email.bounced' || event.type == 'email.complained') && email) {
            await db.insert(suppressions).values({ email, reason: event.type }).onConflictDoUpdate({ target: suppressions.email, set: { reason: event.type } })
        }

        return res.code(204).send()
    });
}

const resolver = new Resolver({ timeout: 2000, tries: 2 });
const cache = new Map<string, { ok: boolean, until: number }>();

export async function hasMailServer(email: string) {
    const domain = email.slice(email.lastIndexOf('@') + 1);
    const hit = cache.get(domain);

    if (hit && hit.until > Date.now()) {
        return hit.ok;
    }

    let ok = true;

    try {
        ok = (await resolver.resolveMx(domain)).length > 0;
    } catch (e: any) {
        ok = e.code !== 'ENOTFOUND' && e.code !== 'ENODATA';
    }

    cache.set(domain, { ok, until: Date.now() + (ok ? 3600_000 : 300_000) });

    return ok;
}