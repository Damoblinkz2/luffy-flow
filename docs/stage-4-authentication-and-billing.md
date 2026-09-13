# Stage 4 authentication and token billing

Stage 4 originally established the authentication and billing boundaries. The current implementation connects those boundaries directly to the standalone LuffyFlow backend and uses a prepaid token wallet: one successfully submitted prompt costs one token.

## Backend contract

| Method  | Path                   | Behavior                                                   |
| ------- | ---------------------- | ---------------------------------------------------------- |
| `POST`  | `/auth/signup`         | Creates an account, session, and welcome-token wallet.     |
| `POST`  | `/auth/login`          | Verifies credentials and creates a session.                |
| `POST`  | `/auth/refresh`        | Rotates access and refresh tokens.                         |
| `POST`  | `/auth/logout`         | Revokes the current session.                               |
| `GET`   | `/auth/me`             | Restores and verifies the authenticated user.              |
| `GET`   | `/billing/token-packs` | Returns server-owned pack quantities and prices.           |
| `POST`  | `/billing/checkout`    | Creates a pending Paystack or NOWPayments hosted checkout. |
| `GET`   | `/billing/purchases`   | Returns the user's token purchase history.                 |
| `GET`   | `/tokens/balance`      | Returns balance, lifetime totals, and reminder settings.   |
| `POST`  | `/tokens/debit`        | Charges one token for one unique prompt attempt.           |
| `PATCH` | `/tokens/reminder`     | Saves an enabled flag and low-balance email threshold.     |

The extension contains no seeded users, balances, purchases, or payment success responses. Payment providers credit the wallet only after the backend verifies a signed webhook or provider status.

## Safety boundaries

- Payment forms are hosted by Paystack or NOWPayments; the extension never accepts card data, secret keys, or wallet seeds.
- Pack prices and token quantities come from the API catalog, not checkout input.
- A stable idempotency key makes each prompt attempt charge at most once. A deliberate retry has a new attempt number and costs one additional token.
- The queue checks balance before each claim and charges only after the content script confirms submission.
- Output capture never charges tokens because output events may be duplicated or absent.
- Access tokens are attached only to the build-time validated API origin. A production build rejects a localhost API URL.

## Key implementation files

- `src/config/env.ts`
- `src/api/transports/HttpTransport.ts`
- `src/api/modules/auth-api.ts`
- `src/api/modules/billing-api.ts`
- `src/api/modules/token-api.ts`
- `src/services/auth/auth-service.ts`
- `src/services/billing/token-billing-service.ts`
- `src/stores/auth-store.ts`
- `src/stores/billing-store.ts`
- `src/pages/TokensPage.tsx`
- `src/background/create-background-runtime.ts`

For local development the extension uses `http://localhost:8787/api/v1`. Before distribution, set the deployed HTTPS URL, grant only that origin in the manifest, and rebuild the extension.
