import * as XLSX from 'xlsx';
import {
  SHEET_META,
  type CatalogItem,
  type CatalogItemInput,
  type CatalogSheet,
  type SupplierQuote,
} from '../types';
import { parsePortugueseNumber, parsePriceOrRange, resolveCatalogPrice } from './pricing';

export interface ParsedImportRow {
  rowId: string;
  selected: boolean;
  sheetName: string;
  item: CatalogItemInput;
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectSheetType(sheetName: string, normalizedHeaders: string[]): CatalogSheet {
  const sn = normalizeHeader(sheetName);
  if (sn.includes('cons')) return 'material_cons';
  if (sn.includes('servic')) return 'servicos';
  if (sn.includes('outro')) return 'outros';
  if (sn.includes('material')) return 'material';

  // Heurística por colunas (ex.: CSV)
  const joined = normalizedHeaders.join('|');
  if (joined.includes('spc') || joined.includes('pecol') || joined.includes('forch')) {
    return 'material_cons';
  }
  if (joined.includes('ferromar') || joined.includes('maxifer') || joined.includes('ferrus')) {
    return 'material';
  }
  if (joined.includes('preco/mt')) {
    return 'servicos';
  }
  return 'material';
}

function formatExcelDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number' && val > 20000 && val < 90000) {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const str = String(val).trim();
  if (!str) return '';
  // MM/DD/YYYY ou DD/MM/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const y = slashMatch[3];
    // Se primeiro número > 12 é claramente DD/MM/YYYY; se segundo > 12 é MM/DD/YYYY (como no Excel anexo: 11/19/2026)
    if (b > 12) {
      return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    }
    if (a > 12) {
      return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  return str.slice(0, 20);
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const norm = row.map(normalizeHeader);
    if (norm.includes('categoria') || norm.includes('descricao') || norm.includes('unidade')) {
      return i;
    }
  }
  return 0;
}

export async function parseCatalogFile(file: File): Promise<ParsedImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const results: ParsedImportRow[] = [];
  let idx = 0;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    const headerIdx = findHeaderRowIndex(rows);
    const rawHeaders = (rows[headerIdx] || []).map((h) => String(h ?? '').trim());
    const normHeaders = rawHeaders.map(normalizeHeader);
    const sheetType = detectSheetType(sheetName, normHeaders);

    const colCategoria = normHeaders.findIndex((h) => h === 'categoria' || h.includes('categ'));
    const colDescricao = normHeaders.findIndex((h) => h === 'descricao' || h.includes('descri'));
    const colUnidade = normHeaders.findIndex((h) => h === 'unidade' || h === 'unid' || h === 'un');
    const colRefPrice = normHeaders.findIndex((h) => h.includes('preco/mt') || h.includes('preco mt'));
    const colSalePrice = normHeaders.findIndex(
      (h) => h.includes('venda ao publico') || h.includes('pvp') || h === 'preco unitario' || h === 'preco'
    );
    const colCustomMargin = normHeaders.findIndex((h) => h.includes('margem'));

    const reservedCols = new Set(
      [colCategoria, colDescricao, colUnidade, colRefPrice, colSalePrice, colCustomMargin].filter(
        (c) => c >= 0
      )
    );

    // Mapear colunas de fornecedores e respetivas colunas de atualização adjacentes
    const supplierCols: { name: string; priceCol: number; dateCol: number | null }[] = [];
    for (let c = 0; c < rawHeaders.length; c++) {
      if (reservedCols.has(c)) continue;
      const raw = rawHeaders[c];
      const norm = normHeaders[c];
      if (!raw || norm.startsWith('atualizac')) continue;

      const nextNorm = normHeaders[c + 1] || '';
      const dateCol = nextNorm.startsWith('atualizac') ? c + 1 : null;
      supplierCols.push({ name: raw, priceCol: c, dateCol });
    }

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const category = colCategoria >= 0 ? String(row[colCategoria] ?? '').trim() : '';
      const description = colDescricao >= 0 ? String(row[colDescricao] ?? '').trim() : '';
      const unit = colUnidade >= 0 ? String(row[colUnidade] ?? '').trim() : '';

      if (!category && !description) continue;

      const suppliers: Record<string, SupplierQuote> = {};
      for (const sc of supplierCols) {
        const price = parsePortugueseNumber(row[sc.priceCol]);
        const updatedAt = sc.dateCol !== null ? formatExcelDate(row[sc.dateCol]) : '';
        if (price !== null || updatedAt) {
          suppliers[sc.name] = { price, updatedAt };
        }
      }

      const refParsed = colRefPrice >= 0 ? parsePriceOrRange(row[colRefPrice]) : { min: null, max: null };
      const manualSalePrice = colSalePrice >= 0 ? parsePortugueseNumber(row[colSalePrice]) : null;
      const customMarginPercent =
        colCustomMargin >= 0 ? parsePortugueseNumber(row[colCustomMargin]) : null;

      results.push({
        rowId: `imp_${idx++}`,
        selected: true,
        sheetName,
        item: {
          sheet: sheetType,
          category: category || 'Geral',
          description,
          unit,
          suppliers,
          referencePriceMin: refParsed.min,
          referencePriceMax: refParsed.max,
          manualSalePrice,
          customMarginPercent,
        },
      });
    }
  }

  return results;
}

