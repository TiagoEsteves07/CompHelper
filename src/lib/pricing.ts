import type { CatalogItem, DiscountType, QuoteDraftLine, ResolvedPrice } from '../types';

export function getItemDisplayName(item: Pick<CatalogItem, 'category' | 'description'>): string {
  const cat = item.category.trim();
  const desc = item.description.trim();
  if (cat && desc) return `${cat} — ${desc}`;
  return desc || cat || 'Sem designação';
}

export function getBestSupplierQuote(item: Pick<CatalogItem, 'suppliers'>): {
  name: string;
  price: number;
  updatedAt: string;
} | null {
  let best: { name: string; price: number; updatedAt: string } | null = null;
  for (const [name, quote] of Object.entries(item.suppliers || {})) {
    if (quote && typeof quote.price === 'number' && !Number.isNaN(quote.price) && quote.price > 0) {
      if (!best || quote.price < best.price) {
        best = {
          name,
          price: quote.price,
          updatedAt: quote.updatedAt || '',
        };
      }
    }
  }
  return best;
}

/**
 * Resolve o Preço de Venda ao Público (s/IVA) para um artigo do catálogo:
 * 1. Se `manualSalePrice` estiver definido, prevalece diretamente.
 * 2. Se existirem preços de fornecedores, usa o preço mais baixo + margem (individual ou global).
 * 3. Se existir faixa de referência (ex.: 60 - 90 € em Outros), sugere o ponto médio com indicação da faixa.
 * 4. Se existir preço de referência único (ex.: 90,00 € em Portão), usa esse valor.
 */
export function resolveCatalogPrice(
  item: Pick<
    CatalogItem,
    'suppliers' | 'manualSalePrice' | 'customMarginPercent' | 'referencePriceMin' | 'referencePriceMax'
  >,
  defaultMarginPercent: number
): ResolvedPrice {
  const bestSupplier = getBestSupplierQuote(item);
  const margin = item.customMarginPercent ?? defaultMarginPercent;

  const hasRange =
    typeof item.referencePriceMin === 'number' &&
    typeof item.referencePriceMax === 'number' &&
    item.referencePriceMax > item.referencePriceMin;

  const rangeHint = hasRange
    ? `${formatNumberPT(item.referencePriceMin!, 2)} – ${formatNumberPT(item.referencePriceMax!, 2)} €`
    : '';

  if (typeof item.manualSalePrice === 'number' && !Number.isNaN(item.manualSalePrice)) {
    return {
      salePrice: roundMoney(item.manualSalePrice, 3),
      source: 'manual',
      bestSupplierName: bestSupplier?.name ?? null,
      bestSupplierPrice: bestSupplier?.price ?? null,
      bestSupplierDate: bestSupplier?.updatedAt ?? null,
      appliedMarginPercent: null,
      priceRangeHint: rangeHint,
    };
  }

  if (bestSupplier) {
    const computed = bestSupplier.price * (1 + Math.max(0, margin) / 100);
    return {
      salePrice: roundMoney(computed, 3),
      source: 'supplier_margin',
      bestSupplierName: bestSupplier.name,
      bestSupplierPrice: bestSupplier.price,
      bestSupplierDate: bestSupplier.updatedAt,
      appliedMarginPercent: margin,
      priceRangeHint: rangeHint,
    };
  }

  if (hasRange) {
    const midpoint = (item.referencePriceMin! + item.referencePriceMax!) / 2;
    return {
      salePrice: roundMoney(midpoint, 2),
      source: 'reference_range',
      bestSupplierName: null,
      bestSupplierPrice: null,
      bestSupplierDate: null,
      appliedMarginPercent: null,
      priceRangeHint: rangeHint,
    };
  }

  if (typeof item.referencePriceMin === 'number' && !Number.isNaN(item.referencePriceMin)) {
    return {
      salePrice: roundMoney(item.referencePriceMin, 2),
      source: 'reference_fixed',
      bestSupplierName: null,
      bestSupplierPrice: null,
      bestSupplierDate: null,
      appliedMarginPercent: null,
      priceRangeHint: '',
    };
  }

  return {
    salePrice: null,
    source: 'none',
    bestSupplierName: null,
    bestSupplierPrice: null,
    bestSupplierDate: null,
    appliedMarginPercent: null,
    priceRangeHint: '',
  };
}

