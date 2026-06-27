/**
 * Defines the job API routes and wires together the repository, service and
 * controller layers.
 */

import { Router } from "express";
import { JobRepository } from "../repositories/jobRepository";
import { JobService } from "../services/jobService";
import { JobController } from "../controllers/jobController";

const router = Router();

const jobRepository = new JobRepository();
const jobService = new JobService(jobRepository);
const jobController = new JobController(jobService);

router.post("/jobs", jobController.createJob);
router.get("/jobs", jobController.getJobs);
router.get("/jobs/:id", jobController.getJob);

export default router;