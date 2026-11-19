import { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  FileDown,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import {
  calculateLineSubtotal,
  calculateQuoteTotals,
  formatCurrencyPT,
  formatNumberPT,
  formatUnitPricePT,
  getItemDisplayName,
  resolveCatalogPrice,
} from '../lib/pricing';
import {
  QUOTE_STATUS_META,
  SHEET_META,
  type CatalogItem,
  type CatalogSheet,
  type CompanyProfile,
  type DiscountType,
  type QuoteDraftLine,
  type QuoteStatus,
} from '../types';

export interface ActiveQuoteDraft {
  id?: string;
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
  lines: QuoteDraftLine[];
}

interface QuoteBuilderViewProps {
  draft: ActiveQuoteDraft;
  catalogItems: CatalogItem[];
  profile: CompanyProfile | null;
  saving: boolean;
  dirty: boolean;
  onChangeDraft: (updater: (prev: ActiveQuoteDraft) => ActiveQuoteDraft) => void;
  onAddCatalogItem: (item: CatalogItem) => void;
  onAddCustomLine: () => void;
  onSaveQuote: () => Promise<void>;
  onNewQuote: () => void;
  onDuplicateActive: () => Promise<void>;
  onOpenPreview: () => void;
  onDownloadPdf: () => void;
}

export function QuoteBuilderView({
  draft,
  catalogItems,
  profile,
  saving,
  dirty,
  onChangeDraft,
  onAddCatalogItem,
  onAddCustomLine,
  onSaveQuote,
  onNewQuote,
  onDuplicateActive,
  onOpenPreview,
  onDownloadPdf,
}: QuoteBuilderViewProps) {
  const [catalogQuery, setCatalogQuery] = useState('');
  const [sheetQuickFilter, setSheetQuickFilter] = useState<'all' | CatalogSheet>('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const defaultMargin = profile?.defaultMarginPercent ?? 30;
  const isLocked = Boolean(draft.id && (draft.status === 'aprovado' || draft.status === 'recusado'));

  const totals = useMemo(
    () =>
      calculateQuoteTotals(
        draft.lines,
        draft.globalDiscountType,
        draft.globalDiscountValue,
        draft.applyVat,
        draft.vatRate
      ),
    [
      draft.lines,
      draft.globalDiscountType,
      draft.globalDiscountValue,
      draft.applyVat,
      draft.vatRate,
    ]
  );

  const matchingCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return catalogItems
      .filter((it) => {
        if (sheetQuickFilter !== 'all' && it.sheet !== sheetQuickFilter) return false;
        if (!q) return true;
        const hay = `${it.category} ${it.description} ${it.unit} ${SHEET_META[it.sheet].label}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const c = a.category.localeCompare(b.category, 'pt');
        return c !== 0 ? c : a.description.localeCompare(b.description, 'pt');
      })
      .slice(0, 14);
  }, [catalogItems, catalogQuery, sheetQuickFilter]);

  const updateLine = (localId: string, patch: Partial<QuoteDraftLine>) => {
    if (isLocked) return;
    onChangeDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.localId === localId ? { ...l, ...patch } : l)),
    }));
  };

  const removeLine = (localId: string) => {
    if (isLocked) return;
    onChangeDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.localId !== localId),
    }));
  };

  const moveLine = (index: number, direction: -1 | 1) => {
    if (isLocked) return;
    const target = index + direction;
    onChangeDraft((prev) => {
      if (target < 0 || target >= prev.lines.length) return prev;
      const copy = [...prev.lines];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return { ...prev, lines: copy };
    });
  };

  const statusMeta = QUOTE_STATUS_META[draft.status];

  return (
    <div className="space-y-5">
      {/* Cabeçalho do Workspace */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
            <span className="font-mono font-semibold text-slate-900">{draft.quoteNumber}</span>
            <span aria-hidden="true">·</span>
            <span className={`font-medium ${statusMeta.textClass}`}>{statusMeta.label}</span>
            {dirty && !isLocked && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700">Alterações por guardar</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {draft.id ? 'Editor de Orçamento' : 'Novo Orçamento'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draft.id && (
            <button
              type="button"
              onClick={onNewQuote}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Limpar / Novo
            </button>
          )}
          <button
            type="button"
            onClick={onOpenPreview}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Eye className="w-4 h-4 text-slate-500" />
            Pré-visualizar
          </button>
        </div>
      </div>

      {/* Aviso se orçamento finalizado */}
      {isLocked && (
        <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 text-sm text-slate-700">
            <Lock className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">
                Orçamento finalizado ({statusMeta.label}).
              </span>{' '}
              Para manter o histórico íntegro, os valores não podem ser alterados diretamente. Crie
              uma duplicação para preparar uma nova revisão.
            </div>
          </div>
          <button
            type="button"
            onClick={onDuplicateActive}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicar como rascunho
          </button>
        </div>
      )}

      {/* Layout Dividido: Área de Construção (Esquerda) + Resumo Financeiro Sticky (Direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA */}
        <div className="lg:col-span-8 space-y-5">
          {/* 1. Dados do Orçamento */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Dados do Orçamento</h2>
              {draft.id && !isLocked && (
                <div className="flex items-center gap-2">
                  <label htmlFor="quote-status-select" className="text-xs text-slate-500">
                    Estado
                  </label>
                  <select
                    id="quote-status-select"
                    value={draft.status}
                    onChange={(e) =>
                      onChangeDraft((prev) => ({
                        ...prev,
                        status: e.target.value as QuoteStatus,
                      }))
                    }
                    className="px-2.5 py-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-orange-600"
                  >
                    <option value="rascunho">Rascunho</option>
                    <option value="enviado">Enviado</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="recusado">Recusado</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  disabled={isLocked}
                  value={draft.clientName}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({ ...prev, clientName: e.target.value }))
                  }
                  placeholder="Ex.: Construções Silva & Filhos, Lda."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 disabled:bg-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Referência / Título do Orçamento
                </label>
                <input
                  type="text"
                  disabled={isLocked}
                  value={draft.title}
                  onChange={(e) => onChangeDraft((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Ex.: Estrutura metálica e portão"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 disabled:bg-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Nº Orçamento</label>
                <input
                  type="text"
                  disabled={isLocked}
                  value={draft.quoteNumber}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({ ...prev, quoteNumber: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 disabled:bg-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">NIF Cliente</label>
                <input
                  type="text"
                  disabled={isLocked}
                  value={draft.clientNif}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({ ...prev, clientNif: e.target.value }))
                  }
                  placeholder="Opcional"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 disabled:bg-slate-50 rounded-lg focus:outline-none focus:border-orange-600"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Contacto Cliente
                </label>
                <input
                  type="text"
                  disabled={isLocked}
                  value={draft.clientContact}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({ ...prev, clientContact: e.target.value }))
                  }
                  placeholder="Email ou telefone"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 disabled:bg-slate-50 rounded-lg focus:outline-none focus:border-orange-600"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Data</label>
                <input
                  type="date"
                  disabled={isLocked}
                  value={draft.issueDate}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({ ...prev, issueDate: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 disabled:bg-slate-50 rounded-lg focus:outline-none focus:border-orange-600"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Validade</label>
                <input
                  type="date"
                  disabled={isLocked}
                  value={draft.validUntil}
                  onChange={(e) =>
                    onChangeDraft((prev) => ({ ...prev, validUntil: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 disabled:bg-slate-50 rounded-lg focus:outline-none focus:border-orange-600"
                />
              </div>
            </div>
          </section>

          {/* 2. Seletor Rápido do Catálogo */}
          {!isLocked && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Adicionar Artigos do Catálogo
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pesquise e clique para adicionar imediatamente ao orçamento (1 clique)
                  </p>
                </div>

                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg overflow-x-auto">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'material', label: 'Material' },
                      { id: 'material_cons', label: 'Cons.' },
                      { id: 'servicos', label: 'Serviços' },
                      { id: 'outros', label: 'Outros' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSheetQuickFilter(f.id);
                        setDropdownOpen(true);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        sheetQuickFilter === f.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={catalogQuery}
                    onFocus={() => setDropdownOpen(true)}
                    onChange={(e) => {
                      setCatalogQuery(e.target.value);
                      setDropdownOpen(true);
                    }}
                    placeholder="Escreva IPE 220, Tubo Galvanizado, Mão-de-obra, Caleira, Portão..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
                  />

                  {dropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setDropdownOpen(false)}
                      />
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto divide-y divide-slate-100">
                        {matchingCatalog.length === 0 ? (
                          <div className="p-4 text-sm text-slate-500 text-center">
                            Nenhum item do catálogo corresponde a &ldquo;{catalogQuery}&rdquo;.
                          </div>
                        ) : (
                          matchingCatalog.map((item) => {
                            const resolved = resolveCatalogPrice(item, defaultMargin);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  onAddCatalogItem(item);
                                  setCatalogQuery('');
                                  setDropdownOpen(false);
                                }}
                                className="w-full px-4 py-2.5 text-left hover:bg-orange-50/50 transition-colors flex items-center justify-between gap-4"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-slate-900 truncate">
                                    {getItemDisplayName(item)}
                                  </div>
                                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                                    <span>{SHEET_META[item.sheet].shortLabel}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono">{item.unit || 'UN'}</span>
                                    {resolved.bestSupplierName && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>
                                          {resolved.bestSupplierName} +
                                          {formatNumberPT(resolved.appliedMarginPercent ?? 0, 0)}%
                                        </span>
                                      </>
                                    )}
                                    {resolved.priceRangeHint && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono">
                                          Faixa {resolved.priceRangeHint}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                                    {formatUnitPricePT(resolved.salePrice)}
                                  </div>
                                  <div className="text-[11px] text-orange-600 font-medium">
                                    + Adicionar
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onAddCustomLine}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Item Avulso
                </button>
              </div>
            </section>
          )}

          {/* 3. Tabela de Linhas do Orçamento */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Linhas do Orçamento{' '}
                <span className="font-mono tabular-nums text-slate-400 font-normal ml-1">
                  ({draft.lines.length})
                </span>
              </h2>
              <span className="text-xs text-slate-500">
                Alterações de preço aqui não modificam o catálogo
              </span>
            </div>

            {draft.lines.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium text-slate-900">
                  Ainda sem artigos neste orçamento
                </p>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Utilize a barra de pesquisa acima para adicionar vigas, tubos, serviços ou crie um
                  artigo avulso.
                </p>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => searchInputRef.current?.focus()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Pesquisar no catálogo
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                      <th className="py-2.5 px-2 min-w-[210px]">Artigo / Descrição</th>
                      <th className="py-2.5 px-2 w-20 text-center">Unid.</th>
                      <th className="py-2.5 px-2 w-24 text-right">Qtd.</th>
                      <th className="py-2.5 px-2 w-32 text-right">Preço Unit. (€)</th>
                      <th className="py-2.5 px-2 w-32 text-right">Desconto</th>
                      <th className="py-2.5 px-3 w-32 text-right">Subtotal</th>
                      {!isLocked && <th className="py-2.5 pl-2 pr-4 w-20 text-right">Ordem</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {draft.lines.map((line, index) => {
                      const lineSub = calculateLineSubtotal(line);
                      const priceModified =
                        line.catalogUnitPrice !== null &&
                        Math.abs(line.unitPrice - line.catalogUnitPrice) > 0.001;

                      return (
                        <tr key={line.localId} className="align-top hover:bg-slate-50/60">
                          <td className="py-3 pl-4 pr-2 text-xs font-mono text-slate-400 pt-4">
                            {index + 1}
                          </td>

                          <td className="py-2.5 px-2">
                            <input
                              type="text"
                              disabled={isLocked}
                              value={line.description}
                              onChange={(e) =>
                                updateLine(line.localId, { description: e.target.value })
                              }
                              placeholder="Descrição do artigo ou serviço"
                              className="w-full px-2 py-1 text-sm font-medium text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-orange-600 focus:outline-none rounded-md"
                            />
                            <div className="px-2 mt-0.5 text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                              <span>
                                {line.isCustom ? 'Artigo avulso' : line.category || 'Catálogo'}
                              </span>
                              {line.sourceSupplier && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>Ref. {line.sourceSupplier}</span>
                                </>
                              )}
                              {line.priceRangeHint && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-orange-700 font-mono">
                                    Faixa {line.priceRangeHint}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-2">
                            <input
                              type="text"
                              disabled={isLocked}
                              value={line.unit}
                              onChange={(e) => updateLine(line.localId, { unit: e.target.value })}
                              className="w-full px-2 py-1.5 text-xs font-mono text-center text-slate-700 bg-white border border-slate-200 disabled:bg-slate-50 rounded-md focus:outline-none focus:border-orange-600"
                            />
                          </td>

                          <td className="py-2.5 px-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              disabled={isLocked}
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(line.localId, {
                                  quantity: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-full px-2 py-1.5 text-sm font-mono tabular-nums text-right bg-white border border-slate-200 disabled:bg-slate-50 rounded-md focus:outline-none focus:border-orange-600"
                            />
                          </td>

                          <td className="py-2.5 px-2">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              disabled={isLocked}
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(line.localId, {
                                  unitPrice: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-full px-2 py-1.5 text-sm font-mono tabular-nums text-right bg-white border border-slate-200 disabled:bg-slate-50 rounded-md focus:outline-none focus:border-orange-600"
                            />
                            {priceModified && !isLocked && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateLine(line.localId, {
                                    unitPrice: line.catalogUnitPrice ?? line.unitPrice,
                                  })
                                }
                                className="mt-1 w-full inline-flex items-center justify-end gap-1 text-[11px] text-slate-500 hover:text-orange-600"
                                title="Repor preço do catálogo"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                Catálogo: {formatUnitPricePT(line.catalogUnitPrice)}
                              </button>
                            )}
                          </td>

                          <td className="py-2.5 px-2">
                            <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={isLocked}
                                value={line.discountValue || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateLine(line.localId, {
                                    discountValue: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                className="w-full px-2 py-1.5 text-xs font-mono tabular-nums text-right focus:outline-none disabled:bg-slate-50"
                              />
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() =>
                                  updateLine(line.localId, {
                                    discountType:
                                      line.discountType === 'percent' ? 'fixed' : 'percent',
                                  })
                                }
                                title="Alternar desconto entre % e €"
                                className="px-2 py-1.5 text-xs font-mono font-medium bg-slate-50 border-l border-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-50"
                              >
                                {line.discountType === 'percent' ? '%' : '€'}
                              </button>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap pt-4">
                            {formatCurrencyPT(lineSub, 2)}
                          </td>

                          {!isLocked && (
                            <td className="py-2.5 pl-1 pr-3 text-right whitespace-nowrap pt-3">
                              <div className="inline-flex items-center gap-0.5">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => moveLine(index, -1)}
                                  className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded"
                                  aria-label="Subir linha"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={index === draft.lines.length - 1}
                                  onClick={() => moveLine(index, 1)}
                                  className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded"
                                  aria-label="Descer linha"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeLine(line.localId)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded"
                                  aria-label="Remover linha"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 4. Notas e Observações */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
            <label
              htmlFor="quote-notes-textarea"
              className="block text-sm font-semibold text-slate-900"
            >
              Notas e Observações
            </label>
            <textarea
              id="quote-notes-textarea"
              rows={3}
              disabled={isLocked}
              value={draft.notes}
              onChange={(e) => onChangeDraft((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Prazo de execução, exclusões, transporte, montagem..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 disabled:bg-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
            />
          </section>
        </div>

        {/* COLUNA DIREITA: RESUMO FINANCEIRO STICKY */}
        <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Resumo Financeiro</h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {draft.lines.length} {draft.lines.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {/* Subtotal */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Subtotal acumulado</span>
              <span className="font-mono tabular-nums font-medium text-slate-900">
                {formatCurrencyPT(totals.subtotal, 2)}
              </span>
            </div>

            {/* Desconto Global */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">Desconto Global</span>
                {totals.discountTotal > 0 && (
                  <span className="text-xs font-mono tabular-nums text-emerald-700">
                    -{formatCurrencyPT(totals.discountTotal, 2)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center p-0.5 bg-slate-100 rounded-lg shrink-0">
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() =>
                      onChangeDraft((prev) => ({ ...prev, globalDiscountType: 'percent' }))
                    }
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors ${
                      draft.globalDiscountType === 'percent'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() =>
                      onChangeDraft((prev) => ({ ...prev, globalDiscountType: 'fixed' }))
                    }
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors ${
                      draft.globalDiscountType === 'fixed'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    €
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={isLocked}
                  value={draft.globalDiscountValue || ''}
                  placeholder="0"
                  onChange={(e) =>
                    onChangeDraft((prev) => ({
                      ...prev,
                      globalDiscountValue: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="flex-1 px-3 py-1.5 text-sm font-mono tabular-nums text-right bg-white border border-slate-200 disabled:bg-slate-50 rounded-lg focus:outline-none focus:border-orange-600"
                />
              </div>
            </div>

            {/* Toggle IVA */}
            <div className="space-y-2.5 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="apply-vat-toggle"
                  className="text-xs font-medium text-slate-700 cursor-pointer select-none"
                >
                  Aplicar IVA
                </label>
                <button
                  id="apply-vat-toggle"
                  type="button"
                  role="switch"
                  aria-checked={draft.applyVat}
                  disabled={isLocked}
                  onClick={() =>
                    onChangeDraft((prev) => ({ ...prev, applyVat: !prev.applyVat }))
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    draft.applyVat ? 'bg-orange-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      draft.applyVat ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {draft.applyVat ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Taxa</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      disabled={isLocked}
                      value={draft.vatRate}
                      onChange={(e) =>
                        onChangeDraft((prev) => ({
                          ...prev,
                          vatRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        }))
                      }
                      className="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right bg-white border border-slate-200 disabled:bg-slate-50 rounded-md focus:outline-none focus:border-orange-600"
                    />
                    <span className="text-xs font-mono text-slate-500">%</span>
                  </div>
                  <span className="text-sm font-mono tabular-nums text-slate-900">
                    {formatCurrencyPT(totals.vatTotal, 2)}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Valor aproximado apresentado sem impostos (s/IVA).
                </p>
              )}
            </div>

            {/* Total Estimado */}
            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-500">Total Estimado</div>
                  <div className="text-[11px] text-slate-400">
                    {draft.applyVat
                      ? `IVA (${formatNumberPT(draft.vatRate, 0)}%) incluído`
                      : 'Sem IVA incluído'}
                  </div>
                </div>
                <div className="text-3xl font-bold font-mono tabular-nums tracking-tight text-slate-900">
                  {formatCurrencyPT(totals.grandTotal, 2)}
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="space-y-2.5 pt-2">
              {!isLocked && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onSaveQuote}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving
                    ? 'A guardar...'
                    : draft.id
                      ? 'Guardar Alterações'
                      : 'Guardar Orçamento'}
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onOpenPreview}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Pré-visualizar
                </button>
                <button
                  type="button"
                  onClick={onDownloadPdf}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Exportar PDF
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
