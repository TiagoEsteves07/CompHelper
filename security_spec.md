# Security Specification — FerroCota Firestore Rules

## 1. Data Invariants
1. **Strict Ownership Isolation (PII & Commercial Pricing)**: Every document in `companyProfiles`, `catalogItems`, `quotes`, and `quotes/{quoteId}/lines` belongs to a single verified user (`ownerId == request.auth.uid` and `request.auth.token.email_verified == true`). No cross-user read, list, create, update, or delete is permitted.
2. **Master Gate on Subcollections**: Every line in `quotes/{quoteId}/lines/{lineId}` must belong to an existing (or atomically created via `getAfter`) parent quote whose `ownerId == request.auth.uid`, and `incoming().quoteId == quoteId`.
3. **Terminal Quote State Locking**: Once a quote transitions to a terminal commercial outcome (`aprovado` or `recusado`), direct updates to the quote or its lines are rejected; revisions must be created by duplicating into a new `rascunho` quote.
4. **Immutable Ownership & Temporal Integrity**: `ownerId` and `createdAt` can never be changed after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **Strict Schema & Size Guards**: Every document enforces exact allowed/required keys (`hasAll` + `hasOnly`), string length caps, numeric bounds, supplier map cap (`suppliers.size() <= 12`), and path ID regex validation (`^[a-zA-Z0-9_\-]+$`).

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Read/Write**: Reading `/catalogItems/item-1` without auth -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Creating `/catalogItems/item-1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: User A creating `/catalogItems/item-2` with `ownerId: "user-B"` -> `PERMISSION_DENIED`.
4. **Cross-Tenant PII Read**: User A calling `get` on `/companyProfiles/user-B` -> `PERMISSION_DENIED`.
5. **Unfiltered Collection Scraping (`list`)**: User A listing `/quotes` without `where('ownerId', '==', 'user-A')` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Creating/updating a `CatalogItem` with extra ghost field `isAdmin: true` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: Creating `/catalogItems/bad$id/../../../x` or >128-char ID -> `PERMISSION_DENIED`.
8. **Resource Exhaustion (Oversized String)**: Creating a `Quote` with a 50KB `notes` string -> `PERMISSION_DENIED`.
9. **Immutable Field Tampering**: Updating a `Quote` to change `ownerId` or `createdAt` -> `PERMISSION_DENIED`.
10. **Client-Spoofed Timestamp**: Creating a `CatalogItem` with backdated client `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
11. **Terminal State Bypass**: Updating a `Quote` whose `existing().status == 'aprovado'` -> `PERMISSION_DENIED`.
12. **Orphaned / Cross-Tenant Line Write**: Creating `/quotes/quote-of-user-B/lines/line-1` as User A or with non-existent parent `quoteId` -> `PERMISSION_DENIED`.
