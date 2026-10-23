/**
 * Defines the job API routes and wires together the repository, service and
 * controller layers.
 */

import { Router } from "express";
import { JobRepository } from "../repositories/jobRepository";
import { JobService } from "../services/jobService";
import { JobController } from "../controllers/jobController";
import { InMemoryJobQueue } from "../queues/InMemoryJobQueue";
import { SqsJobQueue } from "../queues/SqsJobQueue";
import { JobWorker } from "../services/jobWorker";
import { SQSClient } from "@aws-sdk/client-sqs";

function createQueues() {
  if (process.env.USE_SQS !== "true") {
    return {
      jobQueue: new InMemoryJobQueue(),
      deadLetterQueue: new InMemoryJobQueue(),
    };
  }

  const queueUrl = process.env.QUEUE_URL;
  const dlqUrl = process.env.DLQ_URL;
  if (!queueUrl || !dlqUrl) {
    throw new Error("QUEUE_URL and DLQ_URL must be set when using SQS");
  }

  const client = new SQSClient({ region: process.env.AWS_REGION });
  return {
    jobQueue: new SqsJobQueue(client, queueUrl),
    deadLetterQueue: new SqsJobQueue(client, dlqUrl),
  };
}

const router = Router();

const jobRepository = new JobRepository();
const { jobQueue, deadLetterQueue } = createQueues();
const jobService = new JobService(jobRepository, jobQueue);
export const jobWorker = new JobWorker(
  jobRepository,
  jobQueue,
  deadLetterQueue,
);
const jobController = new JobController(jobService);

router.post("/jobs", jobController.createJob);
router.get("/jobs", jobController.getJobs);
router.get("/jobs/:id", jobController.getJob);

export default router;
