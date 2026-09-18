# Billing & Subscriptions API

Endpoints for managing user plans, subscriptions, Stripe Checkout, and the Stripe Customer Portal.

---

## Overview

FreelanceXchain provides a two-tier subscription model:

- **Free**: Core marketplace features (projects, proposals, escrow, messaging, and on-chain reputation).
- **Pro**: Advanced capabilities including AI skill matching, automated AI proposals, personalized analytics, and priority candidate matching.

Subscriptions are handled via Stripe Checkout and Customer Portal sessions. Entitlements are synchronized asynchronously via Stripe webhooks and persisted in the `subscriptions` collection.

---

## Endpoints

### 1. Public Plan Descriptor

`GET /api/billing/plans`

Returns the available plans and current Stripe prices for display on the pricing page.

- **Auth Required:** No
- **Rate Limit:** Standard API rate limiter

#### Success Response (`200 OK`)

```json
{
  "billingEnabled": true,
  "trialPeriodDays": 7,
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "prices": [],
      "description": "The full marketplace: projects, proposals, escrow, messaging and reputation."
    },
    {
      "id": "pro",
      "name": "Pro",
      "description": "Everything in Free, plus AI matching, AI proposals, your analytics and priority matching.",
      "prices": [
        {
          "id": "price_123_monthly",
          "interval": "month",
          "currency": "usd",
          "unitAmount": 2900
        },
        {
          "id": "price_123_annual",
          "interval": "year",
          "currency": "usd",
          "unitAmount": 29000
        }
      ]
    }
  ]
}
```

---

### 2. Current Subscription State & Eligibility

`GET /api/billing/subscription`

Retrieves the authenticated caller's active subscription status, Pro entitlement, and trial eligibility.

- **Auth Required:** Yes (Bearer JWT)
- **Rate Limit:** Standard API rate limiter

#### Success Response (`200 OK`)

```json
{
  "plan": "pro",
  "status": "active",
  "isPro": true,
  "currentPeriodEnd": "2026-10-18T00:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "manageable": true,
  "canSubscribe": false,
  "subscribeBlockedReason": "ALREADY_SUBSCRIBED",
  "trialEligible": false,
  "trialDays": 0,
  "trialIneligibleReason": "ALREADY_USED"
}
```

---

### 3. Create Checkout Session

`POST /api/billing/checkout-session`

Initializes a Stripe-hosted Checkout Session to upgrade to Pro.

- **Auth Required:** Yes (Bearer JWT)
- **Rate Limit:** Billing rate limiter

#### Request Body

```json
{
  "interval": "month",
  "successUrl": "https://example.com/billing?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://example.com/billing"
}
```

#### Success Response (`200 OK`)

```json
{
  "sessionId": "cs_test_abc123",
  "url": "https://checkout.stripe.com/c/pay/cs_test_abc123"
}
```

---

### 4. Open Customer Portal

`POST /api/billing/portal-session`

Generates a session URL for the Stripe Customer Portal, allowing users to update payment methods, invoices, or cancel/renew subscriptions.

- **Auth Required:** Yes (Bearer JWT)
- **Rate Limit:** Billing rate limiter

#### Request Body

```json
{
  "returnUrl": "https://example.com/dashboard/employer"
}
```

#### Success Response (`200 OK`)

```json
{
  "url": "https://billing.stripe.com/p/session/test_abc123"
}
```

---

## Webhook Ingestion

`POST /api/webhooks/stripe`

Processes incoming events from Stripe to update user entitlements.

- **Auth Required:** No (Signature verified via `stripe-signature` header)
- **Events Handled:**
  - `checkout.session.completed`: Associates Stripe customer ID with Appwrite `user_id` and provisions Pro tier.
  - `customer.subscription.updated`: Syncs active/past-due/canceled states and billing period ends.
  - `customer.subscription.deleted`: Reverts user back to the Free plan.
