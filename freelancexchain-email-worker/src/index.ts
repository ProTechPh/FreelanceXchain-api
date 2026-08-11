import PostalMime from "postal-mime";
import type { Env, InboundEmailPayload, EmailAttachmentMeta } from "./types";

async function signPayload(payload: string, secret: string): Promise<string> {
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

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(rawEmail);

    const attachments: EmailAttachmentMeta[] = (parsed.attachments || []).map((att) => {
      const content = att.content;
      const size =
        typeof content === "string"
          ? new TextEncoder().encode(content).byteLength
          : content?.byteLength || 0;
      return {
        filename: att.filename || "unnamed",
        size,
        mimeType: att.mimeType || "application/octet-stream",
      };
    });

    const payload: InboundEmailPayload = {
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

    const body = JSON.stringify(payload);
    const signature = await signPayload(body, env.WEBHOOK_SECRET);

    const response = await fetch(env.API_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      body,
    });

    if (!response.ok) {
      console.error(`Webhook delivery failed: ${response.status} ${await response.text()}`);
    }
  },
} satisfies ExportedHandler<Env>;
