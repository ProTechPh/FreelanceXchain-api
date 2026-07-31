import { createRequire } from 'node:module';
import { createServer, type RequestListener, type Server } from 'node:http';
import type requestType from 'supertest';

const require = createRequire(import.meta.url);
const request = require('supertest/index.js') as typeof requestType;

const APP_HEADER = 'x-freelancexchain-test-app';
const STATE_KEY = '__freelancexchainStableSupertest';

/**
 * Supertest normally creates and closes an ephemeral HTTP server for every
 * request. This suite makes enough requests to recycle those listener ports
 * and intermittently connect a request to the wrong short-lived server.
 * Route all Express apps through one explicitly managed server instead.
 */
interface StableSupertestState {
  apps: Map<string, RequestListener>;
  nextAppId: number;
  server: Server;
  startPromise: Promise<void> | undefined;
}

type TestGlobal = typeof globalThis & {
  [STATE_KEY]?: StableSupertestState;
};

const testGlobal = globalThis as TestGlobal;

function getState(): StableSupertestState {
  if (testGlobal[STATE_KEY]) {
    return testGlobal[STATE_KEY];
  }

  const apps = new Map<string, RequestListener>();
  const server = createServer((req, res) => {
    const header = req.headers[APP_HEADER];
    const appId = Array.isArray(header) ? header[0] : header;
    const app = appId ? apps.get(appId) : undefined;

    delete req.headers[APP_HEADER];

    if (!app) {
      res.statusCode = 500;
      res.end('Stable Supertest adapter could not resolve the target app');
      return;
    }

    app(req, res);
  });

  const state: StableSupertestState = {
    apps,
    nextAppId: 0,
    server,
    startPromise: undefined,
  };
  testGlobal[STATE_KEY] = state;
  return state;
}

export async function startStableSupertestServer(): Promise<void> {
  const state = getState();
  if (state.server.listening) {
    return;
  }
  if (state.startPromise) {
    return state.startPromise;
  }

  state.startPromise = new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      state.server.off('listening', handleListening);
      state.startPromise = undefined;
      reject(error);
    };
    const handleListening = () => {
      state.server.off('error', handleError);
      resolve();
    };

    state.server.once('error', handleError);
    state.server.once('listening', handleListening);
    state.server.listen(0, '127.0.0.1');
  });

  return state.startPromise;
}

export async function stopStableSupertestServer(): Promise<void> {
  const state = getState();
  state.apps.clear();
  state.nextAppId = 0;
  state.startPromise = undefined;

  if (!state.server.listening) {
    return;
  }

  state.server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    state.server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function routeRequestToApp(app: RequestListener, options?: Parameters<typeof request>[1]) {
  const state = getState();
  if (!state.server.listening) {
    throw new Error('Stable Supertest server has not been started by Jest setup');
  }

  const baseRequest = request(state.server, options);
  return new Proxy(baseRequest, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) => {
        const test = value.apply(target, args);
        const appId = String(++state.nextAppId);
        state.apps.set(appId, app);
        test.set(APP_HEADER, appId);

        const cleanup = () => state.apps.delete(appId);
        test.once('response', cleanup);
        test.once('error', cleanup);
        return test;
      };
    },
  });
}

const stableRequest = ((app: Parameters<typeof request>[0], options?: Parameters<typeof request>[1]) => {
  if (typeof app !== 'function') {
    return request(app, options);
  }
  return routeRequestToApp(app as RequestListener, options);
}) as typeof request;

Object.assign(stableRequest, request);

export default stableRequest;
