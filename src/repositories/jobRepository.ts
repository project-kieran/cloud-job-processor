/**
 * In-memory repository for storing and retrieving jobs.
 *
 * This acts as the data access layer for the application.
 * In the current version, jobs are stored in a Map so the API can be tested
 * without a database. In a later phase, this repository can be replaced or
 * extended to use DynamoDB.
 */

import { Job, JobStatus } from "../types/job";

export class JobRepository {
  private readonly jobs = new Map<string, Job>();
  private readonly jobStatuses = new Map<string, JobStatus>();

  create(job: Job): Job {
    this.jobs.set(job.id, job);
    return job;
  }

  updateStatus(id: string, status: JobStatus): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = status;
      job.updatedAt = new Date().toISOString();
      this.jobs.set(id, job);
    }
  }

  findById(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  findAll(): Job[] {
    return Array.from(this.jobs.values());
  }
}
