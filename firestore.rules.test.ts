/**
 * Security Rules Specification Test Harness for FerroCota
 * Documents the 12 "Dirty Dozen" adversarial payloads that must fail with PERMISSION_DENIED.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read of catalog item',
    operation: 'get',
    path: '/catalogItems/item-1',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email creating catalog item',
    operation: 'create',
    path: '/catalogItems/item-1',
    auth: { uid: 'user-a', email_verified: false },
    payload: { ownerId: 'user-a', sheet: 'material', category: 'Vigas', description: 'IPE 100' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity spoofing ownerId on create',
    operation: 'create',
    path: '/catalogItems/item-2',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-b', sheet: 'material', category: 'Vigas', description: 'IPE 200' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-tenant PII read on companyProfiles',
    operation: 'get',
    path: '/companyProfiles/user-b',
    auth: { uid: 'user-a', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unscoped collection list query on quotes',
    operation: 'list',
    path: '/quotes',
    auth: { uid: 'user-a', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow field injection (isAdmin: true)',
    operation: 'create',
    path: '/catalogItems/item-3',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-a', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'ID poisoning with invalid characters',
    operation: 'create',
    path: '/catalogItems/invalid$id!bad',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-a' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Resource exhaustion via oversized notes string',
    operation: 'create',
    path: '/quotes/quote-1',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-a', notes: 'x'.repeat(50000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable ownerId/createdAt tampering on update',
    operation: 'update',
    path: '/quotes/quote-1',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-b' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Backdated client timestamp instead of request.time',
    operation: 'create',
    path: '/catalogItems/item-4',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-a', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Terminal state mutation on approved quote',
    operation: 'update',
    path: '/quotes/quote-approved',
    auth: { uid: 'user-a', email_verified: true },
    payload: { grandTotal: 1 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned or cross-tenant line creation',
    operation: 'create',
    path: '/quotes/quote-of-user-b/lines/line-1',
    auth: { uid: 'user-a', email_verified: true },
    payload: { ownerId: 'user-a', quoteId: 'quote-of-user-b' },
    expected: 'PERMISSION_DENIED',
  },
];
