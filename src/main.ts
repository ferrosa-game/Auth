import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { registerError } from './error.js';
import { authRoutes } from './auth.js';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { serverlistRoutes } from './serverlist.js';

const fastify = Fastify({
    logger: true
}).withTypeProvider<TypeBoxTypeProvider>();

//registerError(fastify)
fastify.register(rateLimit, { max: 60, timeWindow: '1 minute' });
fastify.register(authRoutes)
fastify.register(serverlistRoutes)

if (new Date().getTimezoneOffset() !== 0) {
    throw new Error('Run with TZ=UTC so dates match the database');
}

fastify.listen({
    port: 1841
});