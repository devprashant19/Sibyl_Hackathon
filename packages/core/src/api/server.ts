import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { WebhookWorker } from './webhook-worker';
import * as crypto from 'crypto';

export async function startServer() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // 1. REST API (Version 1)
  const v1Router = express.Router();
  
  v1Router.get('/runs', (req, res) => {
    // Stub: Fetch runs from orchestrator
    res.json({ data: [] });
  });

  v1Router.post('/runs', (req, res) => {
    // Stub: Trigger a new run
    res.json({ id: crypto.randomUUID(), status: 'queued' });
  });

  app.use('/api/v1', v1Router);

  // 2. Webhook Engine
  const webhookWorker = new WebhookWorker();
  webhookWorker.registerSubscription({
    id: 'sub_1',
    url: 'http://localhost:9999/test-webhook',
    secret: 'my-super-secret-key',
    eventTypes: ['*']
  });

  // Example trigger for testing
  app.post('/api/v1/test-webhook', (req, res) => {
    webhookWorker.dispatch({
      eventId: crypto.randomUUID(),
      eventType: 'promise.failed',
      timestamp: new Date().toISOString(),
      data: { runId: 'run_123', promiseId: 'p_1' }
    });
    res.json({ status: 'dispatched' });
  });

  // 3. GraphQL Endpoint
  const typeDefs = `
    type CapturedEvent {
      id: ID!
      domain: String!
      type: String!
      timestamp: String!
      payloadS3Key: String
    }

    type PromiseResult {
      id: ID!
      status: String!
      severity: String!
      description: String
    }

    type SimulationRun {
      id: ID!
      status: String!
      events: [CapturedEvent!]!
      promises: [PromiseResult!]!
    }

    type Query {
      runs: [SimulationRun!]!
      run(id: ID!): SimulationRun
    }
  `;

  const resolvers = {
    Query: {
      runs: () => [],
      run: (_: any, args: { id: string }) => ({
        id: args.id,
        status: 'COMPLETED',
        events: [],
        promises: []
      }),
    },
  };

  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await apolloServer.start();

  app.use('/graphql', expressMiddleware(apolloServer));

  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`🚀 API REST v1 ready at http://localhost:${port}/api/v1`);
    console.log(`🚀 GraphQL ready at http://localhost:${port}/graphql`);
  });
}

// If run directly
if (require.main === module) {
  startServer().catch(console.error);
}
