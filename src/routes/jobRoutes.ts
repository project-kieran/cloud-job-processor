/**
 * Defines the job API routes and wires together the repository, service and
 * controller layers.
 */

import { Router } from "express";
import { JobRepository } from "../repositories/jobRepository";
import { JobService } from "../services/jobService";
import { JobController } from "../controllers/jobController";
import { InMemoryJobQueue } from "../queues/InMemoryJobQueue";
import { JobWorker } from "../services/jobWorker";

const router = Router();

const jobRepository = new JobRepository();
const jobQueue = new InMemoryJobQueue();
const deadLetterQueue = new InMemoryJobQueue();
const jobService = new JobService(jobRepository, jobQueue);
export const jobWorker = new JobWorker(jobRepository, jobQueue, deadLetterQueue);
const jobController = new JobController(jobService);

router.post("/jobs", jobController.createJob);
router.get("/jobs", jobController.getJobs);
router.get("/jobs/:id", jobController.getJob);

export default router;
