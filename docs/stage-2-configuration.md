# AutoFlow — Stage 2 Project Configuration

**Status:** Complete  
**Target:** Chromium Manifest V3  
**Package manager:** pnpm through Corepack

## Technical decisions

### Plasmo configuration

Plasmo 0.90.5 does not support a separate `plasmo.config.ts`. AutoFlow therefore uses Plasmo's supported conventions:

- Extension metadata, permissions, host permissions, CSP, and other manifest overrides live in `package.json`.
- All extension source entry points will live under Plasmo's default `src` source root.
- Scripts pass `--target=chrome-mv3` explicitly so local development, builds, and packages cannot silently target a different manifest/browser combination.
- The repository pins pnpm through Corepack because it is Plasmo's recommended package manager and resolves Plasmo's broad bundler graph deterministically.

### Dependency compatibility

- React 19 is supported by Plasmo 0.90.x.
- TypeScript is pinned to 5.9.3 instead of 7.x because the selected type-aware ESLint toolchain currently supports TypeScript versions below 6.1.
- ESLint is pinned to the maintained 9.x line with flat configuration and type-aware `typescript-eslint` rules.
- Tailwind CSS 3.4 uses the established PostCSS configuration flow supported by the current Plasmo/Parcel pipeline.
- Vitest 4 uses JSDOM and explicit browser API mocks. Test setup and mocks arrive in Stage 8.
- React Router remains on the maintained 6.x compatibility line to keep extension-safe hash routing straightforward in Stage 7.

### Manifest permissions

- `storage`: Plasmo Storage-backed small records and durable coordination state.
- `downloads`: user-requested and explicitly enabled automatic downloads.
- `tabs`: active-tab platform detection and content-script coordination.
- `sidePanel`: the preferred in-context workspace.
- `alarms`: worker-safe maintenance and queue recovery hints.

Host access is limited to the documented AI platform hosts. `x.com` host access is required only for the Grok route and does not authorize content scripts on unrelated routes. Content-script match patterns in Stage 6 will narrow execution further.

`https://api.example.com/*` is an optional placeholder origin. A real deployment must replace it with the actual fixed backend origin or implement an explicit optional-origin permission flow. AutoFlow does not request `<all_urls>`.

### Strictness and quality gates

- TypeScript enables strict mode plus exact optional properties, unchecked-index protection, exhaustive-return checks, and unused-code checks.
- ESLint uses type-aware strict and stylistic presets, React Hooks checks, floating-promise detection, exhaustive-switch checks, and a no-console policy.
- Prettier owns formatting to avoid lint/formatter conflicts.
- Husky runs lint-staged checks at commit time after dependencies are installed.
- `pnpm run validate` performs type checking, linting, tests, and a formatting check.

## Files created

- `package.json`
- `tsconfig.json`
- `tailwind.config.ts`
- `.postcssrc.json`
- `eslint.config.mjs`
- `.prettierrc.mjs`
- `vitest.config.ts`
- `.env.example`
- `.gitignore`
- `.prettierignore`
- `.husky/pre-commit`
- `docs/stage-2-configuration.md`

## Assumptions and known limitations

- Stage 2 contains configuration only. Plasmo entry points begin in later stages, so an extension build cannot yet produce functional UI or automation.
- Vitest temporarily allows an empty test suite; Stage 8 adds tests and can remove that transitional setting.
- Tailwind theme variables are configured, but their CSS definitions arrive with shared UI styling in a later stage.
- Google Flow's exact production route remains provisional and must be verified before Stage 6 claims live support.
- The `tabs` permission will be reassessed after active-tab and cross-tab coordination are implemented; it will be narrowed if Chromium APIs allow all required behavior with less access.
- The package is private and uses an `UNLICENSED` placeholder until Stage 9 establishes the requested license placeholder.
- The execution environment forced package managers offline and routed HTTP(S) through a non-routable proxy. Process-local overrides allowed package metadata checks but full npm/pnpm installation repeatedly timed out before an atomic lockfile or complete dependency tree was produced. Partial generated dependency directories were removed. Consequently, dependency-backed type-check, lint, test, and Plasmo build commands remain pending until `pnpm install` can run with normal registry access.

## Validation performed

- `package.json` parsed successfully and passed checks for every required script, required framework dependency, supported host permission, and absence of `<all_urls>`.
- `eslint.config.mjs` and `.prettierrc.mjs` passed Node syntax checks; `.postcssrc.json` is validated as JSON.
- `tailwind.config.ts` and `vitest.config.ts` passed Node's TypeScript syntax check using type stripping.
- Package versions and peer ranges were checked against npm registry metadata before pinning.
- Full `pnpm run validate` and `pnpm run build` were not run because dependency installation could not complete in this environment.
