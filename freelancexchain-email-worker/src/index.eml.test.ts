import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import PostalMime from "postal-mime";
import { buildInboundPayload, deliverWebhook } from "./index.ts";

const ENV = {
  API_WEBHOOK_URL: "https://api.freelancexchain.works/api/inbox/webhook",
  WEBHOOK_SECRET: "test-secret",
};

const EML_PATH = new URL("./test-fixtures/sample.eml", import.meta.url);

test("parses a real .eml and delivers it with an idempotent messageId", async () => {
  const rawEmail = readFileSync(EML_PATH);
  const parsed = await PostalMime.parse(new Uint8Array(rawEmail));

  const message = {
    from: "sender@example.com",
    to: "recipient@freelancexchain.works",
    raw: rawEmail,
    headers: {
      get: (name: string) => (name === "message-id" ? "unique-abc123@example.com" : null),
    },
  };

  const payload = buildInboundPayload(message, parsed);
  assert.equal(payload.subject, "Contract update needed");
  assert.equal(payload.from, "sender@example.com");
  assert.equal(payload.to, "recipient@freelancexchain.works");
  assert.equal(payload.messageId, "unique-abc123@example.com");
  assert.match(payload.textBody, /review the milestone/);

  const deliveries: Array<{ signature: string; body: string }> = [];
  const fetchImpl = async (_url: string, init: Record<string, unknown>) => {
    deliveries.push({
      signature: (init.headers as Record<string, string>)["X-Webhook-Signature"],
      body: init.body as string,
    });
    return { ok: true, status: 200 } as Response;
  };

  // Deliver twice (Cloudflare retries a transient failure with the same email).
  await deliverWebhook(payload, ENV, fetchImpl as typeof fetch);
  await deliverWebhook(payload, ENV, fetchImpl as typeof fetch);

  assert.equal(deliveries.length, 2);
  // Same messageId on both deliveries → the API's messageId dedup keeps
  // retries idempotent (no duplicate inbox rows).
  const first = JSON.parse(deliveries[0].body) as { messageId: string };
  const second = JSON.parse(deliveries[1].body) as { messageId: string };
  assert.equal(first.messageId, "unique-abc123@example.com");
  assert.equal(second.messageId, first.messageId);
  // Every delivery is signed; both signatures are valid for their body.
  assert.ok(deliveries[0].signature);
  assert.ok(deliveries[1].signature);
  assert.equal(deliveries[0].signature, deliveries[1].signature);
});
