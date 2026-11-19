export type CatalogSheet = 'material' | 'material_cons' | 'servicos' | 'outros';

export type QuoteStatus = 'rascunho' | 'enviado' | 'aprovado' | 'recusado';

export type DiscountType = 'percent' | 'fixed';

export interface SupplierQuote {
  price: number | null;
  updatedAt: string;
}

export interface CatalogItem {
  id: string;
  ownerId: string;
  sheet: CatalogSheet;
  category: string;
  description: string;
  unit: string;
  suppliers: Record<string, SupplierQuote>;
  referencePriceMin: number | null;
  referencePriceMax: number | null;
  manualSalePrice: number | null;
  customMarginPercent: number | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CatalogItemInput = Omit<CatalogItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;

export interface CompanyProfile {
  ownerId: string;
  companyName: string;
  nif: string;
  address: string;
  phone: string;
  email: string;
  logoDataUrl: string;
  defaultMarginPercent: number;
  defaultVatRate: number;
  defaultValidityDays: number;
  defaultPaymentTerms: string;
  defaultNotes: string;
  catalogSeeded: boolean;
  nextQuoteSeq: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuoteLine {
  id: string;
  ownerId: string;
  quoteId: string;
  order: number;
  catalogItemId: string;
  isCustom: boolean;
  sheet: string;
  category: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  catalogUnitPrice: number | null;
  priceRangeHint: string;
  sourceSupplier: string;
  discountType: DiscountType;
  discountValue: number;
  lineSubtotal: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuoteDraftLine {
  localId: string;
  catalogItemId: string;
  isCustom: boolean;
  sheet: string;
  category: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  catalogUnitPrice: number | null;
  priceRangeHint: string;
  sourceSupplier: string;
  discountType: DiscountType;
  discountValue: number;
}

export interface Quote {
  id: string;
  ownerId: string;
  quoteNumber: string;
  title: string;
  clientName: string;
  clientNif: string;
  clientContact: string;
  issueDate: string;
  validUntil: string;
  status: QuoteStatus;
  notes: string;
  globalDiscountType: DiscountType;
  globalDiscountValue: number;
  applyVat: boolean;
  vatRate: number;
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
  lineCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ResolvedPrice {
  salePrice: number | null;
  source: 'manual' | 'supplier_margin' | 'reference_range' | 'reference_fixed' | 'none';
  bestSupplierName: string | null;
  bestSupplierPrice: number | null;
  bestSupplierDate: string | null;
  appliedMarginPercent: number | null;
  priceRangeHint: string;
}

export const SHEET_META: Record<
  CatalogSheet,
  {
    label: string;
    shortLabel: string;
    excelName: string;
    suppliers: string[];
    hasSupplierDates: boolean;
    hasReferenceColumn: boolean;
  }
> = {
  material: {
    label: 'Preçário - Material',
    shortLabel: 'Material',
    excelName: 'Preçário - Material',
    suppliers: ['Maxifer', 'Ferromar', 'Ferrus', 'Perfichapa'],
    hasSupplierDates: true,
    hasReferenceColumn: false,
  },
  material_cons: {
    label: 'Preçário - Material - Cons.',
    shortLabel: 'Consumíveis',
    excelName: 'Preçário - Material - Cons.',
    suppliers: ['SPC', 'Pedro Roque', 'Estrela Santo Amaro', 'Oleirep', 'Forch', 'Pecol'],
    hasSupplierDates: false,
    hasReferenceColumn: false,
  },
  servicos: {
    label: 'Preçário - Serviços',
    shortLabel: 'Serviços',
    excelName: 'Preçário - Serviços',
    suppliers: [],
    hasSupplierDates: false,
    hasReferenceColumn: true,
  },
  outros: {
    label: 'Preçário - Outros',
    shortLabel: 'Outros',
    excelName: 'Preçário - Outros',
    suppliers: [],
    hasSupplierDates: false,
    hasReferenceColumn: true,
  },
};

export const QUOTE_STATUS_META: Record<
  QuoteStatus,
  { label: string; textClass: string; dotClass: string }
> = {
  rascunho: {
    label: 'Rascunho',
    textClass: 'text-slate-600',
    dotClass: 'bg-slate-400',
  },
  enviado: {
    label: 'Enviado',
    textClass: 'text-amber-700',
    dotClass: 'bg-amber-500',
  },
  aprovado: {
    label: 'Aprovado',
    textClass: 'text-emerald-700',
    dotClass: 'bg-emerald-600',
  },
  recusado: {
    label: 'Recusado',
    textClass: 'text-red-700',
    dotClass: 'bg-red-600',
  },
};

export type AppView = 'dashboard' | 'builder' | 'catalog' | 'history' | 'settings';
