import { JobRepository } from "../repositories/jobRepository";
import { JobQueue } from "../types/job";

export class JobWorker {
    constructor(
        private readonly repository: JobRepository, 
        private readonly queue: JobQueue) {}

    private async processJob(jobId: string): Promise<void> {
        const job = this.repository.findById(jobId);
    }    

    async processNextJob(): Promise<void> {
        const jobId = await this.queue.dequeue();
        
        if (!jobId) {
            return;
        }

        const job = this.repository.findById(jobId);

        if (!job) {
            return;
        }

        
        try {
            this.repository.updateStatus(job.id, "PROCESSING");
            await this.processJob(job.id);
            this.repository.updateStatus(job.id, "COMPLETED");
        } catch (error) {
            this.repository.updateStatus(job.id, "FAILED");
        }        
    }

}