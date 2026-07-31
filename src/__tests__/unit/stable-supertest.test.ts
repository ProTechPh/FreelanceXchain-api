import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';

describe('stable Supertest adapter', () => {
  it('routes sequential requests to the intended Express app', async () => {
    const firstApp = express();
    const secondApp = express();
    firstApp.get('/value', (_req, res) => res.status(200).json({ app: 'first' }));
    secondApp.get('/value', (_req, res) => res.status(201).json({ app: 'second' }));

    for (let index = 0; index < 100; index += 1) {
      const app = index % 2 === 0 ? firstApp : secondApp;
      const response = await request(app).get('/value');

      expect(response.status).toBe(index % 2 === 0 ? 200 : 201);
      expect(response.body.app).toBe(index % 2 === 0 ? 'first' : 'second');
    }
  });

  it('preserves the original request URL and removes its routing header', async () => {
    const app = express();
    app.get('/path', (req, res) => {
      res.json({
        header: req.headers['x-freelancexchain-test-app'],
        query: req.query.value,
        url: req.url,
      });
    });

    const response = await request(app).get('/path?value=kept');

    expect(response.body).toEqual({
      query: 'kept',
      url: '/path?value=kept',
    });
  });
});
