import { JobWorker } from "../services/jobWorker";
import { afterEach, expect, test, vi } from "vitest";
import type { Job, JobQueue } from "../types/job";
import type { JobRepository } from "../repositories/jobRepository";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Each call creates fresh typed dependencies for the retry scenarios.
function createRetrySetup() {
  const job: Job = {
    id: "retry-job",
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };
  const repository = {
    findById: vi.fn<JobRepository["findById"]>().mockReturnValue(job),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };
  const queue = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue(job.id),
  };
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return {
    job,
    repository,
    queue,
    fetchMock,
    worker: new JobWorker(repository, queue),
  };
}

test.each([
  "HTTP error",
  "network error",
  "unsupported type",
  "missing URL",
  "non-string URL",
])(
  "JobWorker.processNextJob should stop retrying after three attempts for %s",
  async (failure) => {
    const { job, repository, queue, fetchMock, worker } = createRetrySetup();
    if (failure === "HTTP error") {
      fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    } else if (failure === "network error") {
      fetchMock.mockRejectedValue(new Error("Network failure"));
    } else if (failure === "unsupported type") {
      job.type = "UNSUPPORTED";
    } else if (failure === "missing URL") {
      job.payload = {};
    } else {
      job.payload = { url: 123 };
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      await worker.processNextJob();
      expect(job.attempts).toBe(attempt);
      expect(repository.updateStatus).toHaveBeenNthCalledWith(
        attempt * 2 - 1,
        job.id,
        "PROCESSING",
        attempt,
      );
      expect(repository.updateStatus).toHaveBeenNthCalledWith(
        attempt * 2,
        job.id,
        attempt < 3 ? "PENDING" : "FAILED",
        attempt,
      );
      expect(queue.enqueue).toHaveBeenCalledTimes(Math.min(attempt, 2));
    }

    expect(repository.updateStatus).toHaveBeenCalledTimes(6);
    expect(queue.enqueue.mock.calls).toEqual([[job.id], [job.id]]);
    expect(fetchMock).toHaveBeenCalledTimes(
      failure === "HTTP error" || failure === "network error" ? 3 : 0,
    );
  },
);

test.each([2, 3])(
  "JobWorker.processNextJob should complete on attempt %i without requeueing again",
  async (successfulAttempt) => {
    const { job, repository, queue, fetchMock, worker } = createRetrySetup();
    for (let attempt = 1; attempt < successfulAttempt; attempt++) {
      fetchMock.mockRejectedValueOnce(new Error("Temporary network failure"));
    }
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    for (let attempt = 1; attempt <= successfulAttempt; attempt++) {
      await worker.processNextJob();
    }

    expect(job.attempts).toBe(successfulAttempt);
    expect(fetchMock).toHaveBeenCalledTimes(successfulAttempt);
    expect(queue.enqueue).toHaveBeenCalledTimes(successfulAttempt - 1);
    expect(repository.updateStatus).toHaveBeenLastCalledWith(
      job.id,
      "COMPLETED",
      successfulAttempt,
    );
    expect(repository.updateStatus).not.toHaveBeenCalledWith(
      job.id,
      "FAILED",
      expect.any(Number),
    );
  },
);

test("JobWorker.processNextJob should propagate an enqueue failure when retrying", async () => {
  const { job, repository, queue, fetchMock, worker } = createRetrySetup();
  const queueError = new Error("Queue unavailable");
  fetchMock.mockRejectedValue(new Error("Network failure"));
  queue.enqueue.mockRejectedValue(queueError);

  await expect(worker.processNextJob()).rejects.toBe(queueError);

  expect(job.attempts).toBe(1);
  expect(queue.enqueue).toHaveBeenCalledTimes(1);
  expect(queue.enqueue).toHaveBeenCalledWith(job.id);
  expect(repository.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "PENDING", 1],
  ]);
});

