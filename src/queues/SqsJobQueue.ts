import { error } from "node:console";
import { JobQueue, ReceivedJobMessage } from "../types/job";
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, DeleteMessageBatchCommand } from "@aws-sdk/client-sqs";


export class SqsJobQueue implements JobQueue {
    constructor(
        private readonly client: SQSClient,
        private readonly queueUrl: string
    ) {}
    async enqueue(jobId: string): Promise<void> {
        await this.client.send(
            new SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: jobId
            }),
        );
    }

    // async dequeue(): Promise<string | undefined> {
    //     const response = await this.client.send(
    //         new ReceiveMessageCommand({
    //             QueueUrl: this.queueUrl,
    //             MaxNumberOfMessages: 1,
    //             WaitTimeSeconds: 20
    //         }),
    //     );
    //     return response.Messages?.[0]?.Body;
    // }

    async receive(): Promise<ReceivedJobMessage | undefined> {
        const received = await this.client.send(
            new ReceiveMessageCommand({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: 1,
                WaitTimeSeconds: 20,
                VisibilityTimeout: 20
            }),
        );

        const message = received.Messages?.[0];

        if (!message) {
            return undefined;
        }

        const jobId = message?.Body;
        const receiptHandle = message?.ReceiptHandle;
        
        if (!jobId || !receiptHandle){
            throw new Error("Job ID or receipt is missing");
        }
        return { jobId, receiptHandle };
    }

    async acknowledge(receiptHandle: string): Promise<void> {
        await this.client.send(
            new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: receiptHandle
            }),
        );
    }
}