export function exportCatalogToExcel(items: CatalogItem[], defaultMarginPercent: number): void {
  const wb = XLSX.utils.book_new();
  const sheetsOrder: CatalogSheet[] = ['material', 'material_cons', 'servicos', 'outros'];

  for (const sheet of sheetsOrder) {
    const meta = SHEET_META[sheet];
    const sheetItems = items.filter((it) => it.sheet === sheet);

    let rows: Record<string, unknown>[] = [];

    if (sheet === 'material') {
      const allSuppliers = Array.from(
        new Set([
          ...meta.suppliers,
          ...sheetItems.flatMap((it) => Object.keys(it.suppliers || {})),
        ])
      );
      rows = sheetItems.map((it) => {
        const resolved = resolveCatalogPrice(it, defaultMarginPercent);
        const row: Record<string, unknown> = {
          Categoria: it.category,
          Descrição: it.description,
        };
        allSuppliers.forEach((sup, idx) => {
          const q = it.suppliers?.[sup];
          row[sup] = q?.price ?? '';
          const dateColName = idx === 0 ? 'Atualização' : `Atualização (${sup})`;
          row[dateColName] = q?.updatedAt ?? '';
        });
        row['Unidade'] = it.unit;
        row['Preço/Venda ao Público'] =
          it.manualSalePrice !== null
            ? it.manualSalePrice
            : resolved.salePrice !== null
              ? resolved.salePrice
              : '';
        return row;
      });
    } else if (sheet === 'material_cons') {
      const allSuppliers = Array.from(
        new Set([
          ...meta.suppliers,
          ...sheetItems.flatMap((it) => Object.keys(it.suppliers || {})),
        ])
      );
      rows = sheetItems.map((it) => {
        const resolved = resolveCatalogPrice(it, defaultMarginPercent);
        const row: Record<string, unknown> = {
          Categoria: it.category,
          Descrição: it.description,
        };
        allSuppliers.forEach((sup) => {
          row[sup] = it.suppliers?.[sup]?.price ?? '';
        });
        row['Unidade'] = it.unit;
        row['Preço/Venda ao Público'] =
          it.manualSalePrice !== null
            ? it.manualSalePrice
            : resolved.salePrice !== null
              ? resolved.salePrice
              : '';
        return row;
      });
    } else {
      rows = sheetItems.map((it) => {
        const resolved = resolveCatalogPrice(it, defaultMarginPercent);
        const refVal =
          it.referencePriceMin !== null && it.referencePriceMax !== null
            ? `${it.referencePriceMin} - ${it.referencePriceMax}`
            : it.referencePriceMin !== null
              ? it.referencePriceMin
              : '';
        return {
          Categoria: it.category,
          Descrição: it.description,
          Unidade: it.unit,
          'Preço/Mt (s/IVA)': refVal,
          [sheet === 'servicos' ? 'Preço/Venda ao Público (s/IVA)' : 'Preço/Venda ao Público']:
            it.manualSalePrice !== null
              ? it.manualSalePrice
              : resolved.salePrice !== null
                ? resolved.salePrice
                : '',
        };
      });
    }

    if (rows.length === 0) {
      rows = [{ Categoria: '', Descrição: '', Unidade: '', 'Preço/Venda ao Público': '' }];
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, meta.excelName.slice(0, 31));
  }

  XLSX.writeFile(wb, `CompHelper_Catalogo_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportCatalogToCSV(items: CatalogItem[], defaultMarginPercent: number): void {
  const rows = items.map((it) => {
    const resolved = resolveCatalogPrice(it, defaultMarginPercent);
    return {
      Folha: SHEET_META[it.sheet].excelName,
      Categoria: it.category,
      Descrição: it.description,
      Unidade: it.unit,
      'Melhor Fornecedor': resolved.bestSupplierName ?? '',
      'Preço Fornecedor': resolved.bestSupplierPrice ?? '',
      'Data Atualização': resolved.bestSupplierDate ?? '',
      'Preço/Mt (s/IVA)':
        it.referencePriceMin !== null && it.referencePriceMax !== null
          ? `${it.referencePriceMin} - ${it.referencePriceMax}`
          : it.referencePriceMin ?? '',
      'Margem (%)': it.customMarginPercent ?? (resolved.source === 'supplier_margin' ? defaultMarginPercent : ''),
      'Preço/Venda ao Público': resolved.salePrice ?? '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CompHelper_Catalogo_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
