/**
 * A permanently rejected inbound email (unknown user / invalid recipient),
 * recorded so ops can see deliveries the email worker could not land instead
 * of relying on Cloudflare's bounce alone.
 */
export type EmailDeliveryFailureEntity = {
  id: string;
  message_id: string;
  from_address: string;
  to_address: string;
  subject: string;
  failure_code: string;
  failure_message: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
};
