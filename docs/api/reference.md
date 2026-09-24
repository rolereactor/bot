# Role Reactor Bot API Documentation

> **Base URL:** `https://your-domain.com` (or `http://localhost:3030` for development)
>
> All versioned endpoints are mounted under **`/api/v1`**. Auth endpoints use `/auth/*` (unversioned). Health is available at `/health`.

## Table of Contents

- [Authentication](#authentication)
- [Core API Endpoints](#core-api-endpoints)
  - [Server Info](#get-apiv1info)
  - [Bot Statistics](#get-apiv1stats)
  - [Pricing](#get-apiv1pricing)
- [Payment Endpoints](#payment-endpoints)
  - [Create Payment](#post-apiv1paymentscreate)
  - [User Balance](#get-apiv1useruseridbalance)
  - [User Payments](#get-apiv1useruseridpayments)
  - [Payment Stats](#get-apiv1paymentsstats)
  - [Pending Payments](#get-apiv1paymentspending)
- [Authentication Endpoints](#authentication-endpoints)
  - [Discord OAuth](#get-authdiscord)
  - [OAuth Callback](#get-authdiscordcallback)
  - [Current User](#get-authme)
  - [Logout](#post-authlogout)
- [Webhook Endpoints](#webhook-endpoints)
- [Health Endpoints](#health-endpoints)
- [Response Format](#response-format)
- [Error Codes](#error-codes)

---

## Authentication

Most read endpoints are public. Payment creation and user-specific endpoints require Discord OAuth authentication. Admin endpoints additionally require internal API key + admin role.

### Session-Based Authentication

1. User initiates login via `GET /auth/discord`
2. After OAuth flow, session cookie is set
3. Include `credentials: 'include'` in fetch requests
4. Session expires after 24 hours

```javascript
// Example authenticated request
fetch("/api/v1/payments/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // Required for session auth
  body: JSON.stringify({ amount: 10 }),
});
```

### Internal Service Authentication

Service-to-service calls (website → bot) use:

```
Authorization: Bearer <INTERNAL_API_KEY>
X-User-ID: <discordUserId>
```

---

## Core API Endpoints

### GET `/api/v1/info`

Returns server information and capabilities.

**Authentication:** None required

**Response:**

```json
{
  "success": true,
  "status": "success",
  "message": "Unified API Server Information",
  "server": {
    "name": "Role Reactor Bot API Server",
    "version": "1.8.0",
    "description": "A powerful Discord bot..."
  },
  "features": {
    "webhooks": true,
    "healthChecks": true,
    "cors": true,
    "requestLogging": true,
    "errorHandling": true
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

### GET `/api/v1/stats`

Returns bot statistics including guild and user counts.

**Authentication:** None required

**Response:**

```json
{
  "success": true,
  "status": "success",
  "bot": {
    "id": "123456789012345678",
    "username": "Role Reactor"
  },
  "statistics": {
    "guilds": 150,
    "users": 50000
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

### GET `/api/v1/pricing`

Returns Core credit packages and current promotions.

**Authentication:** None required (optional `user_id` for personalized data)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `user_id` | string | Optional. Discord user ID for personalized pricing info |

**Request:**

```
GET /api/v1/pricing?user_id=YOUR_DISCORD_USER_ID
```

**Response (shape):**

```json
{
  "success": true,
  "status": "success",
  "packages": [
    {
      "id": "$10",
      "name": "string",
      "price": 10,
      "currency": "USD",
      "baseCores": 150,
      "bonusCores": 15,
      "totalCores": 165,
      "rate": 16.5,
      "valuePerDollar": "16.5 Cores/$1",
      "description": "string",
      "estimatedUsage": "string",
      "popular": false,
      "features": []
    }
  ],
  "minimumPayment": 1,
  "currency": "USD",
  "paymentMethods": {
    "crypto": true
  },
  "promotions": [],
  "referralSystem": {
    "enabled": true,
    "referrerBonus": "15%",
    "refereeBonus": "10%",
    "minimumPurchase": 10
  },
  "user": {
    "requestedUserId": "YOUR_DISCORD_USER_ID",
    "isFirstPurchase": true,
    "currentCredits": 0,
    "sparks": 0,
    "eligibleForFirstPurchaseBonus": true,
    "hasActivePro": false
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

> Package amounts, descriptions, and promotions are server-configured — do not hardcode them client-side.

---

## Payment Endpoints

### POST `/api/v1/payments/create`

Creates a new payment invoice using Plisio. **Email is automatically pre-filled from Discord OAuth.**

**Authentication:** Required (internal auth + user session)

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Payment amount in USD (minimum from server config) |
| `packageId` | string | No | Package identifier (e.g., `"$10"`, `"$25"`) |

**Request:**

```json
{
  "packageId": "$10",
  "amount": 10
}
```

**Response:**

```json
{
  "success": true,
  "status": "success",
  "invoiceUrl": "https://plisio.net/invoice/abc123xyz",
  "orderId": "YOUR_DISCORD_USER_ID_1705234567890",
  "amount": 10,
  "currency": "USD",
  "packageId": "$10",
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

**Error Responses:**

| Status | Error                         | Description                     |
| ------ | ----------------------------- | ------------------------------- |
| 401    | Authentication required       | User not logged in              |
| 400    | Invalid amount                | Amount must be positive number  |
| 400    | Amount too low                | Below minimum payment threshold |
| 500    | Payment system not configured | PLISIO_SECRET_KEY not set       |

**Usage Example:**

```javascript
async function createPayment(packageId, amount) {
  const response = await fetch("/api/v1/payments/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ packageId, amount }),
  });

  const data = await response.json();

  if (data.success) {
    // Redirect to payment page (email pre-filled!)
    window.location.href = data.invoiceUrl || data.data?.invoiceUrl;
  } else {
    console.error("Payment failed:", data.message || data.error);
  }
}
```

---

### GET `/api/v1/user/:userId/balance`

Returns a user's Core credit balance.

**Authentication:** Required (internal auth + session; user may only access their own balance)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | Discord user ID |

**Alternative:** `GET /api/v1/balance` (authenticated)

**Response:**

```json
{
  "success": true,
  "status": "success",
  "userId": "YOUR_DISCORD_USER_ID",
  "credits": 165,
  "sparks": 25,
  "hasAccount": true,
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

### GET `/api/v1/user/:userId/payments`

Returns a user's payment history.

**Authentication:** Required (internal auth + session; user may only access their own history)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | Discord user ID |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Maximum results to return |
| `skip` | number | 0 | Results to skip (pagination) |
| `provider` | string | null | Filter by provider (plisio) |

**Alternative:** `GET /api/v1/payments` (authenticated)

**Response (shape):**

```json
{
  "success": true,
  "status": "success",
  "userId": "YOUR_DISCORD_USER_ID",
  "payments": [
    {
      "paymentId": "YOUR_DISCORD_USER_ID_1705234567890",
      "provider": "plisio",
      "amount": 10,
      "currency": "USD",
      "coresGranted": 165,
      "tier": "$10",
      "status": "completed",
      "createdAt": "2026-09-24T09:00:00.000Z"
    }
  ],
  "total": 1,
  "pagination": {
    "limit": 50,
    "skip": 0,
    "hasMore": false
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

### GET `/api/v1/payments/stats`

Returns global payment statistics. (Admin endpoint)

**Authentication:** Required (internal auth + session + admin role)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string | Optional. ISO date string for range start |
| `end_date` | string | Optional. ISO date string for range end |

**Response (shape):**

```json
{
  "success": true,
  "status": "success",
  "overview": {
    "totalPayments": 0,
    "totalRevenue": 0,
    "totalCoresGranted": 0,
    "uniqueCustomers": 0
  },
  "recentPayments": [],
  "dateRange": {
    "start": null,
    "end": null
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

### GET `/api/v1/payments/pending`

Returns pending payments awaiting processing. (Admin endpoint)

**Authentication:** Required (internal auth + session + admin role)

**Response (shape):**

```json
{
  "success": true,
  "status": "success",
  "pending": [],
  "awaitingUserLink": [],
  "totals": {
    "pending": 0,
    "awaitingLink": 0
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

## Authentication Endpoints

### GET `/auth/discord`

Initiates Discord OAuth2 login flow.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `redirect` | string | Optional. URL to redirect after login (same-origin only) |

**Response:** Redirects to Discord OAuth authorization page

**Example:**

```
GET /auth/discord?redirect=/pricing
```

---

### GET `/auth/discord/callback`

Handles Discord OAuth2 callback. **Do not call directly.**

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `code` | string | Authorization code from Discord |
| `state` | string | CSRF protection state |

**Response:** Redirects to specified redirect URL or `/`

---

### GET `/auth/me`

Returns the currently authenticated user's information.

**Authentication:** Required (session cookie)

**Response (Authenticated):**

```json
{
  "success": true,
  "status": "success",
  "user": {
    "id": "YOUR_DISCORD_USER_ID",
    "username": "your_username",
    "discriminator": "0",
    "avatar": "abc123def456",
    "email": "user@example.com",
    "credits": 0,
    "role": "user"
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

**Response (Not Authenticated):**

```json
{
  "status": "error",
  "message": "Not authenticated",
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

### POST `/auth/logout`

Logs out the current user and destroys the session.

**Authentication:** Required (session cookie)

**Response:**

```json
{
  "success": true,
  "status": "success",
  "message": "Logged out successfully",
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

---

## Webhook Endpoints

These endpoints receive payment notifications from payment providers.

### POST `/webhook/crypto`

Receives webhooks from crypto payment providers (Plisio).

**Headers (Provider-specific):**

- Plisio: Body contains `verify_hash`

**Response:** `200 OK` with `{ "received": true }`

---

### POST `/webhook/verify`

Verifies webhook token configuration.

**Response:** `200 OK` with verification status

---

## Health Endpoints

### GET `/health`

Returns server health status.

**Response (200 OK):**

```json
{
  "status": "healthy",
  "service": "Unified API Server",
  "uptime": 12345,
  "memory": { "rss": 50000000, "heapTotal": 80000000, "heapUsed": 45000000 },
  "environment": "production",
  "checks": {
    "database": { "status": "healthy", "duration": 15 },
    "memory": { "status": "healthy" },
    "discord_api": { "status": "healthy", "ping": 45 }
  },
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "unhealthy",
  "service": "Unified API Server"
}
```

Also available: `GET /api/v1/health`, `GET /health/docker`

---

## Response Format

Successful responses include `success: true`, `status: "success"`, payload fields at the top level, and a `timestamp`:

```json
{
  "success": true,
  "status": "success",
  "...payload": "...",
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

Error responses use `status: "error"` with a human-readable `message`:

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "timestamp": "2026-09-24T10:00:00.000Z"
}
```

Some endpoints may also include `success: false` and an `error` field — check the specific endpoint docs above.

---

## Error Codes

| Status Code | Description                            |
| ----------- | -------------------------------------- |
| 200         | Success                                |
| 400         | Bad Request - Invalid parameters       |
| 401         | Unauthorized - Authentication required |
| 403         | Forbidden - Insufficient permissions   |
| 404         | Not Found - Resource doesn't exist     |
| 405         | Method Not Allowed                     |
| 408         | Request Timeout                        |
| 429         | Too Many Requests - Rate limited       |
| 500         | Internal Server Error                  |
| 503         | Service Unavailable                    |

---

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **API endpoints:** 100 requests per minute per IP
- **Webhook endpoints:** 30 requests per minute per IP

When rate limited, you'll receive:

```json
{
  "success": false,
  "error": {
    "message": "Too many requests",
    "code": 429
  },
  "retryAfter": 60
}
```

---

## CORS

The API supports CORS for browser-based requests. Allowed origins are configured via the `CORS_ALLOWED_ORIGINS` environment variable.

For session-based authentication, ensure you include `credentials: 'include'` in your fetch requests.

---

## SDK Example (JavaScript)

```javascript
class RoleReactorAPI {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    return response.json();
  }

  // Auth
  async getCurrentUser() {
    return this.request("/auth/me");
  }

  async logout() {
    return this.request("/auth/logout", { method: "POST" });
  }

  // Pricing
  async getPricing(userId = null) {
    const query = userId ? `?user_id=${userId}` : "";
    return this.request(`/api/v1/pricing${query}`);
  }

  // Payments
  async createPayment(amount, packageId = null) {
    return this.request("/api/v1/payments/create", {
      method: "POST",
      body: JSON.stringify({ amount, packageId }),
    });
  }

  async getUserBalance(userId) {
    return this.request(`/api/v1/user/${userId}/balance`);
  }

  async getUserPayments(userId, options = {}) {
    const params = new URLSearchParams(options);
    return this.request(`/api/v1/user/${userId}/payments?${params}`);
  }
}

// Usage
const api = new RoleReactorAPI("https://api.rolereactor.xyz");

// Get current user
const { user } = await api.getCurrentUser();

// Create payment
const { invoiceUrl } = await api.createPayment(10, "$10");
window.location.href = invoiceUrl;
```

---

## Environment Variables

Required configuration for the API server:

```env
# Discord OAuth
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=https://your-domain.com/auth/discord/callback

# Session
SESSION_SECRET=random_secure_string

# Payments
PLISIO_SECRET_KEY=your_plisio_key

# Server
PUBLIC_URL=https://your-domain.com
API_PORT=3030
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```
