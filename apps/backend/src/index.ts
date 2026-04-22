import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { config } from './config.js';
import { logger } from './logger.js';
import { typeDefs } from './schema/index.js';
import { resolvers } from './resolvers/index.js';
import { buildContext, type RequestContext } from './context.js';
import { closeDriver } from './db/neo4j.js';

const server = new ApolloServer<RequestContext>({
  typeDefs,
  resolvers,
  introspection: config.NODE_ENV !== 'production',
});

const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => buildContext(req),
  listen: { host: config.BACKEND_HOST, port: config.BACKEND_PORT },
});

logger.info(`helyx backend listening at ${url}`);

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  await server.stop();
  await closeDriver();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
