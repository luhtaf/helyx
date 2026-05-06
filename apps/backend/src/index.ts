import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { config } from './config.js';
import { logger } from './logger.js';
import { typeDefs } from './schema/index.js';
import { resolvers } from './resolvers/index.js';
import { buildContext, type RequestContext } from './context.js';
import { closeDriver } from './db/neo4j.js';

async function main(): Promise<void> {
  const apollo = new ApolloServer<RequestContext>({
    typeDefs,
    resolvers,
    introspection: config.NODE_ENV !== 'production',
  });

  await apollo.start();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.use('/graphql', expressMiddleware(apollo, {
    context: async ({ req, res }) => buildContext(req, res),
  }));

  const port = config.BACKEND_PORT;
  const host = config.BACKEND_HOST;

  app.listen(port, host, () => {
    logger.info({ port, host }, `helyx backend listening at http://${host}:${port}/graphql`);
  });
}

main().catch((err) => {
  logger.fatal({ err: String(err) }, 'boot failed');
  process.exit(1);
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down');
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