test("JobWorker.processNextJob should return without fetching on empty queue", async () => {
  const jobRepositoryMock = {
    findById: vi.fn<JobRepository["findById"]>(),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };
  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue(undefined),
  };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);

  const result = await jobWorker.processNextJob();

  expect(result).toBeUndefined();
  expect(jobQueueMock.dequeue).toHaveBeenCalledTimes(1);
  expect(jobRepositoryMock.findById).not.toHaveBeenCalled();
  expect(jobRepositoryMock.updateStatus).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(jobQueueMock.enqueue).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob status should remain PROCESSING while fetch is pending", async () => {
  const job: Job = {
    id: "job-1",
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };

  const jobRepositoryMock = {
    findById: vi.fn<JobRepository["findById"]>().mockReturnValue(job),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };

  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue(job.id),
  };

  let resolveFetch!: (response: { ok: boolean }) => void;
  const pendingFetch = new Promise<{ ok: boolean }>((resolve) => {
    resolveFetch = resolve;
  });

  const fetchMock = vi.fn().mockReturnValue(pendingFetch);
  vi.stubGlobal("fetch", fetchMock);
  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);

  const processPromise = jobWorker.processNextJob();

  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(job.payload.url, {
      signal: expect.any(AbortSignal),
    });
  });
  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
  ]);
  resolveFetch({ ok: true });
  await processPromise;
  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "COMPLETED", 1],
  ]);
  expect(jobQueueMock.enqueue).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob should requeue the job as PENDING for invalid HTTP response", async () => {
  const job: Job = {
    id: "job-1",
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };

  const jobRepositoryMock = {
    findById: vi.fn<JobRepository["findById"]>().mockReturnValue(job),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };

  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue(job.id),
  };

  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    statusText: "InternalServerError",
  });
  vi.stubGlobal("fetch", fetchMock);

  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);
  await jobWorker.processNextJob();

  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "PENDING", 1],
  ]);
  expect(job.attempts).toBe(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledTimes(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledWith(job.id);
});

test("JobWorker.processNextJob should requeue the job as PENDING when fetch is rejected", async () => {
  const job: Job = {
    id: "job-1",
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };

  const jobRepositoryMock = {
    findById: vi.fn<JobRepository["findById"]>().mockReturnValue(job),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };

  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue(job.id),
  };

  const fetchMock = vi.fn().mockRejectedValue(new Error("Network failure"));
  vi.stubGlobal("fetch", fetchMock);

  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);
  await jobWorker.processNextJob();

  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "PENDING", 1],
  ]);
  expect(job.attempts).toBe(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledTimes(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledWith(job.id);
});

test("JobWorker.processNextJob should requeue the job as PENDING and not fetch on invalid job type", async () => {
  const job: Job = {
    id: "job-1",
    type: "UNSUPPORTED",
    payload: { url: "https://example.com" },
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };

  const jobRepositoryMock = {
    findById: vi.fn<JobRepository["findById"]>().mockReturnValue(job),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };
  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue(job.id),
  };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);

  await jobWorker.processNextJob();

  expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "PENDING", 1],
  ]);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(job.attempts).toBe(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledTimes(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledWith(job.id);
});

test("JobWorker.processNextJob should requeue the job as PENDING and not fetch when URL is missing", async () => {
  const job: Job = {
    id: "job-1",
    type: "CRAWL_URL",
    payload: {},
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };

  const jobRepositoryMock = {
    findById: vi.fn<JobRepository["findById"]>().mockReturnValue(job),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };
  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue(job.id),
  };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);

  await jobWorker.processNextJob();

  expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "PENDING", 1],
  ]);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(job.attempts).toBe(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledTimes(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledWith(job.id);
});

test("JobWorker.processNextJob should requeue the job as PENDING and not fetch on non-string URL", async () => {
  const job: Job = {
    id: "job-1",
    type: "CRAWL_URL",
    payload: { url: 123 },
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };

  const jobRepositoryMock = {
    findById: vi.fn<JobRepository["findById"]>().mockReturnValue(job),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };
  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue(job.id),
  };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);

  await jobWorker.processNextJob();

  expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "PENDING", 1],
  ]);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(job.attempts).toBe(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledTimes(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledWith(job.id);
});

