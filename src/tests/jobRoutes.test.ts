import { afterEach, beforeEach, expect, test, vi } from "vitest";
import request from "supertest";

const { send, createClient } = vi.hoisted(() => ({
  send: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@aws-sdk/client-sqs", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@aws-sdk/client-sqs")>();
  return {
    ...sdk,
    SQSClient: class {
      send = send;
      constructor(config: unknown) {
        createClient(config);
      }
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  send.mockReset().mockResolvedValue({});
  vi.stubEnv("USE_SQS", "true");
  vi.stubEnv("AWS_REGION", "eu-west-2");
  vi.stubEnv("QUEUE_URL", "https://sqs.example.com/jobs");
  vi.stubEnv("DLQ_URL", "https://sqs.example.com/dead-letter");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test.each([undefined, "false"])(
  "local mode (%s) needs no AWS configuration and shares its queue with the worker",
  async (mode) => {
    vi.stubEnv("USE_SQS", mode);
    vi.stubEnv("AWS_REGION", undefined);
    vi.stubEnv("QUEUE_URL", undefined);
    vi.stubEnv("DLQ_URL", undefined);
    const { app } = await import("../app");
    const { jobWorker } = await import("../routes/jobRoutes");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const created = await request(app)
      .post("/api/jobs")
      .send({
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
      });
    expect(created.status).toBe(201);
    await jobWorker.processNextJob();
    const retrieved = await request(app).get(`/api/jobs/${created.body.id}`);
    expect(retrieved.body).toMatchObject({ status: "COMPLETED", attempts: 1 });
    expect(createClient).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  },
);

test.each([
  [undefined, undefined],
  [undefined, "https://sqs.example.com/dead-letter"],
  ["https://sqs.example.com/jobs", undefined],
  ["", "https://sqs.example.com/dead-letter"],
  ["https://sqs.example.com/jobs", ""],
])("SQS mode rejects missing queue URLs (%s, %s)", async (queueUrl, dlqUrl) => {
  vi.stubEnv("QUEUE_URL", queueUrl);
  vi.stubEnv("DLQ_URL", dlqUrl);
  await expect(import("../app")).rejects.toThrow(
    "QUEUE_URL and DLQ_URL must be set when using SQS",
  );
  expect(createClient).not.toHaveBeenCalled();
});

test("SQS mode wires submission, processing and acknowledgement to the main queue", async () => {
  const { app } = await import("../app");
  const { jobWorker } = await import("../routes/jobRoutes");
  expect(createClient).toHaveBeenCalledExactlyOnceWith({ region: "eu-west-2" });
  const created = await request(app)
    .post("/api/jobs")
    .send({
      type: "CRAWL_URL",
      payload: { url: "https://example.com" },
    });
  expect(created.status).toBe(201);
  expect(send.mock.calls[0][0].input).toEqual({
    QueueUrl: "https://sqs.example.com/jobs",
    MessageBody: created.body.id,
  });
  send.mockResolvedValueOnce({
    Messages: [{ Body: created.body.id, ReceiptHandle: "receipt-1" }],
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  await jobWorker.processNextJob();
  expect(send).toHaveBeenCalledTimes(3);
  expect(send.mock.calls[1][0].input.QueueUrl).toBe(
    "https://sqs.example.com/jobs",
  );
  expect(send.mock.calls[2][0].input).toEqual({
    QueueUrl: "https://sqs.example.com/jobs",
    ReceiptHandle: "receipt-1",
  });
  const retrieved = await request(app).get(`/api/jobs/${created.body.id}`);
  expect(retrieved.body).toMatchObject({ status: "COMPLETED", attempts: 1 });
});

test("SQS mode forwards unknown jobs to the configured dead-letter queue before acknowledging", async () => {
  const { jobWorker } = await import("../routes/jobRoutes");
  send.mockResolvedValueOnce({
    Messages: [{ Body: "unknown-job", ReceiptHandle: "receipt-1" }],
  });
  await jobWorker.processNextJob();
  expect(send).toHaveBeenCalledTimes(3);
  expect(send.mock.calls[1][0].input).toEqual({
    QueueUrl: "https://sqs.example.com/dead-letter",
    MessageBody: "unknown-job",
  });
  expect(send.mock.calls[2][0].input).toEqual({
    QueueUrl: "https://sqs.example.com/jobs",
    ReceiptHandle: "receipt-1",
  });
});
