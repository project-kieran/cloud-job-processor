/**
 * Defines the core TypeScript types used by the job processing API.
 *
 * These types describe:
 * - the lifecycle status of a job
 * - the shape of a stored job record
 * - the expected request body when a client creates a new job
 */
export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobRequest {
  type: string;
  payload: Record<string, unknown>;
}
