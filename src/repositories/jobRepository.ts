/**
 * In-memory repository for storing and retrieving jobs.
 *
 * This acts as the data access layer for the application.
 * In the current version, jobs are stored in a Map so the API can be tested
 * without a database. In a later phase, this repository can be replaced or
 * extended to use DynamoDB.
 */

import { Job } from "../types/job";

export class JobRepository {
  private readonly jobs = new Map<string, Job>();

  create(job: Job): Job {
    this.jobs.set(job.id, job);
    return job;
  }

  findById(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  findAll(): Job[] {
    return Array.from(this.jobs.values());
  }
}