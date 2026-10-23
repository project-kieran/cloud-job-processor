import { afterEach, beforeEach, expect, test, vi } from "vitest";
import request from "supertest";

let app: typeof import("../app").app;

beforeEach(async () => {
  // Routes own the in-memory repository, so reload them for each test.
  vi.resetModules();
  vi.stubEnv("USE_SQS", "false");
  vi.stubEnv("QUEUE_URL", undefined);
  vi.stubEnv("DLQ_URL", undefined);
  ({ app } = await import("../app"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("GET /health should return status ok", async () => {
  const response = await request(app).get("/health");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    status: "ok",
    service: "cloud-job-processor",
  });
});

test("GET /api/jobs should return an empty list when no jobs exist", async () => {
  const response = await request(app).get("/api/jobs");

  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
});

test("POST /api/jobs should create a new job", async () => {
  const response = await request(app)
    .post("/api/jobs")
    .send({
      type: "CRAWL_URL",
      payload: {
        url: "https://example.com",
      },
    });
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({
    type: "CRAWL_URL",
    payload: {
      url: "https://example.com",
    },
    status: "PENDING",
  });
  expect(response.body).toHaveProperty("id");
  expect(response.body).toHaveProperty("createdAt");
  expect(response.body).toHaveProperty("updatedAt");
  expect(response.body.id).toEqual(expect.any(String));
  expect(response.body.id.length).toBeGreaterThan(0);
  expect(new Date(response.body.createdAt).toISOString()).toBe(
    response.body.createdAt,
  );
  expect(response.body.updatedAt).toBe(response.body.createdAt);
});

test("GET /api/jobs/:id should return the created job", async () => {
  // First, create a job
  const createResponse = await request(app)
    .post("/api/jobs")
    .send({
      type: "CRAWL_URL",
      payload: {
        url: "https://example.com",
      },
    });
  const jobId = createResponse.body.id;
  expect(createResponse.status).toBe(201);

  // Now, retrieve the job by ID
  const getResponse = await request(app).get(`/api/jobs/${jobId}`);
  expect(getResponse.status).toBe(200);
  expect(getResponse.body).toMatchObject({
    id: jobId,
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
    status: "PENDING",
  });
});

test("GET /api/jobs/:id should return 404 for non-existent job", async () => {
  const response = await request(app).get("/api/jobs/non-existent-id");
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: "Job not found" });
});

test("POST /api/jobs should return 400 for invalid request", async () => {
  const response = await request(app).post("/api/jobs").send({
    type: "",
    payload: null,
  });
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: "Job type is required" });
});

test.each([
  ["missing", undefined],
  ["null", null],
  ["string", "invalid"],
  ["number", 123],
  ["boolean", false],
])("POST /api/jobs should reject a %s payload", async (_label, payload) => {
  const response = await request(app).post("/api/jobs").send({
    type: "CRAWL_URL",
    payload,
  });
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: "Job payload is required" });

  const listResponse = await request(app).get("/api/jobs");
  expect(listResponse.status).toBe(200);
  expect(listResponse.body).toEqual([]);
});

test.each([
  ["missing", undefined],
  ["null", null],
  ["empty", ""],
  ["number", 123],
  ["boolean", true],
  ["object", {}],
  ["array", []],
])("POST /api/jobs should reject a %s type", async (_label, type) => {
  const response = await request(app)
    .post("/api/jobs")
    .send({
      type,
      payload: { url: "https://example.com" },
    });
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: "Job type is required" });

  const listResponse = await request(app).get("/api/jobs");
  expect(listResponse.status).toBe(200);
  expect(listResponse.body).toEqual([]);
});

test("POST /api/jobs should reject a missing request body", async () => {
  const response = await request(app).post("/api/jobs");
  expect(response.status).toBe(400);
});

test("POST /api/jobs should reject malformed JSON", async () => {
  const response = await request(app)
    .post("/api/jobs")
    .set("Content-Type", "application/json")
    .send('{"type":"CRAWL_URL","payload":');

  expect(response.status).toBe(400);
  const listResponse = await request(app).get("/api/jobs");
  expect(listResponse.status).toBe(200);
  expect(listResponse.body).toEqual([]);
});

test("GET /api/jobs should return all created jobs with distinct IDs", async () => {
  const jobs = [];
  for (const url of [
    "https://example.com/first",
    "https://example.com/second",
  ]) {
    const response = await request(app)
      .post("/api/jobs")
      .send({ type: "CRAWL_URL", payload: { url } });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      type: "CRAWL_URL",
      payload: { url },
      status: "PENDING",
    });
    jobs.push(response.body);
  }

  expect(jobs[0].id).not.toBe(jobs[1].id);

  const response = await request(app).get("/api/jobs");
  expect(response.status).toBe(200);
  expect(response.body).toHaveLength(2);
  expect(response.body).toEqual(expect.arrayContaining(jobs));
});
