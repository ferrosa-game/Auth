import type { FastifyInstance } from 'fastify';
import { STATUS_CODES } from 'node:http';

export function registerError(fastify: FastifyInstance) {
    fastify.setErrorHandler((err: any, req, reply) => {
        const statusCode = err.statusCode ?? 500;

        if (statusCode >= 500) {
            req.log.error({err}, 'request failed');
        } else {
            req.log.warn({err}, 'request rejected');
        }

        return reply.code(statusCode).send({ statusCode, error: STATUS_CODES[statusCode] ?? 'Failed to process' })
    });

    fastify.setNotFoundHandler((req, reply) => {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found' })
    })
}