import { expect, test } from "vitest";
import { app } from "../app";
import request from "supertest";

test("GET /health should return status ok", async () => {
  const response = await request(app).get("/health");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    status: "ok",
    service: "cloud-job-processor",
  });
});

test("GET /api/jobs should return a list", async () => {
  const response = await request(app).get("/api/jobs");

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
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
