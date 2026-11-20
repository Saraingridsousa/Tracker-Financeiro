# Audit remediation — implementation contract and checklist

Authority: Sara's explicit request to implement every issue in AUDIT.md, keep React/TypeScript/Vite, install development dependencies, create incremental validated Conventional Commits and push each to the existing origin. Baseline: main, e066b54d7207651bd0f83dc2b4dbe9b23f950b0f. The working tree was clean and origin/main matched at discovery.

## Boundaries

Preserve existing financial data and existing functionality. No banking connections, actual provider credentials, paid services, public deployment, force push, history rewrite or unrelated changes. Synthetic fixtures are tests, not replacement application functionality. Secrets/financial databases belong outside repository and OneDrive. Current backend target is PC-only loopback, not LAN/remote access; future exposure needs separate approval. Bank coverage/live synchronization remains explicitly unvalidated and is not a completion criterion for preparatory backend work.

## Completion rule

A task is completed only with implementation, regression tests, integration/type/build checks where applicable, reviewed diff, commit and verified remote branch readback. Keep failures/blockers explicit; continue independent tasks. Stage explicit allowlists. Update this canonical checklist at each meaningful milestone; no competing work queues. Each phase handoff records changed files, commands/results, commit IDs, push verification and remaining tasks. Tests follow RED -> GREEN -> refactor, with real domain/persistence code and service boundaries mocked only when necessary.

## Phase 1 — integrity and recovery

Status legend: `[x]` implemented and regression-validated in the corresponding milestone; `[~]` in progress/partial; `[ ]` pending. Git/remote gate is verified at milestone publication. This is not a claim that all phases or live banking are complete.

- [x] P1-01 / A04: versioned, runtime-validated unified snapshot/backup; strict legacy migration; incompatible formats fail before mutating any store.
- [x] P1-02 / A04: recovery snapshots, preservation of corrupt payloads, blocked destructive autosave, storage failure UI and explicit restore confirmation.
- [~] P1-03 / A03: account/provider-scoped stable identities, upsert corrections, equal legitimate purchases retained, manual override preservation.
- [x] P1-04: consistent persistence envelope, revision/concurrency handling, safe same-origin/cross-tab coordination and migration without deleting old keys/data.
- [x] P1-05: automated callback/storage integration tests plus test/typecheck tooling.

## Phase 2 — financial correctness and ingestion

- [ ] P2-01 / A01,A10: Pix/TED rails do not imply own transfers; common category/neutral policy; manual precedence; no reload-dependent classification.
- [ ] P2-02 / A02: explicit monetary units/currency/rounding, whole-token locale parsing, numeric spreadsheet cells preserved.
- [ ] P2-03 / A05: structural OFX parsing/boundaries/FITID and strict signs/dates.
- [ ] P2-04 / A05: CSV explicit debit/credit, invoice refunds, validated headers/dates, no fabricated zeros/dates, immutable raw provenance.
- [ ] P2-05 / importer F03,F08,F09,F12: structural Excel headers, ISO/serial/date-system support, no balance fallback or merchant-word filtering, sheet choice/diagnostics.
- [ ] P2-06 / importer F06,F07,F10,F11,F17: PDF whole amount tokens, explicit/inherited dates, suffix direction, horizontal geometry, common settlement semantics, no raw logging, binary-PDF tests/limits.
- [ ] P2-07 / importer F13-F16: conservative bank origin, non-destructive descriptions, stable identity and rejected-row preview.
- [ ] P2-08 / A08,A09: period result versus observed balance; current-clock bounded month/year filters; separate consumption/cash/portfolio meanings.
- [ ] P2-09 / A10: user rules active/ordered, neutral flags preserved, orphan references and keyword editing fixed, explicit historical recategorization.
- [ ] P2-10 / A11: uncategorized/Other chart buckets, consistent denominators, month/year labels, Top-N filter scope, safe pagination and currency display.

## Phase 3 — investments

