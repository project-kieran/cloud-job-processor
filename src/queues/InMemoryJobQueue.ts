import { JobQueue, ReceivedJobMessage } from "../types/job";
import { v4 as uuidv4 } from "uuid";

export class InMemoryJobQueue implements JobQueue {
  private jobs: ReceivedJobMessage[] = [];

  async enqueue(jobId: string): Promise<void> {
    const receiptHandle = uuidv4();
    const message = { jobId, receiptHandle };
    this.jobs.push(message);
  }

  async receive(): Promise<ReceivedJobMessage | undefined> {
    return this.jobs[0];
  }

  async acknowledge(receiptHandle: string): Promise<void> {
    const index = this.jobs.findIndex(
      (message) => message.receiptHandle === receiptHandle,
    );

    if (index === -1) {
      return;
    }

    this.jobs.splice(index, 1);
  }
}
