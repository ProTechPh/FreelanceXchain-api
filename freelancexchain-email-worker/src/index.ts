import PostalMime from "postal-mime";
import type { Env, InboundEmailPayload, EmailAttachmentMeta } from "./types";

export async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Structural subset of ForwardableEmailMessage used by buildInboundPayload. */
type EmailMessageLike = {
  from: string;
  to: string;
  headers: { get(name: string): string | null };
};

/** Structural subset of PostalMime's parsed email used by buildInboundPayload. */
type ParsedEmailLike = {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: Array<{ key: string; value?: string | null }>;
  attachments?: Array<{
    filename?: string | null;
    content?: string | Uint8Array | ArrayBuffer | null;
    mimeType?: string;
  }>;
};

export function buildInboundPayload(
  message: EmailMessageLike,
  parsed: ParsedEmailLike,
): InboundEmailPayload {
  const attachments: EmailAttachmentMeta[] = (parsed.attachments || []).map((att) => {
    const content = att.content;
    const size =
      typeof content === "string"
        ? new TextEncoder().encode(content).byteLength
        : (content?.byteLength ?? 0);
    return {
      filename: att.filename || "unnamed",
      size,
      mimeType: att.mimeType || "application/octet-stream",
    };
  });

  return {
    messageId: message.headers.get("message-id") || crypto.randomUUID(),
    from: message.from,
    to: message.to,
    subject: parsed.subject || "(no subject)",
    textBody: parsed.text || "",
    htmlBody: parsed.html || "",
    attachments,
    inReplyTo: parsed.headers?.find((h) => h.key === "in-reply-to")?.value || null,
    references: parsed.headers?.find((h) => h.key === "references")?.value || null,
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Sign the payload and POST it to the API webhook. Any non-2xx response throws:
 * Cloudflare retries transient 5xx failures and bounces permanent 4xx ones back
 * to the sender, so a rejected email is never silently dropped. The API dedups
 * inbound emails by messageId, so retries are idempotent. `fetchImpl` is
 * injectable for tests.
 */
export async function deliverWebhook(
  payload: InboundEmailPayload,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = await signPayload(body, env.WEBHOOK_SECRET);

  const response = await fetchImpl(env.API_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
    },
    body,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    // Distinguish permanent 4xx (invalid recipient / unknown user — the API
    // also records these in email_delivery_failures) from transient 5xx so ops
    // logs are greppable. Either way we THROW (see doc comment above).
    const permanent = response.status >= 400 && response.status < 500;
    console.error(
      `Webhook delivery failed (${permanent ? "permanent" : "transient"}): ${response.status} ${responseBody}`,
      { messageId: payload.messageId, from: payload.from, to: payload.to, subject: payload.subject }
    );
    throw new Error(`Webhook delivery failed with status ${response.status}: ${responseBody}`);
  }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const rawEmail = await new Response(message.raw).arrayBuffer();
      const parsed = await PostalMime.parse(rawEmail);
      const payload = buildInboundPayload(message, parsed);
      await deliverWebhook(payload, env);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Email processing failed for ${message.from} → ${message.to}: ${msg}`);

      // Permanent 4xx from the API (invalid recipient, user not found) —
      // retrying will never succeed, so reject the message.
      if (msg.includes("status 4")) {
        message.setReject(`Delivery rejected: ${msg}`);
        return;
      }

      // Transient failures (5xx, network, parsing) — re-throw so Cloudflare
      // retries delivery automatically.
      throw err;
    }
  },
} satisfies ExportedHandler<Env>;
