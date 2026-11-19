import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { INITIAL_CATALOG_ITEMS } from '../data/initialCatalog';
import type {
  CatalogItem,
  CatalogItemInput,
  CompanyProfile,
  Quote,
  QuoteDraftLine,
  QuoteLine,
  QuoteStatus,
} from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { calculateLineSubtotal, calculateQuoteTotals, roundMoney } from './pricing';

function clampStr(val: string | undefined | null, maxLen: number): string {
  return (val ?? '').toString().trim().slice(0, maxLen);
}

function clampNum(val: number | null | undefined, min: number, max: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function clampNullableNum(val: number | null | undefined, min: number, max: number): number | null {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return null;
  return Math.min(max, Math.max(min, Number(val)));
}

function sanitizeSuppliers(
  suppliers: Record<string, { price: number | null; updatedAt: string }> | undefined
): Record<string, { price: number | null; updatedAt: string }> {
  const out: Record<string, { price: number | null; updatedAt: string }> = {};
  if (!suppliers) return out;
  const entries = Object.entries(suppliers).slice(0, 12);
  for (const [k, v] of entries) {
    const key = clampStr(k, 60);
    if (!key) continue;
    const price = clampNullableNum(v?.price, 0, 100000000);
    const updatedAt = clampStr(v?.updatedAt, 24);
    if (price !== null || updatedAt) {
      out[key] = { price, updatedAt };
    }
  }
  return out;
}

export function generateSafeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return `${prefix}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export function defaultCompanyProfile(ownerId: string, email: string, displayName: string): CompanyProfile {
  return {
    ownerId,
    companyName: displayName ? `${displayName} — Serralharia` : 'A Minha Serralharia, Lda.',
    nif: '',
    address: '',
    phone: '',
    email: clampStr(email, 160),
    logoDataUrl: '',
    defaultMarginPercent: 30,
    defaultVatRate: 23,
    defaultValidityDays: 30,
    defaultPaymentTerms: '50% na adjudicação e 50% na entrega/conclusão da obra.',
    defaultNotes: 'Valores sujeitos a confirmação em obra. Prazo de execução a combinar após adjudicação.',
    catalogSeeded: false,
    nextQuoteSeq: 1,
  };
}

export async function ensureCompanyProfileAndSeed(
  ownerId: string,
  email: string,
  displayName: string
): Promise<CompanyProfile> {
  const profilePath = `companyProfiles/${ownerId}`;
  const profileRef = doc(db, 'companyProfiles', ownerId);

  let profile: CompanyProfile;
  try {
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
      const initial = defaultCompanyProfile(ownerId, email, displayName);
      await setDoc(profileRef, {
        ...initial,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      profile = initial;
    } else {
      profile = snap.data() as CompanyProfile;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, profilePath);
  }

  if (!profile.catalogSeeded) {
    try {
      const existingSnap = await getDocs(
        query(collection(db, 'catalogItems'), where('ownerId', '==', ownerId))
      );

      if (existingSnap.empty) {
        const batch = writeBatch(db);
        for (const item of INITIAL_CATALOG_ITEMS) {
          const itemId = generateSafeId('cat');
          const ref = doc(db, 'catalogItems', itemId);
          batch.set(ref, {
            ownerId,
            sheet: item.sheet,
            category: clampStr(item.category, 140) || 'Geral',
            description: clampStr(item.description, 240),
            unit: clampStr(item.unit, 24),
            suppliers: sanitizeSuppliers(item.suppliers),
            referencePriceMin: clampNullableNum(item.referencePriceMin, 0, 100000000),
            referencePriceMax: clampNullableNum(item.referencePriceMax, 0, 100000000),
            manualSalePrice: clampNullableNum(item.manualSalePrice, 0, 100000000),
            customMarginPercent: clampNullableNum(item.customMarginPercent, 0, 500),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }

      await updateDoc(profileRef, {
        catalogSeeded: true,
        updatedAt: serverTimestamp(),
      });
      profile = { ...profile, catalogSeeded: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'catalogItems');
    }
  }

  return profile;
}

export function subscribeCompanyProfile(
  ownerId: string,
  onData: (profile: CompanyProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `companyProfiles/${ownerId}`;
  return onSnapshot(
    doc(db, 'companyProfiles', ownerId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as CompanyProfile) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        onError(e as Error);
      }
    }
  );
}

export async function updateCompanyProfile(
  ownerId: string,
  patch: Partial<
    Pick<
      CompanyProfile,
      | 'companyName'
      | 'nif'
      | 'address'
      | 'phone'
      | 'email'
      | 'logoDataUrl'
      | 'defaultMarginPercent'
      | 'defaultVatRate'
      | 'defaultValidityDays'
      | 'defaultPaymentTerms'
      | 'defaultNotes'
    >
  >
): Promise<void> {
  const path = `companyProfiles/${ownerId}`;
  const sanitized: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.companyName !== undefined) sanitized.companyName = clampStr(patch.companyName, 160);
  if (patch.nif !== undefined) sanitized.nif = clampStr(patch.nif, 32);
  if (patch.address !== undefined) sanitized.address = clampStr(patch.address, 300);
  if (patch.phone !== undefined) sanitized.phone = clampStr(patch.phone, 40);
  if (patch.email !== undefined) sanitized.email = clampStr(patch.email, 160);
  if (patch.logoDataUrl !== undefined) sanitized.logoDataUrl = (patch.logoDataUrl || '').slice(0, 350000);
  if (patch.defaultMarginPercent !== undefined)
    sanitized.defaultMarginPercent = clampNum(patch.defaultMarginPercent, 0, 500);
  if (patch.defaultVatRate !== undefined)
    sanitized.defaultVatRate = clampNum(patch.defaultVatRate, 0, 100);
  if (patch.defaultValidityDays !== undefined)
    sanitized.defaultValidityDays = Math.round(clampNum(patch.defaultValidityDays, 1, 365));
  if (patch.defaultPaymentTerms !== undefined)
    sanitized.defaultPaymentTerms = clampStr(patch.defaultPaymentTerms, 600);
  if (patch.defaultNotes !== undefined) sanitized.defaultNotes = clampStr(patch.defaultNotes, 1000);

  try {
    await updateDoc(doc(db, 'companyProfiles', ownerId), sanitized);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeCatalogItems(
  ownerId: string,
  onData: (items: CatalogItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'catalogItems'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const items: CatalogItem[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<CatalogItem, 'id'>),
        id: d.id,
      }));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'catalogItems');
      } catch (e) {
        onError(e as Error);
      }
    }
  );
}

export async function createCatalogItem(ownerId: string, input: CatalogItemInput): Promise<string> {
  const id = generateSafeId('cat');
  const path = `catalogItems/${id}`;
  try {
    await setDoc(doc(db, 'catalogItems', id), {
      ownerId,
      sheet: input.sheet,
      category: clampStr(input.category, 140) || 'Geral',
      description: clampStr(input.description, 240),
      unit: clampStr(input.unit, 24),
      suppliers: sanitizeSuppliers(input.suppliers),
      referencePriceMin: clampNullableNum(input.referencePriceMin, 0, 100000000),
      referencePriceMax: clampNullableNum(input.referencePriceMax, 0, 100000000),
      manualSalePrice: clampNullableNum(input.manualSalePrice, 0, 100000000),
      customMarginPercent: clampNullableNum(input.customMarginPercent, 0, 500),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateCatalogItem(itemId: string, input: CatalogItemInput): Promise<void> {
  const path = `catalogItems/${itemId}`;
  try {
    await updateDoc(doc(db, 'catalogItems', itemId), {
      sheet: input.sheet,
      category: clampStr(input.category, 140) || 'Geral',
      description: clampStr(input.description, 240),
      unit: clampStr(input.unit, 24),
      suppliers: sanitizeSuppliers(input.suppliers),
      referencePriceMin: clampNullableNum(input.referencePriceMin, 0, 100000000),
      referencePriceMax: clampNullableNum(input.referencePriceMax, 0, 100000000),
      manualSalePrice: clampNullableNum(input.manualSalePrice, 0, 100000000),
      customMarginPercent: clampNullableNum(input.customMarginPercent, 0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteCatalogItem(itemId: string): Promise<void> {
  const path = `catalogItems/${itemId}`;
  try {
    await deleteDoc(doc(db, 'catalogItems', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function batchImportCatalogItems(
  ownerId: string,
  incomingItems: CatalogItemInput[],
  existingItems: CatalogItem[],
  mode: 'upsert' | 'add_only'
): Promise<{ created: number; updated: number; skipped: number }> {
  const existingMap = new Map<string, CatalogItem>();
  for (const item of existingItems) {
    const key = `${item.sheet}::${item.category.trim().toLowerCase()}::${item.description.trim().toLowerCase()}`;
    existingMap.set(key, item);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Firestore batch limit is 500 ops; chunk by 400
  const chunkSize = 400;
  for (let i = 0; i < incomingItems.length; i += chunkSize) {
    const chunk = incomingItems.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    let opsInBatch = 0;

    for (const raw of chunk) {
      const cat = clampStr(raw.category, 140) || 'Geral';
      const desc = clampStr(raw.description, 240);
      const key = `${raw.sheet}::${cat.toLowerCase()}::${desc.toLowerCase()}`;
      const match = existingMap.get(key);

      if (match) {
        if (mode === 'add_only') {
          skipped++;
          continue;
        }
        const mergedSuppliers = sanitizeSuppliers({
          ...match.suppliers,
          ...raw.suppliers,
        });
        batch.update(doc(db, 'catalogItems', match.id), {
          sheet: raw.sheet,
          category: cat,
          description: desc,
          unit: clampStr(raw.unit || match.unit, 24),
          suppliers: mergedSuppliers,
          referencePriceMin:
            raw.referencePriceMin !== null
              ? clampNullableNum(raw.referencePriceMin, 0, 100000000)
              : match.referencePriceMin,
          referencePriceMax:
            raw.referencePriceMax !== null
              ? clampNullableNum(raw.referencePriceMax, 0, 100000000)
              : match.referencePriceMax,
          manualSalePrice:
            raw.manualSalePrice !== null
              ? clampNullableNum(raw.manualSalePrice, 0, 100000000)
              : match.manualSalePrice,
          customMarginPercent:
            raw.customMarginPercent !== null
              ? clampNullableNum(raw.customMarginPercent, 0, 500)
              : match.customMarginPercent,
          updatedAt: serverTimestamp(),
        });
        updated++;
        opsInBatch++;
      } else {
        const newId = generateSafeId('cat');
        batch.set(doc(db, 'catalogItems', newId), {
          ownerId,
          sheet: raw.sheet,
          category: cat,
          description: desc,
          unit: clampStr(raw.unit, 24),
          suppliers: sanitizeSuppliers(raw.suppliers),
          referencePriceMin: clampNullableNum(raw.referencePriceMin, 0, 100000000),
          referencePriceMax: clampNullableNum(raw.referencePriceMax, 0, 100000000),
          manualSalePrice: clampNullableNum(raw.manualSalePrice, 0, 100000000),
          customMarginPercent: clampNullableNum(raw.customMarginPercent, 0, 500),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        created++;
        opsInBatch++;
      }
    }

    if (opsInBatch > 0) {
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'catalogItems');
      }
    }
  }

  return { created, updated, skipped };
}

export function subscribeQuotes(
  ownerId: string,
  onData: (quotes: Quote[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'quotes'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const quotes: Quote[] = snap.docs.map((d) => ({
        ...(d.data() as Omit<Quote, 'id'>),
        id: d.id,
      }));
      quotes.sort((a, b) => {
        const aTime = (a.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const bTime = (b.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return bTime - aTime;
      });
      onData(quotes);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'quotes');
      } catch (e) {
        onError(e as Error);
      }
    }
  );
}

export async function fetchQuoteLines(ownerId: string, quoteId: string): Promise<QuoteLine[]> {
  const path = `quotes/${quoteId}/lines`;
  try {
    const q = query(
      collection(db, 'quotes', quoteId, 'lines'),
      where('ownerId', '==', ownerId),
      where('quoteId', '==', quoteId)
    );
    const snap = await getDocs(q);
    const lines: QuoteLine[] = snap.docs.map((d) => ({
      ...(d.data() as Omit<QuoteLine, 'id'>),
      id: d.id,
    }));
    lines.sort((a, b) => a.order - b.order);
    return lines;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export interface SaveQuotePayload {
  existingQuoteId?: string;
  quoteNumber: string;
  title: string;
  clientName: string;
  clientNif: string;
  clientContact: string;
  issueDate: string;
  validUntil: string;
  status: QuoteStatus;
  notes: string;
  globalDiscountType: 'percent' | 'fixed';
  globalDiscountValue: number;
  applyVat: boolean;
  vatRate: number;
  lines: QuoteDraftLine[];
  nextQuoteSeqToIncrement?: number;
}

export async function saveQuoteWithLines(
  ownerId: string,
  payload: SaveQuotePayload
): Promise<string> {
  const isNew = !payload.existingQuoteId;
  const quoteId = payload.existingQuoteId || generateSafeId('orc');
  const quoteRef = doc(db, 'quotes', quoteId);

  const totals = calculateQuoteTotals(
    payload.lines,
    payload.globalDiscountType,
    payload.globalDiscountValue,
    payload.applyVat,
    payload.vatRate
  );

  const baseQuoteData = {
    quoteNumber: clampStr(payload.quoteNumber, 40) || 'ORC-001',
    title: clampStr(payload.title, 200),
    clientName: clampStr(payload.clientName, 160),
    clientNif: clampStr(payload.clientNif, 32),
    clientContact: clampStr(payload.clientContact, 160),
    issueDate: clampStr(payload.issueDate, 20),
    validUntil: clampStr(payload.validUntil, 20),
    status: isNew ? 'rascunho' : payload.status,
    notes: clampStr(payload.notes, 2000),
    globalDiscountType: payload.globalDiscountType,
    globalDiscountValue: clampNum(payload.globalDiscountValue, 0, 100000000),
    applyVat: Boolean(payload.applyVat),
    vatRate: clampNum(payload.vatRate, 0, 100),
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    vatTotal: totals.vatTotal,
    grandTotal: totals.grandTotal,
    lineCount: Math.min(500, payload.lines.length),
    updatedAt: serverTimestamp(),
  };

  try {
    const batch = writeBatch(db);

    if (isNew) {
      batch.set(quoteRef, {
        ownerId,
        ...baseQuoteData,
        createdAt: serverTimestamp(),
      });
    } else {
      batch.update(quoteRef, baseQuoteData);

      // Remove existing lines before recreating clean ordered lines
      const existingLines = await fetchQuoteLines(ownerId, quoteId);
      for (const line of existingLines) {
        batch.delete(doc(db, 'quotes', quoteId, 'lines', line.id));
      }
    }

    payload.lines.slice(0, 500).forEach((line, index) => {
      const lineId = generateSafeId('ln');
      const lineSub = calculateLineSubtotal(line);
      batch.set(doc(db, 'quotes', quoteId, 'lines', lineId), {
        ownerId,
        quoteId,
        order: index,
        catalogItemId: clampStr(line.catalogItemId, 128),
        isCustom: Boolean(line.isCustom),
        sheet: clampStr(line.sheet, 32),
        category: clampStr(line.category, 140),
        description: clampStr(line.description, 260) || 'Artigo sem descrição',
        unit: clampStr(line.unit, 24),
        quantity: roundMoney(clampNum(line.quantity, 0, 1000000), 3),
        unitPrice: roundMoney(clampNum(line.unitPrice, 0, 100000000), 3),
        catalogUnitPrice: clampNullableNum(line.catalogUnitPrice, 0, 100000000),
        priceRangeHint: clampStr(line.priceRangeHint, 60),
        sourceSupplier: clampStr(line.sourceSupplier, 80),
        discountType: line.discountType,
        discountValue: roundMoney(clampNum(line.discountValue, 0, 100000000), 2),
        lineSubtotal: lineSub,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();

    if (isNew && typeof payload.nextQuoteSeqToIncrement === 'number') {
      await updateDoc(doc(db, 'companyProfiles', ownerId), {
        nextQuoteSeq: Math.round(clampNum(payload.nextQuoteSeqToIncrement, 1, 1000000)),
        updatedAt: serverTimestamp(),
      });
    }

    return quoteId;
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `quotes/${quoteId}`);
  }
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus): Promise<void> {
  const path = `quotes/${quoteId}`;
  try {
    await updateDoc(doc(db, 'quotes', quoteId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteQuoteWithLines(ownerId: string, quoteId: string): Promise<void> {
  const path = `quotes/${quoteId}`;
  try {
    const existingLines = await fetchQuoteLines(ownerId, quoteId);
    const batch = writeBatch(db);
    for (const line of existingLines) {
      batch.delete(doc(db, 'quotes', quoteId, 'lines', line.id));
    }
    batch.delete(doc(db, 'quotes', quoteId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function duplicateQuote(
  ownerId: string,
  sourceQuote: Quote,
  newQuoteNumber: string,
  nextSeq: number
): Promise<{ quoteId: string; lines: QuoteDraftLine[] }> {
  const sourceLines = await fetchQuoteLines(ownerId, sourceQuote.id);
  const draftLines: QuoteDraftLine[] = sourceLines.map((l) => ({
    localId: generateSafeId('draft'),
    catalogItemId: l.catalogItemId,
    isCustom: l.isCustom,
    sheet: l.sheet,
    category: l.category,
    description: l.description,
    unit: l.unit,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    catalogUnitPrice: l.catalogUnitPrice,
    priceRangeHint: l.priceRangeHint,
    sourceSupplier: l.sourceSupplier,
    discountType: l.discountType,
    discountValue: l.discountValue,
  }));

  const newId = await saveQuoteWithLines(ownerId, {
    quoteNumber: newQuoteNumber,
    title: sourceQuote.title ? `${sourceQuote.title} (Cópia)` : 'Cópia de Orçamento',
    clientName: sourceQuote.clientName,
    clientNif: sourceQuote.clientNif,
    clientContact: sourceQuote.clientContact,
    issueDate: sourceQuote.issueDate,
    validUntil: sourceQuote.validUntil,
    status: 'rascunho',
    notes: sourceQuote.notes,
    globalDiscountType: sourceQuote.globalDiscountType,
    globalDiscountValue: sourceQuote.globalDiscountValue,
    applyVat: sourceQuote.applyVat,
    vatRate: sourceQuote.vatRate,
    lines: draftLines,
    nextQuoteSeqToIncrement: nextSeq,
  });

  return { quoteId: newId, lines: draftLines };
}
