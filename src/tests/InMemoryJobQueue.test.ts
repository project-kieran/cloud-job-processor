import { expect, test } from "vitest";
import { InMemoryJobQueue } from "../queues/InMemoryJobQueue";

test("receiving retains a message until its receipt is acknowledged", async () => {
  const queue = new InMemoryJobQueue();
  await queue.enqueue("job-1");
  const message = await queue.receive();
  expect(message).toEqual({
    jobId: "job-1",
    receiptHandle: expect.any(String),
  });
  await expect(queue.receive()).resolves.toEqual(message);
  await queue.acknowledge(message!.receiptHandle);
  await expect(queue.receive()).resolves.toBeUndefined();
});

test("acknowledging removes only the matching message, including duplicate job IDs", async () => {
  const queue = new InMemoryJobQueue();
  await queue.enqueue("job-1");
  await queue.enqueue("job-1");
  const first = (await queue.receive())!;
  await queue.acknowledge("unknown-receipt");
  await expect(queue.receive()).resolves.toEqual(first);
  await queue.acknowledge(first.receiptHandle);
  const second = (await queue.receive())!;
  expect(second.jobId).toBe(first.jobId);
  expect(second.receiptHandle).not.toBe(first.receiptHandle);
  await queue.acknowledge(first.receiptHandle);
  await expect(queue.receive()).resolves.toEqual(second);
  await queue.acknowledge(second.receiptHandle);
  await expect(queue.receive()).resolves.toBeUndefined();
});
