import { JobWorker } from "../services/jobWorker";
import { afterEach, expect, test, vi } from "vitest";
import { Job } from "../types/job";

afterEach(() => {
    vi.unstubAllGlobals();
});

test("JobWorker.processJob should return without fetching on empty queue", async () => {
    const jobRepositoryMock = {
        findById: vi.fn(),
        updateStatus: vi.fn(),
    };
    const jobQueueMock = {
        dequeue: vi.fn().mockResolvedValue(undefined),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);

    const result = await jobWorker.processNextJob();

    expect(result).toBeUndefined();
    expect(jobQueueMock.dequeue).toHaveBeenCalledTimes(1);
    expect(jobRepositoryMock.findById).not.toHaveBeenCalled();
    expect(jobRepositoryMock.updateStatus).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob status should remain PROCESSING while fetch is pending", async () => {
    
    const job: Job = {
        id: "job-1",
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z"
    };

    const jobRepositoryMock = {
        findById: vi.fn().mockReturnValue(job),
        updateStatus: vi.fn()
    };

    const jobQueueMock = {
        dequeue: vi.fn().mockResolvedValue(job.id),
    };

    let resolveFetch!: (response: { ok: boolean }) => void;
    const pendingFetch = new Promise<{ ok: boolean }>((resolve) => {
        resolveFetch = resolve;
    });

    const fetchMock = vi.fn().mockReturnValue(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);

    const processPromise = jobWorker.processNextJob();

    await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(job.payload.url, {
            signal: expect.any(AbortSignal),
        });
    });
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
    ]);
    resolveFetch({ ok: true });
    await processPromise;
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "COMPLETED"],
    ]);

});

test("JobWorker.processNextJob should mark the job FAILED for invalid HTTP response", async () => {
    const job: Job = {
        id: "job-1",
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z"
    };

    const jobRepositoryMock = {
        findById: vi.fn().mockReturnValue(job),
        updateStatus: vi.fn()
    };

    const jobQueueMock = {
        dequeue: vi.fn().mockResolvedValue(job.id),
    };

    const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "InternalServerError"
    });
    vi.stubGlobal("fetch", fetchMock);
    
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);
    await jobWorker.processNextJob();

    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "FAILED"]
    ]);
});

test("JobWorker.processNextJob should mark the job FAILED when fetch is rejected", async () => {
    const job = {
        id: "job-1",
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z"
    };

    const jobRepositoryMock = {
        findById: vi.fn().mockReturnValue(job),
        updateStatus: vi.fn()
    };

    const jobQueueMock = {
        dequeue: vi.fn().mockResolvedValue(job.id),
    };

    const fetchMock = vi.fn().mockRejectedValue(new Error("Network failure"));
    vi.stubGlobal("fetch", fetchMock);

    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);
    await jobWorker.processNextJob();

    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "FAILED"]
    ]);
});

test("JobWorker.processNextJob should mark the job FAILED and not fetch on invalid job type", async () => {
    const job: Job = {
        id: "job-1",
        type: "UNSUPPORTED",
        payload: { url: "https://example.com" },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
    };

    const jobRepositoryMock = {
        findById: vi.fn().mockReturnValue(job),
        updateStatus: vi.fn(),
    };
    const jobQueueMock = {
        dequeue: vi.fn().mockResolvedValue(job.id),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);

    await jobWorker.processNextJob();

    expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "FAILED"],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob should mark the job FAILED and not fetch when URL is missing", async () => {
    const job: Job = {
        id: "job-1",
        type: "CRAWL_URL",
        payload: {},
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
    };

    const jobRepositoryMock = {
        findById: vi.fn().mockReturnValue(job),
        updateStatus: vi.fn(),
    };
    const jobQueueMock = {
        dequeue: vi.fn().mockResolvedValue(job.id),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);

    await jobWorker.processNextJob();

    expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "FAILED"],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob should mark the job FAILED and not fetch on non-string URL", async () => {
    const job: Job = {
        id: "job-1",
        type: "CRAWL_URL",
        payload: { url: 123 },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
    };

    const jobRepositoryMock = {
        findById: vi.fn().mockReturnValue(job),
        updateStatus: vi.fn(),
    };
    const jobQueueMock = {
        dequeue: vi.fn().mockResolvedValue(job.id),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);

    await jobWorker.processNextJob();

    expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "FAILED"],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob should return missing job error when job ID is unknown", async () => {
    const jobRepositoryMock = {
        findById: vi.fn().mockReturnValue(undefined),
        updateStatus: vi.fn(),
    };
    const jobQueueMock = {
        dequeue: vi.fn().mockResolvedValue("unknown-id"),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);

    await expect(jobWorker.processNextJob()).rejects.toThrow("Job with ID unknown-id not found");

    expect(jobRepositoryMock.findById).toHaveBeenCalledWith("unknown-id");
    expect(jobRepositoryMock.updateStatus).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob should process only one queued job", async () => {
    const job: Job = {
        id: "job-1",
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const secondJob: Job = {
        ...job,
        id: "job-2",
        payload: { url: "https://example.com/second" },
    };
    const jobRepositoryMock = {
        findById: vi.fn().mockImplementation((id: string) => {
            return [job, secondJob].find((storedJob) => storedJob.id === id);
        }),
        updateStatus: vi.fn(),
    };
    const jobQueueMock = {
        dequeue: vi.fn()
            .mockResolvedValueOnce(job.id)
            .mockResolvedValueOnce(secondJob.id)
            .mockResolvedValue(undefined),
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);

    await jobWorker.processNextJob();

    expect(jobQueueMock.dequeue).toHaveBeenCalledTimes(1);
    expect(jobRepositoryMock.findById).toHaveBeenCalledTimes(1);
    expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(job.payload.url, {
        signal: expect.any(AbortSignal),
    });
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "COMPLETED"],
    ]);

    await jobWorker.processNextJob();

    expect(jobQueueMock.dequeue).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, secondJob.payload.url, {
        signal: expect.any(AbortSignal),
    });
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "COMPLETED"],
        [secondJob.id, "PROCESSING"],
        [secondJob.id, "COMPLETED"],
    ]);
});

test("JobWorker.processNextJob should process next job after a failed job", async () => {
    const job: Job = {
        id: "job-1",
        type: "CRAWL_URL",
        payload: { url: "https://example.com" },
        status: "PENDING",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const secondJob: Job = {
        ...job,
        id: "job-2",
        payload: { url: "https://example.com/second" },
    };
    const jobRepositoryMock = {
        findById: vi.fn().mockImplementation((id: string) => {
            return [job, secondJob].find((storedJob) => storedJob.id === id);
        }),
        updateStatus: vi.fn(),
    };
    const jobQueueMock = {
        dequeue: vi.fn()
            .mockResolvedValueOnce(job.id)
            .mockResolvedValueOnce(secondJob.id)
            .mockResolvedValue(undefined),
    };
    const fetchMock = vi.fn()
        .mockRejectedValueOnce(new Error("Network failure"))
        .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const jobWorker = new JobWorker(jobRepositoryMock as any, jobQueueMock as any);

    await expect(jobWorker.processNextJob()).resolves.toBeUndefined();
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "FAILED"],
    ]);

    await expect(jobWorker.processNextJob()).resolves.toBeUndefined();

    expect(jobQueueMock.dequeue).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, job.payload.url, {
        signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, secondJob.payload.url, {
        signal: expect.any(AbortSignal),
    });
    expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
        [job.id, "PROCESSING"],
        [job.id, "FAILED"],
        [secondJob.id, "PROCESSING"],
        [secondJob.id, "COMPLETED"],
    ]);
});
