import { expect, test } from 'vitest';
import { app } from '../app';
import request from 'supertest';

test('GET /health should return status ok', async () => {
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    status: 'ok',
    service: 'cloud-job-processor'
  });
})

test('GET /api/jobs should return an empty array when no jobs exist', async () => {
  const response = await request(app).get('/api/jobs');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
})


