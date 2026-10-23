import { expect, test, vi } from "vitest";
import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { SqsJobQueue } from "../queues/SqsJobQueue";

function setup() {
  const client = new SQSClient({ region: "eu-west-2" });
  const send = vi.spyOn(client, "send").mockResolvedValue({});
  return {
    send,
    queue: new SqsJobQueue(client, "https://sqs.example.com/jobs"),
  };
}

test("SQS enqueue sends the job ID as the message body", async () => {
  const { send, queue } = setup();
  await queue.enqueue("job-1");
  expect(send).toHaveBeenCalledTimes(1);
  const command = send.mock.calls[0][0];
  expect(command).toBeInstanceOf(SendMessageCommand);
  expect(command.input).toEqual({
    QueueUrl: "https://sqs.example.com/jobs",
    MessageBody: "job-1",
  });
});

test("SQS receive returns the job ID and receipt without deleting the message", async () => {
  const { send, queue } = setup();
  send.mockResolvedValue({
    Messages: [{ Body: "job-1", ReceiptHandle: "receipt-1" }],
  });
  await expect(queue.receive()).resolves.toEqual({
    jobId: "job-1",
    receiptHandle: "receipt-1",
  });
  expect(send).toHaveBeenCalledTimes(1);
  const command = send.mock.calls[0][0];
  expect(command).toBeInstanceOf(ReceiveMessageCommand);
  expect(command.input).toEqual({
    QueueUrl: "https://sqs.example.com/jobs",
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
    VisibilityTimeout: 20,
  });
});

test.each([{}, { Messages: [] }])(
  "SQS receive returns undefined for an empty response %j",
  async (response) => {
    const { send, queue } = setup();
    send.mockResolvedValue(response);
    await expect(queue.receive()).resolves.toBeUndefined();
  },
);

test.each([
  {},
  { Body: "job-1" },
  { ReceiptHandle: "receipt-1" },
  { Body: "", ReceiptHandle: "receipt-1" },
  { Body: "job-1", ReceiptHandle: "" },
])("SQS receive rejects an incomplete message %j", async (message) => {
  const { send, queue } = setup();
  send.mockResolvedValue({ Messages: [message] });
  await expect(queue.receive()).rejects.toThrow("Job ID or receipt is missing");
});

test("SQS acknowledge deletes the message using its receipt handle", async () => {
  const { send, queue } = setup();
  await queue.acknowledge("receipt-1");
  expect(send).toHaveBeenCalledTimes(1);
  const command = send.mock.calls[0][0];
  expect(command).toBeInstanceOf(DeleteMessageCommand);
  expect(command.input).toEqual({
    QueueUrl: "https://sqs.example.com/jobs",
    ReceiptHandle: "receipt-1",
  });
});

test.each(["enqueue", "receive", "acknowledge"] as const)(
  "SQS %s propagates client failures",
  async (method) => {
    const { send, queue } = setup();
    const error = new Error("SQS unavailable");
    send.mockRejectedValue(error);
    await expect(queue[method]("job-or-receipt")).rejects.toBe(error);
  },
);