- [ ] P3-01 / A06: atomic validated trade commands, reject negative/zero/nonfinite/oversells/unknown sells, execution price distinct from valuation.
- [ ] P3-02 / A07: idempotent position snapshots, weighted acquisition cost, correct CSV headers/quoting/asset type validation.
- [ ] P3-03 / state F12,F15,F16: reconcile order lifecycle with holdings; auditable correction/reversal/history, preserve history on archive; target allocation editing including zero.
- [ ] P3-04: honest realized/unrealized P/L and unsupported metrics; manual/provider portfolio boundary, no fake live prices.

## Phase 4 — security and maintainability

- [~] P4-01 / A12: maintained dependency versions/distribution, refreshed lock, online audit, compatibility tests; no blind force fixes.
- [ ] P4-02: loopback development/runtime defaults, safe ignore patterns, no sensitive logs or client credentials, bounded file/request processing.
- [ ] P4-03: shared domain selectors/normalization, remove duplicate calculations, lazy heavy screens, cancellation/progress where applicable and bundle verification.
- [ ] P4-04: accessible dialogs/keyboard/input labels, responsive/themes and loading/error/empty states verified in browser.
- [ ] P4-05: README, data semantics/recovery/limits, scripts and CI; generated artifact hygiene.

## Phase 5 — private backend and persistence

- [ ] P5-01: actual transactional SQLite repository outside Git/OneDrive, migrations, validated snapshot API, bounded requests and recoverable backups.
- [ ] P5-02: loopback-only server on every entrypoint, Host/Origin protection, path-safe static serving, sanitized failures and conflict-aware writes.
- [ ] P5-03: real frontend/backend persistence integration, explicit safe browser-data migration, no silent replacement of either existing store.
- [ ] P5-04: provider-ready account/currency/consent/sync provenance contract and safe private configuration path; no live bank connector activated.
- [ ] P5-05: real SQLite/HTTP/restart/conflict/invalid restore tests and browser-to-backend acceptance, isolated storage; secret-canary build checks.

## Evidence / phase log

### Milestone 1 — shared data safety

Implemented `src/data/{snapshot,financeStore,transactionIdentity,defaultCategories}.ts`, shared both hooks, App validated restore/confirmation/recovery UI, and explicit amount/provenance/override types. Runtime validates all five collections before a single primary snapshot write. Reads/mount do not autosave; corruption/read/quota/recovery failure preserves originals and blocks writes. Monotonic revisions + Web Locks serialize writes; stale tabs fail closed. Restores and bulk clears preserve non-rotating recovery archives, available for export; a valid previous snapshot can be explicitly restored. Candidate validation does not latch a healthy store. Category deletion/dependent reassignment is atomic, including rule/override cleanup.

Identity core retains equal legitimate purchases, scoped corrections, immutable import namespace, manual overrides and ambiguous candidates instead of dropping them. **P1-03 remains partial until Phase 2 attaches source/account provenance in every parser and exposes review candidates.** A bank label alone is deliberately not accepted as an account identity. Legacy records are not silently classified or rewritten on load.

Verification: 62 synthetic regression tests, including actual React hooks and five App restore handlers (only chart rendering replaced); application/test typechecks; real production build. jsdom is not browser E2E. Independent read-only source review produced seven concrete findings; validation, immutable identity, queued restore, persistent recovery export, atomic dependent changes, candidate-error handling and null legacy collections were addressed and covered. Remaining form submit/promise UX belongs to P2/P3/P4, and portfolio accounting/history has not been corrected yet.

Security prerequisite: older added test tooling introduced critical advisories, so it was not committed. Clean, non-forced dependency resolution selected Vitest 5.1.1, Vite 8.3.8 and plugin-react 6.3.0, with Bundler module resolution and test project references. Fresh `npm ci`, tests/typechecks/build pass on Node 22.18.0. Current online audit: **one pre-existing high issue (`xlsx`), zero critical/moderate**; maintained SheetJS distribution is still pending P2/P4. Large chunks remain pending P4. Failed wrapper/CLI attempts are not counted as successful work.

Work branch is **fix/audit-remediation**. Push each validated milestone there; **do not merge into main** without Sara's explicit authorization. Main remains at the initial checklist commit. Private audit/raw execution evidence remains outside Git. Browser financial data was never opened or modified; fixtures are synthetic. Backend, real bank consent/coverage, public hosting and paid plans remain unimplemented/out of scope for this milestone. Full audit remediation is still in progress.
