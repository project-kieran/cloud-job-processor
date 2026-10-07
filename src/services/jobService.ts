/**
 * Business logic layer for job creation and retrieval.
 *
 * The service validates incoming job requests, creates job records with IDs
 * and timestamps, and delegates storage/retrieval to the repository layer.
 *
 * In later phases, this is where queue idempotency checks and
 * job status transitions can be introduced.
 */

import { randomUUID } from "crypto";
import { CreateJobRequest, Job, JobQueue } from "../types/job";
import { JobRepository } from "../repositories/jobRepository";

export class JobService {
  constructor(private readonly jobRepository: JobRepository, private readonly jobQueue: JobQueue) {}

  async createJob(request: CreateJobRequest): Promise<Job> {
    if (!request.type || typeof request.type !== "string") {
      throw new Error("Job type is required");
    }

    if (!request.payload || typeof request.payload !== "object") {
      throw new Error("Job payload is required");
    }

    const now = new Date().toISOString();

    const job: Job = {
      id: randomUUID(),
      type: request.type,
      payload: request.payload,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };
    await this.jobQueue.enqueue(job.id);
    return this.jobRepository.create(job);
  }

  async getJob(id: string): Promise<Job | undefined> {
    return this.jobRepository.findById(id);
  }

  async getJobs(): Promise<Job[]> {
    return this.jobRepository.findAll();
  }

  
}
