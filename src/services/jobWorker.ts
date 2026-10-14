import { JobRepository } from "../repositories/jobRepository";
import { Job, JobQueue } from "../types/job";

export class JobWorker {
  constructor(
    private readonly repository: Pick<
      JobRepository,
      "findById" | "updateStatus"
    >,
    private readonly queue: Pick<JobQueue, "enqueue" | "dequeue">,
  ) {}

  private async processJob(job: Job): Promise<void> {
    if (job.type !== "CRAWL_URL") {
      throw new Error(`Unsupported job type: ${job.type}`);
    }

    if (!job.payload.url || typeof job.payload.url !== "string") {
      throw new Error(
        `Job with ID ${job.id} is missing the 'url' field in its payload`,
      );
    }
    const url = job.payload.url;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL ${url}: ${response.statusText}`);
    }
  }

  async processNextJob(): Promise<void> {
    const jobId = await this.queue.dequeue();

    if (!jobId) {
      return;
    }

    const job = this.repository.findById(jobId);
    
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    job.attempts++;
    const maxAttempts = 3;
    try {
      this.repository.updateStatus(job.id, "PROCESSING", job.attempts);
      await this.processJob(job);
      this.repository.updateStatus(job.id, "COMPLETED", job.attempts);
    } catch {
      if (job.attempts < maxAttempts){
        this.repository.updateStatus(job.id, "PENDING", job.attempts);
        await this.queue.enqueue(job.id);
      } else {
          this.repository.updateStatus(job.id, "FAILED", job.attempts);
      }
    }
  }
}