export function calculateLineSubtotal(line: {
  quantity: number;
  unitPrice: number;
  discountType: DiscountType;
  discountValue: number;
}): number {
  const qty = Math.max(0, Number(line.quantity) || 0);
  const price = Math.max(0, Number(line.unitPrice) || 0);
  const gross = qty * price;
  const discVal = Math.max(0, Number(line.discountValue) || 0);

  const discountAmount =
    line.discountType === 'percent' ? gross * (Math.min(100, discVal) / 100) : Math.min(gross, discVal);

  return roundMoney(Math.max(0, gross - discountAmount), 2);
}

export interface QuoteTotals {
  subtotal: number;
  discountTotal: number;
  taxableBase: number;
  vatTotal: number;
  grandTotal: number;
}

export function calculateQuoteTotals(
  lines: Pick<QuoteDraftLine, 'quantity' | 'unitPrice' | 'discountType' | 'discountValue'>[],
  globalDiscountType: DiscountType,
  globalDiscountValue: number,
  applyVat: boolean,
  vatRate: number
): QuoteTotals {
  const subtotal = roundMoney(
    lines.reduce((acc, line) => acc + calculateLineSubtotal(line), 0),
    2
  );

  const safeDisc = Math.max(0, Number(globalDiscountValue) || 0);
  const discountTotal = roundMoney(
    globalDiscountType === 'percent'
      ? subtotal * (Math.min(100, safeDisc) / 100)
      : Math.min(subtotal, safeDisc),
    2
  );

  const taxableBase = roundMoney(Math.max(0, subtotal - discountTotal), 2);
  const safeVat = Math.max(0, Math.min(100, Number(vatRate) || 0));
  const vatTotal = applyVat ? roundMoney(taxableBase * (safeVat / 100), 2) : 0;
  const grandTotal = roundMoney(taxableBase + vatTotal, 2);

  return {
    subtotal,
    discountTotal,
    taxableBase,
    vatTotal,
    grandTotal,
  };
}

export function roundMoney(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatNumberPT(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrencyPT(value: number, decimals = 2): string {
  return `${formatNumberPT(value, decimals)} €`;
}

/**
 * Formata preços unitários preservando 3 casas decimais para materiais de precisão (ex. 0,809 €)
 * ou 2 casas decimais para valores redondos (ex. 40,00 €).
 */
export function formatUnitPricePT(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  const hasThirdDecimal = Math.abs(Math.round(value * 1000) % 10) > 0;
  return formatCurrencyPT(value, hasThirdDecimal ? 3 : 2);
}

export function formatDatePT(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const trimmed = isoDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }
  return trimmed;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysISO(baseIso: string, days: number): string {
  const date = new Date(`${baseIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return todayISO();
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parsePortugueseNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/€/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return null;

  // Se tiver vírgula e ponto (ex: 1.250,50), remove separador de milhares
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parsePriceOrRange(raw: unknown): { min: number | null; max: number | null } {
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return { min: raw, max: null };
  }
  if (typeof raw !== 'string') return { min: null, max: null };
  const text = raw.replace(/€/g, '').trim();
  if (!text) return { min: null, max: null };

  const rangeMatch = text.match(/^([\d.,]+)\s*[-–]\s*([\d.,]+)$/);
  if (rangeMatch) {
    const min = parsePortugueseNumber(rangeMatch[1]);
    const max = parsePortugueseNumber(rangeMatch[2]);
    return { min, max };
  }

  const single = parsePortugueseNumber(text);
  return { min: single, max: null };
}
