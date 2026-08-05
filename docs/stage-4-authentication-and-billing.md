# Stage 4: Authentication and billing

Stage 4 adds a complete development-only authentication, subscription, and usage slice behind
replaceable API contracts. It intentionally does not connect to a payment provider or collect card
details.

## Runtime design

`createApplicationServices` is the composition root. It selects the persisted mock transport when
`PLASMO_PUBLIC_USE_MOCK_API=true`, otherwise it uses the real HTTP transport configured in Stage 2.
The same typed API modules, services, and Zustand stores are used in both modes.

The auth service owns session persistence and coordinates one refresh operation across concurrent
callers. Authentication-free endpoints explicitly opt out of bearer injection and 401 refresh so a
failed refresh cannot recursively refresh itself. Protected routes wait for session restoration and
return users to their original internal path after login.

The billing service is provider-neutral. Its mock checkout returns a reference only; upgrades,
downgrades, cancellation, invoices, and monthly usage are separate operations so a future hosted
checkout provider can replace the mock without rewriting the subscription page.

## Mock endpoints

| Method | Path                    | Behavior                                                                         |
| ------ | ----------------------- | -------------------------------------------------------------------------------- |
| POST   | `/auth/signup`          | Validates input, hashes the password, creates a free account, and issues tokens. |
| POST   | `/auth/login`           | Verifies a salted mock password hash and issues a session.                       |
| POST   | `/auth/logout`          | Revokes the current hashed mock session.                                         |
| POST   | `/auth/refresh`         | Rotates an unexpired refresh token.                                              |
| POST   | `/auth/forgot-password` | Returns a non-enumerating development placeholder response.                      |
| GET    | `/auth/me`              | Returns the authenticated profile or a typed 401 error.                          |
| GET    | `/billing/subscription` | Returns the authenticated user's current mock plan.                              |
| POST   | `/billing/checkout`     | Returns a mock checkout completion reference without payment data.               |
| POST   | `/billing/change-plan`  | Changes plan and recalculates the monthly limit.                                 |
| POST   | `/billing/cancel`       | Schedules cancellation at the period end.                                        |
| GET    | `/billing/invoices`     | Returns the paginated billing-history placeholder.                               |
| GET    | `/usage`                | Returns current monthly usage.                                                   |
| POST   | `/usage/increment`      | Applies one idempotent usage event and enforces the plan limit.                  |

Mock latency and failure rate use the public environment configuration from Stage 2. The seeded
development account is `demo@luffyflow.local` with password `Demo123!`.

## Security boundaries

- Submitted passwords exist only in request/form values. Persisted mock accounts contain a random
  salt and SHA-256 hash, never a plaintext password.
- SHA-256 password hashing is explicitly development-only and must be replaced by server-side
  Argon2id, scrypt, or bcrypt when a real backend is introduced.
- Persisted mock server sessions contain only access-token and refresh-token hashes. The client auth
  namespace stores the mock tokens required for extension session restoration.
- Structured logging redacts passwords, tokens, authorization headers, and prompt content in privacy
  mode.
- Checkout return URLs reject script/data schemes, and the UI neither renders nor accepts card
  fields.

## Files created in Stage 4

- `src/api/mock/crypto.ts`
- `src/api/mock/state.ts`
- `src/api/mock/register-mock-routes.ts`
- `src/api/mock/create-mock-api.ts`
- `src/api/modules/auth-api.ts`
- `src/api/modules/billing-api.ts`
- `src/api/modules/usage-api.ts`
- `src/api/modules/index.ts`
- `src/services/auth/auth-service.ts`
- `src/services/auth/create-auth-storage.ts`
- `src/services/auth/delegating-token-provider.ts`
- `src/services/auth/index.ts`
- `src/services/billing/subscription-service.ts`
- `src/services/billing/index.ts`
- `src/services/create-application-services.ts`
- `src/services/index.ts`
- `src/stores/auth-store.ts`
- `src/stores/billing-store.ts`
- `src/components/auth/AuthProvider.tsx`
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/SignupForm.tsx`
- `src/components/auth/ForgotPasswordForm.tsx`
- `src/routes/ProtectedRoute.tsx`
- `src/pages/LoginPage.tsx`
- `src/pages/SignupPage.tsx`
- `src/pages/SubscriptionPage.tsx`
- `docs/stage-4-authentication-and-billing.md`

Stage 4 also extends the auth/billing schemas, API client authentication policy, billing store invoice
state, and API barrel exports.

## Validation and known limitations

- All local TypeScript/TSX import targets resolve.
- Node's TypeScript parser accepts every non-JSX TypeScript module.
- Static security scans found no `eval`, raw HTML injection, card-capture fields, or plaintext password
  field in persisted mock state.
- Package installation remains unavailable in this environment because registry access is forced
  offline and the required packages are not cached. Consequently, full `tsc`, ESLint, Prettier,
  Vitest, and Plasmo build verification must be run after dependencies can be installed.
- This is not production authentication or billing. Mock tokens and state exist only to exercise the
  replaceable application contracts.
- Actual prompt-file parsing and the file-picker UI belong to Stages 5 and 7. Stage 3 already treats
  `.txt` as a first-class validated prompt import format alongside CSV and JSON; those later stages
  will wire it into the queue and visible prompt-entry UI.
