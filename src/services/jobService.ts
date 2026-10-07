/**
 * Business logic layer for job creation and retrieval.
 *
 * The service validates incoming job requests, creates job records with IDs
 * and timestamps, and delegates storage/retrieval to the repository layer.
 *
 * In later phases, this is where queue publishing, idempotency checks and
 * job status transitions can be introduced.
 */

import { randomUUID } from "crypto";
import { CreateJobRequest, Job } from "../types/job";
import { JobRepository } from "../repositories/jobRepository";

export class JobService {
  constructor(private readonly jobRepository: JobRepository) {}

  createJob(request: CreateJobRequest): Job {
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

    return this.jobRepository.create(job);
  }

  getJob(id: string): Job | undefined {
    return this.jobRepository.findById(id);
  }

  getJobs(): Job[] {
    return this.jobRepository.findAll();
  }
}
