# Email Delivery Runbook

- **Owner:** Platform/backend lead (same role as the [SLO error-budget owner](slo.md))
- **Last reviewed:** 2026-08-18
- **Related code:** `src/services/scheduler-service.ts`,
  `src/services/email-inbox-service.ts`, `src/routes/email-inbox-routes.ts`,
  `freelancexchain-email-worker/src/index.ts`

Inbound mail to the platform mailbox is processed by the Cloudflare **email
worker** (`freelancexchain-email-worker`), which HMAC-signs the parsed email and
POSTs it to `POST /api/inbox/webhook`. This runbook covers the two surfaces that
make undeliverable mail observable instead of silently dropped.

## Delivery failure record

When the webhook **permanently** rejects an inbound email — `INVALID_RECIPIENT`
(address not on the platform domain) or `USER_NOT_FOUND` (unknown username) —
the API records it in the `email_delivery_failures` collection
(`recordInboundDeliveryFailure`, best-effort: a failed record write never breaks
the webhook response). These codes can never succeed on retry, so recording them
gives ops a durable view of what bounced and why.

- **Admin view:** `GET /api/inbox/delivery-failures` (admin only) returns the 50
  most recent records: `{ items, total }` with `messageId`, `from`, `to`,
  `subject`, `failure_code`, `failure_message`, `received_at`.
- Transient failures (`INBOUND_EMAIL_FAILED`, 5xx) are **not** recorded — the
  worker retries them (see below), so a record would be stale noise.

## Worker behavior (what happens on rejection)

`deliverWebhook` **throws on any non-2xx response**:

- **5xx (transient):** Cloudflare retries the email; the API dedups by
  `messageId`, so retries are idempotent.
- **4xx (permanent):** Cloudflare retries then **bounces** the email back to the
  sender. The API has already recorded the failure in
  `email_delivery_failures` (see above).

The worker logs every failure with the message context and a
`permanent`/`transient` classification — search worker logs for
`Webhook delivery failed` to trace a specific `messageId`.

## Hourly alert job

`scheduler-service` runs `checkEmailDeliveryFailures` hourly (cron `10 * * * *`):
it counts `email_delivery_failures` recorded in the last hour and logs:

| Condition | Log level | Meaning | Operator response |
| --- | --- | --- | --- |
| ≥ 5 rejections/hour | `error` (`[ops] N inbound emails permanently rejected in the last hour…`) with a 10-item sample | Sustained undeliverable mail | Page. Check for a mail campaign going to stale addresses, a domain/DNS problem on the platform mailbox, or an attacker probing usernames. The sample shows `from`/`to`/`code` — investigate the common `to` address and the senders. |
| 1–4 rejections/hour | `warn` (`[ops] N inbound email delivery failure(s)…`) with a code breakdown | Triage material | Review during business hours; look for recurring `USER_NOT_FOUND` (user deleted/renamed) or `INVALID_RECIPIENT` (forwarding config). |
| 0 | (silent) | Healthy | — |

Wire the `[ops]` `error` logs to your paging channel (same channel as the
[escrow reconciliation](escrow-reconciliation.md) critical findings).

## Common scenarios

- **User deleted but mail keeps arriving:** every inbound mail for that username
  records `USER_NOT_FOUND` and bounces. If the mailbox alias should be retired,
  remove the forwarding rule in Cloudflare; otherwise the hourly alert is the
  signal to investigate why mail still targets it.
- **Forwarded thread with multiple recipients:** the envelope `to` may not be a
  single platform address → `INVALID_RECIPIENT` → recorded + bounced. This is
  expected behavior for forwarded threads; the sender sees the bounce.
- **API 5xx during inbound processing:** not recorded (transient); the worker
  retries and the message usually lands. Repeated 5xx with no records in
  `email_delivery_failures` means the API itself is unhealthy — check
  `INBOUND_EMAIL_FAILED` error logs instead.
