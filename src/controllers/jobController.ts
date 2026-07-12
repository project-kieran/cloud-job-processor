/**
 * HTTP controller for job-related API requests.
 *
 * The controller translates Express requests into service calls and returns
 * appropriate HTTP responses. It keeps route handling separate from business
 * logic so the service layer remains easier to test and maintain.
 */

import { Request, Response } from "express";
import { CreateJobRequest } from "../types/job";
import { JobService } from "../services/jobService";

export class JobController {
  constructor(private readonly jobService: JobService) {}

  createJob = (req: Request<{}, {}, CreateJobRequest>, res: Response): void => {
    try {
      const job = this.jobService.createJob(req.body);
      res.status(201).json(job);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
  };

  getJob = (req: Request<{ id: string }>, res: Response): void => {
    const job = this.jobService.getJob(req.params.id);

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(job);
  };

  getJobs = (_req: Request, res: Response): void => {
    res.json(this.jobService.getJobs());
  };
}