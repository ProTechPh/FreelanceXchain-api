import { beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../../app.js';

describe('retired public APIs', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  it('does not expose the retired crypto news API', async () => {
    const response = await request(app).get('/api/crypto-news/news?limit=0');

    expect(response.status).toBe(404);
    expect(response.body.error?.code).toBe('NOT_FOUND');
  });
});
