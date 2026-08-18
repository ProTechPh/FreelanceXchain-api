import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signPayload, buildInboundPayload, deliverWebhook } from "./index.ts";

const ENV = {
  API_WEBHOOK_URL: "https://api.freelancexchain.works/api/inbox/webhook",
  WEBHOOK_SECRET: "test-secret",
};

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    from: "sender@example.com",
    to: "recipient@freelancexchain.works",
    raw: new Uint8Array(),
    headers: {
      get: (name: string) => (name === "message-id" ? "msg-123" : null),
    },
    ...overrides,
  };
}

test("signPayload produces the same HMAC-SHA256 hex the API verifies", async () => {
  const payload = JSON.stringify({ messageId: "m1", subject: "Hi" });
  const signature = await signPayload(payload, ENV.WEBHOOK_SECRET);
  const expected = createHmac("sha256", ENV.WEBHOOK_SECRET).update(payload).digest("hex");
  assert.equal(signature, expected);
});

test("buildInboundPayload maps message and parsed email fields", () => {
  const message = fakeMessage();
  const parsed = {
    subject: "Hello",
    text: "Body text",
    html: "<p>Body</p>",
    headers: [
      { key: "in-reply-to", value: "parent-1" },
      { key: "references", value: "ref-1" },
    ],
    attachments: [
      { filename: "a.txt", content: "hello", mimeType: "text/plain" },
      { filename: "b.bin", content: new Uint8Array([1, 2, 3]), mimeType: "application/octet-stream" },
      { content: "x" },
    ],
  };
  const payload = buildInboundPayload(message, parsed);
  assert.equal(payload.messageId, "msg-123");
  assert.equal(payload.from, "sender@example.com");
  assert.equal(payload.to, "recipient@freelancexchain.works");
  assert.equal(payload.subject, "Hello");
  assert.equal(payload.textBody, "Body text");
  assert.equal(payload.inReplyTo, "parent-1");
  assert.equal(payload.references, "ref-1");
  assert.equal(payload.attachments[0].size, 5);
  assert.equal(payload.attachments[0].mimeType, "text/plain");
  assert.equal(payload.attachments[1].size, 3);
  assert.equal(payload.attachments[2].filename, "unnamed");
  assert.equal(payload.attachments[2].size, 1);
});

test("buildInboundPayload applies defaults when fields are absent", () => {
  const message = fakeMessage({ headers: { get: () => null } });
  const payload = buildInboundPayload(message, {});
  assert.equal(payload.subject, "(no subject)");
  assert.equal(payload.textBody, "");
  assert.equal(payload.inReplyTo, null);
  assert.equal(payload.references, null);
  assert.match(payload.messageId, /^[0-9a-f-]{36}$/);
});

test("deliverWebhook posts the signed payload and resolves on 2xx", async () => {
  let capturedUrl: string | undefined;
  let capturedInit: Record<string, unknown> | undefined;
  const fetchImpl = async (url: string, init: Record<string, unknown>) => {
    capturedUrl = url;
    capturedInit = init;
    return { ok: true, status: 200 } as Response;
  };

  const payload = buildInboundPayload(fakeMessage(), { subject: "Hi" });
  await deliverWebhook(payload, ENV, fetchImpl as typeof fetch);

  assert.equal(capturedUrl, ENV.API_WEBHOOK_URL);
  assert.equal((capturedInit!.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.ok((capturedInit!.headers as Record<string, string>)["X-Webhook-Signature"]);
  const body = capturedInit!.body as string;
  assert.equal(JSON.parse(body).messageId, "msg-123");
});

test("deliverWebhook throws on transient 5xx so Cloudflare retries", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const fetchImpl = async () =>
      ({ ok: false, status: 503, text: async () => "Service Unavailable" }) as Response;
    const payload = buildInboundPayload(fakeMessage(), {});
    await assert.rejects(
      deliverWebhook(payload, ENV, fetchImpl as typeof fetch),
      /Webhook delivery failed with status 503/
    );
  } finally {
    console.error = originalError;
  }
});

test("deliverWebhook throws on permanent 4xx so Cloudflare bounces", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const fetchImpl = async () =>
      ({ ok: false, status: 400, text: async () => "INVALID_RECIPIENT" }) as Response;
    const payload = buildInboundPayload(fakeMessage(), {});
    await assert.rejects(
      deliverWebhook(payload, ENV, fetchImpl as typeof fetch),
      /Webhook delivery failed with status 400/
    );
  } finally {
    console.error = originalError;
  }
});
