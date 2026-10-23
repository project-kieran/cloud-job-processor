import { JobRepository } from "../repositories/jobRepository";
import { Job, JobQueue } from "../types/job";
import { JobProcessingError } from "../errors/JobProcessingError";
export class JobWorker {
  constructor(
    private readonly repository: Pick<
      JobRepository,
      "findById" | "updateStatus"
    >,
    private readonly queue: Pick<JobQueue, "enqueue" | "receive" | "acknowledge">,
    private readonly deadLetterQueue: Pick<JobQueue, "enqueue">
  ) {}

  private async processJob(job: Job): Promise<void> {
    if (job.type !== "CRAWL_URL") {
      throw new JobProcessingError(`Unsupported job type: ${job.type}`, false);
    }

    if (!job.payload.url || typeof job.payload.url !== "string") {
      throw new JobProcessingError(`Job with ID ${job.id} is missing the 'url' field in its payload`, false);
    }
    const url = job.payload.url;
    
    let response: Response;
    try {
      response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    } catch {
      throw new JobProcessingError(
        `Failed to fetch URL ${url} due to a network error or timeout`,
        true,
      );
    }

    if (!response.ok) {
      throw new JobProcessingError(`Failed to fetch URL ${url}: ${response.statusText}`, response.status >= 500);
    }
  }

  async processNextJob(): Promise<void> {
    const message = await this.queue.receive();

    if (!message) {
      return;
    }

    const job = this.repository.findById(message.jobId);
    
    if (!job) {
      await this.deadLetterQueue.enqueue(message.jobId);
      await this.queue.acknowledge(message.receiptHandle);
      return;
    }

    job.attempts++;
    const maxAttempts = 3;
    try {
      this.repository.updateStatus(job.id, "PROCESSING", job.attempts);
      await this.processJob(job);
      this.repository.updateStatus(job.id, "COMPLETED", job.attempts);
      await this.queue.acknowledge(message.receiptHandle);
    } catch (error) {
      if (
        error instanceof JobProcessingError &&
        error.retryable &&
        job.attempts < maxAttempts){
          this.repository.updateStatus(job.id, "PENDING", job.attempts);
          await this.queue.enqueue(job.id);
          await this.queue.acknowledge(message.receiptHandle);
      } else {
          this.repository.updateStatus(job.id, "FAILED", job.attempts);
          await this.deadLetterQueue.enqueue(job.id);
          await this.queue.acknowledge(message.receiptHandle);
      }
    }
  }
}
