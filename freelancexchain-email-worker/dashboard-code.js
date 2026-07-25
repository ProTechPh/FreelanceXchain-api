export default {
  async email(message, env, ctx) {
    // Extract basic email metadata from message properties
    const from = message.from;
    const to = message.to;
    const subject = message.headers.get("subject") || "(no subject)";
    const messageId = message.headers.get("message-id") || "";

    // Read the raw email and extract text/html bodies manually
    const rawStream = message.raw;
    const rawText = await new Response(rawStream).text();

    // Simple body extraction from MIME content
    let textBody = "";
    let htmlBody = "";

    // Try to find text/plain and text/html parts
    const textMatch = rawText.match(/Content-Type:\s*text\/plain[^]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i);
    const htmlMatch = rawText.match(/Content-Type:\s*text\/html[^]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\n\.\r?\n|$)/i);

    if (textMatch) textBody = decodeQuotedPrintable(textMatch[1].trim());
    if (htmlMatch) htmlBody = decodeQuotedPrintable(htmlMatch[1].trim());
    if (!textBody && htmlBody) textBody = htmlBody.replace(/<[^>]*>/g, "");

    // Build webhook payload
    const payload = {
      messageId: messageId,
      from: from,
      to: to,
      subject: subject,
      textBody: textBody,
      htmlBody: htmlBody || textBody,
      attachments: [],
      inReplyTo: message.headers.get("in-reply-to") || null,
      references: message.headers.get("references") || null,
      receivedAt: new Date().toISOString(),
    };

    // Sign the payload
    const body = JSON.stringify(payload);
    const signature = await signPayload(body, env.WEBHOOK_SECRET);

    // Send to API
    const response = await fetch(env.API_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      body: body,
    });

    if (!response.ok) {
      console.error("Webhook failed: " + response.status + " " + (await response.text()));
    }
  },
};

async function signPayload(payload, secret) {
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

function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