test("JobWorker.processNextJob should return missing job error when job ID is unknown", async () => {
  const jobRepositoryMock = {
    findById: vi.fn<JobRepository["findById"]>().mockReturnValue(undefined),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };
  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi.fn<JobQueue["dequeue"]>().mockResolvedValue("unknown-id"),
  };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);

  await expect(jobWorker.processNextJob()).rejects.toThrow(
    "Job with ID unknown-id not found",
  );

  expect(jobRepositoryMock.findById).toHaveBeenCalledWith("unknown-id");
  expect(jobRepositoryMock.updateStatus).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(jobQueueMock.enqueue).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob should process only one queued job", async () => {
  const job: Job = {
    id: "job-1",
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };
  const secondJob: Job = {
    ...job,
    id: "job-2",
    payload: { url: "https://example.com/second" },
  };
  const jobRepositoryMock = {
    findById: vi
      .fn<JobRepository["findById"]>()
      .mockImplementation((id: string) => {
        return [job, secondJob].find((storedJob) => storedJob.id === id);
      }),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };
  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi
      .fn<JobQueue["dequeue"]>()
      .mockResolvedValueOnce(job.id)
      .mockResolvedValueOnce(secondJob.id)
      .mockResolvedValue(undefined),
  };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);

  await jobWorker.processNextJob();

  expect(jobQueueMock.dequeue).toHaveBeenCalledTimes(1);
  expect(jobRepositoryMock.findById).toHaveBeenCalledTimes(1);
  expect(jobRepositoryMock.findById).toHaveBeenCalledWith(job.id);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(job.payload.url, {
    signal: expect.any(AbortSignal),
  });
  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "COMPLETED", 1],
  ]);

  await jobWorker.processNextJob();

  expect(jobQueueMock.dequeue).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenNthCalledWith(2, secondJob.payload.url, {
    signal: expect.any(AbortSignal),
  });
  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "COMPLETED", 1],
    [secondJob.id, "PROCESSING", 1],
    [secondJob.id, "COMPLETED", 1],
  ]);
  expect(jobQueueMock.enqueue).not.toHaveBeenCalled();
});

test("JobWorker.processNextJob should process the next job while a failed attempt awaits retry", async () => {
  const job: Job = {
    id: "job-1",
    type: "CRAWL_URL",
    payload: { url: "https://example.com" },
    status: "PENDING",
    attempts: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
  };
  const secondJob: Job = {
    ...job,
    id: "job-2",
    payload: { url: "https://example.com/second" },
  };
  const jobRepositoryMock = {
    findById: vi
      .fn<JobRepository["findById"]>()
      .mockImplementation((id: string) => {
        return [job, secondJob].find((storedJob) => storedJob.id === id);
      }),
    updateStatus: vi.fn<JobRepository["updateStatus"]>(),
  };
  const jobQueueMock = {
    enqueue: vi.fn<JobQueue["enqueue"]>().mockResolvedValue(undefined),
    dequeue: vi
      .fn<JobQueue["dequeue"]>()
      .mockResolvedValueOnce(job.id)
      .mockResolvedValueOnce(secondJob.id)
      .mockResolvedValue(undefined),
  };
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error("Network failure"))
    .mockResolvedValueOnce({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const jobWorker = new JobWorker(jobRepositoryMock, jobQueueMock);

  await expect(jobWorker.processNextJob()).resolves.toBeUndefined();
  expect(jobRepositoryMock.updateStatus.mock.calls).toEqual([
    [job.id, "PROCESSING", 1],
    [job.id, "PENDING", 1],
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
    [job.id, "PROCESSING", 1],
    [job.id, "PENDING", 1],
    [secondJob.id, "PROCESSING", 1],
    [secondJob.id, "COMPLETED", 1],
  ]);
  expect(job.attempts).toBe(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledTimes(1);
  expect(jobQueueMock.enqueue).toHaveBeenCalledWith(job.id);
});
