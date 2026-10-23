import { afterEach, expect, test, vi } from "vitest";
import { JobService } from "../services/jobService";
import { JobWorker } from "../services/jobWorker";
import { JobRepository } from "../repositories/jobRepository";
import { InMemoryJobQueue } from "../queues/InMemoryJobQueue";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Job processing should isolate dead-lettered jobs and continue processing the main queue", async () => {
  const repository = new JobRepository();
  const queue = new InMemoryJobQueue();
  const deadLetterQueue = new InMemoryJobQueue();
  const service = new JobService(repository, queue);
  const worker = new JobWorker(repository, queue, deadLetterQueue);
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const invalidJob = await service.createJob({
    type: "UNSUPPORTED",
    payload: {},
  });
  const validJob = await service.createJob({
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
  });

  await worker.processNextJob();
  expect(await service.getJob(invalidJob.id)).toMatchObject({
    status: "FAILED",
    attempts: 1,
  });
  expect(fetchMock).not.toHaveBeenCalled();

  await worker.processNextJob();
  await worker.processNextJob();

  expect(await service.getJob(validJob.id)).toMatchObject({
    status: "COMPLETED",
    attempts: 1,
  });
  expect(await service.getJob(invalidJob.id)).toMatchObject({
    status: "FAILED",
    attempts: 1,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(queue.receive()).resolves.toBeUndefined();
  const message = await deadLetterQueue.receive();
  expect(message).toEqual({
    jobId: invalidJob.id,
    receiptHandle: expect.any(String),
  });
  await deadLetterQueue.acknowledge(message!.receiptHandle);
  await expect(deadLetterQueue.receive()).resolves.toBeUndefined();
});

test("Job processing should make created job retrievable with COMPLETED status", async () => {
  const repository = new JobRepository();
  const queue = new InMemoryJobQueue();
  const deadLetterQueue = new InMemoryJobQueue();
  const service = new JobService(repository, queue);
  const worker = new JobWorker(repository, queue, deadLetterQueue);

  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const request = {
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
  };

  const createdJob = await service.createJob(request);
  expect(createdJob.status).toBe("PENDING");

  await worker.processNextJob();

  const processedJob = await service.getJob(createdJob.id);
  expect(processedJob).toMatchObject({
    id: createdJob.id,
    type: request.type,
    payload: request.payload,
    status: "COMPLETED",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(request.payload.url, {
    signal: expect.any(AbortSignal),
  });
  await expect(deadLetterQueue.receive()).resolves.toBeUndefined();
});

test("Job processing should mark a job FAILED after exhausting retries for HTTP 500", async () => {
  const repository = new JobRepository();
  const queue = new InMemoryJobQueue();
  const deadLetterQueue = new InMemoryJobQueue();
  const service = new JobService(repository, queue);
  const worker = new JobWorker(repository, queue, deadLetterQueue);

  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    statusText: "Internal Server Error",
  });
  vi.stubGlobal("fetch", fetchMock);
  const request = {
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
  };

  const createdJob = await service.createJob(request);
  expect(createdJob.status).toBe("PENDING");
  // The first two failures requeue the job for another attempt.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await worker.processNextJob();
    expect(await service.getJob(createdJob.id)).toMatchObject({
      id: createdJob.id,
      status: "PENDING",
      attempts: attempt,
    });
  }

  await worker.processNextJob();

  const processedJob = await service.getJob(createdJob.id);
  expect(processedJob).toMatchObject({
    id: createdJob.id,
    type: request.type,
    payload: request.payload,
    status: "FAILED",
    attempts: 3,
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenCalledWith(request.payload.url, {
    signal: expect.any(AbortSignal),
  });

  // Exhausted jobs must not be left queued for a fourth attempt.
  await worker.processNextJob();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(await service.getJob(createdJob.id)).toMatchObject({
    status: "FAILED",
    attempts: 3,
  });
  const message = await deadLetterQueue.receive();
  expect(message).toEqual({
    jobId: createdJob.id,
    receiptHandle: expect.any(String),
  });
  await deadLetterQueue.acknowledge(message!.receiptHandle);
  await expect(deadLetterQueue.receive()).resolves.toBeUndefined();
});

test("Job processing should process jobs in submission order", async () => {
  const repository = new JobRepository();
  const queue = new InMemoryJobQueue();
  const deadLetterQueue = new InMemoryJobQueue();
  const service = new JobService(repository, queue);
  const worker = new JobWorker(repository, queue, deadLetterQueue);

  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);

  const firstRequest = {
    type: "CRAWL_URL",
    payload: { url: "https://example.com/first" },
  };
  const secondRequest = {
    type: "CRAWL_URL",
    payload: { url: "https://example.com/second" },
  };

  const firstJob = await service.createJob(firstRequest);
  const secondJob = await service.createJob(secondRequest);
  await worker.processNextJob();

  const firstProcessedJob = await service.getJob(firstJob.id);
  const secondProcessedJob = await service.getJob(secondJob.id);

  expect(firstProcessedJob).toMatchObject({
    id: firstJob.id,
    status: "COMPLETED",
  });
  expect(secondProcessedJob).toMatchObject({
    id: secondJob.id,
    status: "PENDING",
  });

  await worker.processNextJob();

  const completedSecondJob = await service.getJob(secondJob.id);
  expect(completedSecondJob).toMatchObject({
    id: secondJob.id,
    status: "COMPLETED",
  });
  expect(fetchMock).toHaveBeenNthCalledWith(1, firstRequest.payload.url, {
    signal: expect.any(AbortSignal),
  });
  expect(fetchMock).toHaveBeenNthCalledWith(2, secondRequest.payload.url, {
    signal: expect.any(AbortSignal),
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await expect(deadLetterQueue.receive()).resolves.toBeUndefined();
});

test("Job processing should store a job before consumer can process queued ID", async () => {
  const repository = new JobRepository();
  const queue = new InMemoryJobQueue();
  const deadLetterQueue = new InMemoryJobQueue();
  const service = new JobService(repository, queue);
  const worker = new JobWorker(repository, queue, deadLetterQueue);

  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);

  const originalEnqueue = queue.enqueue.bind(queue);
  vi.spyOn(queue, "enqueue").mockImplementation(async (jobId) => {
    await originalEnqueue(jobId);
    await worker.processNextJob();
  });

  const request = {
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
  };

  const creationPromise = service.createJob(request);
  await expect(creationPromise).resolves.toMatchObject({
    type: request.type,
    payload: request.payload,
  });
  const createdJob = await creationPromise;

  const processedJob = await service.getJob(createdJob.id);
  expect(processedJob).toMatchObject({
    id: createdJob.id,
    status: "COMPLETED",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(request.payload.url, {
    signal: expect.any(AbortSignal),
  });
  await expect(deadLetterQueue.receive()).resolves.toBeUndefined();
});
