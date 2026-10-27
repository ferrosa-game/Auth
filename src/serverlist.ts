import {
  Type,
  type FastifyPluginAsyncTypebox,
} from "@fastify/type-provider-typebox";

const serverRegistration = Type.Object({
  port: Type.Number({ minimum: 0, maximum: 65535 }),
  name: Type.String({ maxLength: 63, minLength: 3 }),
  version: Type.String({ maxLength: 32 }),
  mode: Type.String(),
  client_mode: Type.Union([
    Type.Literal("driving"),
    Type.Literal("racing"),
    Type.Literal("round"),
    Type.Literal("world"),
    Type.Literal("eliminator"),
    Type.Literal("coop"),
    Type.Literal("versus"),
    Type.Literal("none"),
  ]),
  map: Type.String(),
  players: Type.Integer({ minimum: 0, maximum: 255 }),
  max_players: Type.Integer({ minimum: 0, maximum: 255 }),
  password: Type.Boolean(),
  voice_chat: Type.Boolean(),
}, { additionalProperties: false });

export const serverlistRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post("/serverlist/register", { schema: { body: serverRegistration } }, async (req, reply) => {

  });
};
