import { JobQueue, Job } from "../types/job";

export class InMemoryJobQueue implements JobQueue {
    private jobs: string[] = [];

    async enqueue(jobId: string): Promise<void> {
        this.jobs.push(jobId);
    }

    async dequeue(): Promise<string | undefined> {
        return this.jobs.shift();
    }
}