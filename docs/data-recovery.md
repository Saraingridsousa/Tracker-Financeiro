# Data contract, backup and recovery

## Current boundary

The React/TypeScript/Vite application now uses one validated document for transactions, categories, rules, investment positions and orders. The primary browser key is `tracker-financeiro:snapshot:v1`:

```json
{
  "family": "tracker-financeiro",
  "schemaVersion": 1,
  "revision": 0,
  "savedAt": "2026-11-01T12:00:00.000Z",
  "data": {
    "transactions": [], "categories": [], "rules": [],
    "assets": [], "investmentOrders": []
  }
}
```

This example documents structure; the application does not seed financial records. `src/data/snapshot.ts` is the shared runtime contract. Transaction amounts are non-negative **BRL major units (reais)**, not cents; income/expense carries direction. No legacy amount is silently multiplied, divided, rounded or reclassified during migration. Strict dates reject calendar rollovers. Finite numeric fields, enums, collections, unique local IDs, timestamps and manual override values are checked before restoring any collection. Historical orphan references are preserved for explicit reconciliation rather than silently dropping records or inventing accounts.

## Migration

Old transaction/category, rule, investment and order keys are read and validated together. Merely mounting a screen does not write anything. The first successful mutation writes the new document, with a recovery copy first. Old keys are **not deleted**. Invalid JSON, unsupported shapes, inaccessible storage or malformed financial fields block writes and show recovery actions; they never trigger an empty autosave.

Known historical transaction backups must contain transactions, categories, rules and exportedAt. When both investment keys are absent, current investments are preserved. When either is present, both must be present and valid arrays; null is not an empty collection. Unrelated JSON is not a backup.

## Restore and undo

Use the settings menu to export a normal backup, select a backup, inspect record counts and explicitly confirm replacement. All five collections validate before the one primary document changes. A failed recovery write or primary save leaves displayed data unchanged and shows an error. Backups larger than 10 MiB are rejected before decoding.

Before an ordinary edit, the previous raw document is stored at `tracker-financeiro:recovery`. Restore and bulk-clear operations also preserve uniquely named recovery archives; subsequent edits do not rotate away those archives. Settings provides **Restaurar cópia anterior** for a valid prior document and **Exportar recuperações preservadas** for current captured data, previous raw payloads and archived recovery evidence. The latter is an evidence envelope, not a normal backup: corrupt originals are deliberately retained verbatim, not automatically trusted/imported. If the previous payload is corrupt, automatic undo refuses it; export the evidence and use a known valid backup.

Do not clear browser site storage to resolve a warning. Export recovery first. Browser storage/backups are plaintext and subject to quota, user deletion and device failure; downloaded files need the same protection as statements. Archives are not automatically deleted to free quota. A quota error blocks further financial writes instead of discarding old evidence. The planned private SQLite backend replaces this capacity-limited browser persistence; it is not implemented by this milestone.

## Identity and manual edits

Equal dates/descriptions/amounts are not proof of duplication. Upserts use scoped external/import identity, preserve the original local ID and createdAt, and keep allowlisted manual overrides separate from imported values. The import scope is immutable even if the displayed bank label changes. Different accounts/providers and distinct purchase IDs remain separate. Multiple possible matches or missing source context preserve candidates with `identityAmbiguous` instead of choosing a record silently. A bank label is **not** a verified account ID; legacy data cannot establish missing account provenance. Parsers and import-review UI will improve provenance and expose ambiguous candidates in Phase 2.

Legacy imported records carrying updatedAt from the old manual-edit UI conservatively retain their edited fields on the first upsert. New overrides cannot rewrite identity/provider fields. Category deletion and dependent transaction/rule changes now use one storage transaction. Portfolio trade accounting/history and position-import semantics remain Phase 3 work, not fixed by moving them into shared persistence.

## Concurrency and failures

Mutations are serialized per tab and through the browser Web Locks API across same-origin tabs. The persisted raw base/revision is checked while holding the lock; a stale tab refuses to overwrite another tab. A storage event preserves this tab's snapshot and requires explicit reload. Use an updated browser on localhost; if safe locks are unavailable or denied, writes fail closed. Invalid candidate input does not put a valid durable store permanently into recovery mode. `FinanceStore.update/restore` and collection setters expose promises; initiating UI flows should await them. File/restore flows already do; remaining category/portfolio form submit flows are tracked in subsequent phases.

## Verification for this milestone

62 tests currently cover schema, real storage implementation with synthetic IO failure injection, actual React hooks, and the App restore handlers. The five App tests replace only chart rendering; financial logic, hooks, persistence and handlers are real. Vitest's browser environment is jsdom, **not browser E2E**. Tests use synthetic fixtures only. Source and test typechecks plus a production build pass on Node 22.18.0. Vitest 5/Vite 8/plugin-react 6 were selected together to remove critical advisories in older test tooling; Bundler module resolution is required for their package exports. npm audit now reports one pre-existing high finding in the old SheetJS registry package; the maintained distribution/parser upgrade is pending. Large client chunks and browser accessibility/end-to-end checks remain tracked, not waived.
