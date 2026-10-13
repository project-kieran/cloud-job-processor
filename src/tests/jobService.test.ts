import { JobService } from "../services/jobService";
import { afterEach, expect, test, vi } from "vitest";
import type { Job } from "../types/job";

afterEach(() => {
    vi.unstubAllGlobals();
});

test("JobService.createJob should return PENDING job with id, timestamps and payload", async () => {
    const jobRepositoryMock = {
        create: vi.fn().mockImplementation((job: Job) => job),
    };
    const jobQueueMock = {
        enqueue: vi.fn().mockImplementation((jobId) => Promise.resolve()),
    };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    const request = {
        type: "CRAWL_URL",
        payload: {
            url: "https://example.com",
        },
    };

    const job = await jobService.createJob(request);

    expect(job).toHaveProperty("id");
    expect(job).toHaveProperty("createdAt");
    expect(job).toHaveProperty("updatedAt");
    expect(job.type).toBe(request.type);
    expect(job.payload).toEqual(request.payload);
    expect(job.status).toBe("PENDING");
    expect(jobRepositoryMock.create).toHaveBeenCalledWith(job);
    expect(jobQueueMock.enqueue).toHaveBeenCalledWith(job.id);
});

test("JobService.createJob should enqueue the returned ID only once", async() => {
    const jobRepositoryMock = {
        create: vi.fn().mockImplementation((job: Job) => job),
    };
    const jobQueueMock = {
        enqueue: vi.fn().mockImplementation((jobId) => Promise.resolve()),
    };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    const request = {
        type: "CRAWL_URL",
        payload: {
            url: "https://example.com",
        },
    };

    const job = await jobService.createJob(request);

    expect(jobQueueMock.enqueue).toHaveBeenCalledTimes(1);
});

test("JobService.createJob should throw error for missing type", async () => {
    const jobRepositoryMock = {
        create: vi.fn().mockImplementation((job: Job) => job),
    };
    const jobQueueMock = {
        enqueue: vi.fn().mockImplementation((jobId) => Promise.resolve()),
    };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    const request = {
        payload: {
            url: "https://example.com",
        },
    };

    await expect(jobService.createJob(request as any)).rejects.toThrow("Job type is required");
});

test("JobService.createJob should throw error for empty type", async () => {
    const jobRepositoryMock = {
        create: vi.fn().mockImplementation((job: Job) => job),
    };
    const jobQueueMock = {
        enqueue: vi.fn().mockImplementation((jobId) => Promise.resolve()),
    };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    const request = {
        type: "",
        payload: {
            url: "https://example.com",
        },
    };
    await expect(jobService.createJob(request as any)).rejects.toThrow("Job type is required");
});

test("JobService.creatJob should throw error for type mismatch", async () => {
    const jobRepositoryMock = {
        create: vi.fn().mockImplementation((job: Job) => job),
    };
    const jobQueueMock = {
        enqueue: vi.fn().mockImplementation((jobId) => Promise.resolve()),
    };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    const request = {
        type: 123,
        payload: {
            url: "https://example.com",
        },
    };
    await expect(jobService.createJob(request as any)).rejects.toThrow("Job type is required");
});

test("JobService.createJob should throw error for missing payload", async () => {
    const jobRepositoryMock = {
        create: vi.fn().mockImplementation((job: Job) => job),
    };
    const jobQueueMock = {
        enqueue: vi.fn().mockImplementation((jobId) => Promise.resolve()),
    };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    const request = {
        type: "CRAWL_URL",
        payload: null,
    };
    await expect(jobService.createJob(request as any)).rejects.toThrow("Job payload is required");
});

test("JobService.createJob should throw error for primitive payload", async () => {
    const jobRepositoryMock = {
        create: vi.fn().mockImplementation((job: Job) => job),
    };
    const jobQueueMock = {
        enqueue: vi.fn().mockImplementation((jobId) => Promise.resolve()),
    };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);
    const request = {
        type: "CRAWL_URL",
        payload: "not an object",
    };
    await expect(jobService.createJob(request as any)).rejects.toThrow("Job payload is required");
});

test.each([
    ["missing request", undefined],
    ["missing type", { payload: {} }],
    ["empty type", { type: "", payload: {} }],
    ["non-string type", { type: 123, payload: {} }],
    ["missing payload", { type: "CRAWL_URL" }],
    ["null payload", { type: "CRAWL_URL", payload: null }],
    ["primitive payload", { type: "CRAWL_URL", payload: "invalid" }],
])("JobService.createJob should neither store nor enqueue for %s", async (_label, request) => {
    const jobRepositoryMock = { create: vi.fn() };
    const jobQueueMock = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    await expect(jobService.createJob(request as any)).rejects.toThrow();

    expect(jobRepositoryMock.create).not.toHaveBeenCalled();
    expect(jobQueueMock.enqueue).not.toHaveBeenCalled();
});

test("JobService.createJob should propagate queue rejection while retaining the stored PENDING job", async () => {
    const queueError = new Error("Queue unavailable");
    let storedJob: Job | undefined;
    const jobRepositoryMock = {
        create: vi.fn().mockImplementation((job: Job) => {
            storedJob = job;
            return job;
        }),
    };
    const jobQueueMock = { enqueue: vi.fn().mockRejectedValue(queueError) };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    await expect(jobService.createJob({
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
    })).rejects.toBe(queueError);

    expect(jobQueueMock.enqueue).toHaveBeenCalledTimes(1);
    expect(jobRepositoryMock.create).toHaveBeenCalledTimes(1);
    expect(storedJob).toMatchObject({
        id: expect.any(String),
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
        status: "PENDING",
    });
    expect(jobQueueMock.enqueue).toHaveBeenCalledWith(storedJob!.id);
    expect(jobRepositoryMock.create.mock.invocationCallOrder[0]).toBeLessThan(
        jobQueueMock.enqueue.mock.invocationCallOrder[0],
    );
});

test("JobService.getJob should return the job for the requested ID", async () => {
    const job: Job = {
        id: "job-1",
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const jobRepositoryMock = { findById: vi.fn().mockReturnValue(job) };
    const jobQueueMock = { enqueue: vi.fn() };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    await expect(jobService.getJob(job.id)).resolves.toEqual(job);
    expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
    expect(jobQueueMock.enqueue).not.toHaveBeenCalled();
});

test("JobService.getJob should return undefined for an unknown ID", async () => {
    const jobRepositoryMock = { findById: vi.fn().mockReturnValue(undefined) };
    const jobQueueMock = { enqueue: vi.fn() };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    await expect(jobService.getJob("unknown-id")).resolves.toBeUndefined();
    expect(jobRepositoryMock.findById).toHaveBeenCalledWith("unknown-id");
});

test("JobService.getJobs should return all stored jobs", async () => {
    const jobs: Job[] = ["job-1", "job-2"].map((id) => ({
        id,
        type: "CRAWL_URL",
        payload: { url: `https://example.com/${id}` },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
    }));
    const jobRepositoryMock = { findAll: vi.fn().mockReturnValue(jobs) };
    const jobQueueMock = { enqueue: vi.fn() };
    const jobService = new JobService(jobRepositoryMock as any, jobQueueMock as any);

    await expect(jobService.getJobs()).resolves.toEqual(jobs);
    expect(jobRepositoryMock.findAll).toHaveBeenCalledTimes(1);
    expect(jobQueueMock.enqueue).not.toHaveBeenCalled();
});


