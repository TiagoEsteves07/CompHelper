import { useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  FileEdit,
  Layers,
  Plus,
} from 'lucide-react';
import {
  formatCurrencyPT,
  formatDatePT,
  formatNumberPT,
  getItemDisplayName,
  resolveCatalogPrice,
  todayISO,
} from '../lib/pricing';
import {
  QUOTE_STATUS_META,
  SHEET_META,
  type CatalogItem,
  type CatalogSheet,
  type CompanyProfile,
  type Quote,
  type QuoteStatus,
} from '../types';

interface DashboardViewProps {
  quotes: Quote[];
  catalogItems: CatalogItem[];
  profile: CompanyProfile | null;
  loading: boolean;
  onNewQuote: () => void;
  onOpenQuote: (quote: Quote) => Promise<void>;
  onPreviewQuote: (quote: Quote) => Promise<void>;
  onNavigateCatalog: (sheet?: CatalogSheet | 'all') => void;
  onNavigateHistory: (status?: QuoteStatus | 'all') => void;
  onNavigateSettings: () => void;
}

const MONTH_LABELS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function getLastSixMonths(): { key: string; label: string }[] {
  const now = new Date();
  const list: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_LABELS_PT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
    list.push({ key, label });
  }
  return list;
}

function diffDaysFromToday(isoDate: string): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const today = new Date(`${todayISO()}T12:00:00`);
  const target = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function DashboardView({
  quotes,
  catalogItems,
  profile,
  loading,
  onNewQuote,
  onOpenQuote,
  onPreviewQuote,
  onNavigateCatalog,
  onNavigateHistory,
  onNavigateSettings,
}: DashboardViewProps) {
  const defaultMargin = profile?.defaultMarginPercent ?? 30;
  const defaultVat = profile?.defaultVatRate ?? 23;

  // Métricas de Orçamentos
  const quoteStats = useMemo(() => {
    const byStatus: Record<QuoteStatus, { count: number; total: number }> = {
      rascunho: { count: 0, total: 0 },
      enviado: { count: 0, total: 0 },
      aprovado: { count: 0, total: 0 },
      recusado: { count: 0, total: 0 },
    };

    let grandAll = 0;
    for (const q of quotes) {
      const val = Number(q.grandTotal) || 0;
      grandAll += val;
      if (byStatus[q.status]) {
        byStatus[q.status].count += 1;
        byStatus[q.status].total += val;
      }
    }

    const approvedTotal = byStatus.aprovado.total;
    const pipelineTotal = byStatus.rascunho.total + byStatus.enviado.total;
    const pipelineCount = byStatus.rascunho.count + byStatus.enviado.count;
    const decidedCount = byStatus.aprovado.count + byStatus.recusado.count;
    const approvalRate = decidedCount > 0 ? (byStatus.aprovado.count / decidedCount) * 100 : null;
    const avgTicket = quotes.length > 0 ? grandAll / quotes.length : 0;

    return {
      byStatus,
      grandAll,
      approvedTotal,
      pipelineTotal,
      pipelineCount,
      decidedCount,
      approvalRate,
      avgTicket,
    };
  }, [quotes]);

  // Evolução mensal (últimos 6 meses)
  const monthlySeries = useMemo(() => {
    const months = getLastSixMonths();
    const map = new Map(
      months.map((m) => [m.key, { ...m, total: 0, approved: 0, count: 0 }])
    );

    for (const q of quotes) {
      const monthKey = (q.issueDate || '').slice(0, 7);
      const entry = map.get(monthKey);
      if (entry) {
        const val = Number(q.grandTotal) || 0;
        entry.total += val;
        entry.count += 1;
        if (q.status === 'aprovado') {
          entry.approved += val;
        }
      }
    }

    const arr = Array.from(map.values());
    const maxVal = Math.max(...arr.map((a) => a.total), 1);
    return { items: arr, maxVal };
  }, [quotes]);

  // Métricas do Catálogo & Fornecedores
  const catalogStats = useMemo(() => {
    const sheets: Record<CatalogSheet, { total: number; priced: number; unpriced: number }> = {
      material: { total: 0, priced: 0, unpriced: 0 },
      material_cons: { total: 0, priced: 0, unpriced: 0 },
      servicos: { total: 0, priced: 0, unpriced: 0 },
      outros: { total: 0, priced: 0, unpriced: 0 },
    };

    let pricedCount = 0;
    const unpricedItems: CatalogItem[] = [];
    const supplierWins = new Map<string, number>();
    let latestSupplierDate = '';

    for (const item of catalogItems) {
      const resolved = resolveCatalogPrice(item, defaultMargin);
      const bucket = sheets[item.sheet];
      if (bucket) bucket.total += 1;

      if (resolved.salePrice !== null && resolved.salePrice > 0) {
        pricedCount += 1;
        if (bucket) bucket.priced += 1;
      } else {
        unpricedItems.push(item);
        if (bucket) bucket.unpriced += 1;
      }

      if (resolved.bestSupplierName) {
        supplierWins.set(
          resolved.bestSupplierName,
          (supplierWins.get(resolved.bestSupplierName) || 0) + 1
        );
      }
      for (const sup of Object.values(item.suppliers || {})) {
        if (sup?.updatedAt && sup.updatedAt > latestSupplierDate) {
          latestSupplierDate = sup.updatedAt;
        }
      }
    }

    const topSuppliers = Array.from(supplierWins.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    const coveragePercent =
      catalogItems.length > 0 ? Math.round((pricedCount / catalogItems.length) * 100) : 0;

    return {
      sheets,
      total: catalogItems.length,
      pricedCount,
      unpricedCount: unpricedItems.length,
      unpricedSample: unpricedItems.slice(0, 5),
      coveragePercent,
      topSuppliers,
      latestSupplierDate,
    };
  }, [catalogItems, defaultMargin]);

  // Orçamentos em aberto a expirar em breve (<= 7 dias) ou expirados
  const expiringQuotes = useMemo(() => {
    return quotes
      .filter((q) => q.status === 'rascunho' || q.status === 'enviado')
      .map((q) => ({ quote: q, daysLeft: diffDaysFromToday(q.validUntil) }))
      .filter((x) => x.daysLeft !== null && x.daysLeft <= 7)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
      .slice(0, 4);
  }, [quotes]);

  const recentQuotes = useMemo(() => quotes.slice(0, 5), [quotes]);

  const statusOrder: QuoteStatus[] = ['aprovado', 'enviado', 'rascunho', 'recusado'];
  const statusBarColors: Record<QuoteStatus, string> = {
    aprovado: 'bg-emerald-600',
    enviado: 'bg-amber-500',
    rascunho: 'bg-slate-400',
    recusado: 'bg-red-500',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-14 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="lg:col-span-5 h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho Contextual */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mb-1">
            <span>{profile?.companyName || 'A Minha Empresa'}</span>
            <span aria-hidden="true">·</span>
            <span>Margem global {formatNumberPT(defaultMargin, 0)}%</span>
            <span aria-hidden="true">·</span>
            <span>IVA {formatNumberPT(defaultVat, 0)}%</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel Geral</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateCatalog('all')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Layers className="w-4 h-4 text-slate-500" />
            Gerir Catálogo
          </button>
          <button
            type="button"
            onClick={onNewQuote}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Novo Orçamento
          </button>
        </div>
      </div>

      {/* Faixa de 4 KPIs Reais (Elevação única, grelha estruturada) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">Volume Aprovado</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatCurrencyPT(quoteStats.approvedTotal, 2)}
          </div>
          <div className="text-xs text-slate-500">
            {quoteStats.byStatus.aprovado.count}{' '}
            {quoteStats.byStatus.aprovado.count === 1 ? 'orçamento' : 'orçamentos'}
            {quoteStats.approvalRate !== null && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">
                  {formatNumberPT(quoteStats.approvalRate, 0)}% conversão
                </span>
              </>
            )}
          </div>
        </div>

        <div className="p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">Em Aberto (Pipeline)</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrencyPT(quoteStats.pipelineTotal, 2)}
          </div>
          <div className="text-xs text-slate-500">
            <span className="font-mono tabular-nums">{quoteStats.byStatus.enviado.count}</span>{' '}
            enviados
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">{quoteStats.byStatus.rascunho.count}</span>{' '}
            rascunhos
          </div>
        </div>

        <div className="p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">Valor Médio por Orçamento</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrencyPT(quoteStats.avgTicket, 2)}
          </div>
          <div className="text-xs text-slate-500">
            Baseado em <span className="font-mono tabular-nums">{quotes.length}</span>{' '}
            {quotes.length === 1 ? 'proposta registada' : 'propostas registadas'}
          </div>
        </div>

        <div className="p-5 space-y-1.5">
          <div className="text-xs font-medium text-slate-500">Cobertura do Catálogo</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {catalogStats.pricedCount}
            <span className="text-base font-normal text-slate-400">/{catalogStats.total}</span>
          </div>
          <div className="text-xs text-slate-500">
            <span className="font-mono tabular-nums">{catalogStats.coveragePercent}%</span> com PVP
            ativo
            {catalogStats.unpricedCount > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-amber-700 font-medium">
                  {catalogStats.unpricedCount} sem preço
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Linha Analítica: Evolução Mensal & Estados (7) + Saúde do Catálogo por Folha (5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Esquerda: Evolução Mensal + Distribuição por Estado */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Volume Orçamentado (Últimos 6 Meses)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparação entre total orçamentado e propostas aprovadas por mês de emissão
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 inline-block" />
                Total
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-orange-600 inline-block" />
                Aprovado
              </span>
            </div>
          </div>

          {quotes.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
              <p className="text-sm font-medium text-slate-800">
                Ainda sem histórico mensal para apresentar
              </p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Assim que guardar o primeiro orçamento, a evolução mensal aparece aqui automaticamente.
              </p>
              <button
                type="button"
                onClick={onNewQuote}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar primeiro orçamento
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-3 items-end h-44 pt-4">
              {monthlySeries.items.map((m) => {
                const totalHeightPct =
                  m.total > 0 ? Math.max(8, Math.round((m.total / monthlySeries.maxVal) * 100)) : 0;
                const approvedHeightPct =
                  m.approved > 0
                    ? Math.max(8, Math.round((m.approved / monthlySeries.maxVal) * 100))
                    : 0;
                return (
                  <div key={m.key} className="flex flex-col items-center h-full justify-end gap-1.5">
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 truncate max-w-full">
                      {m.total > 0 ? formatCurrencyPT(m.total, 0) : '—'}
                    </div>
                    <div className="w-full max-w-[44px] flex-1 flex items-end justify-center relative bg-slate-50 rounded-t-md overflow-hidden">
                      {totalHeightPct > 0 && (
                        <div
                          className="w-full bg-slate-200 rounded-t-md transition-all duration-200 relative flex items-end"
                          style={{ height: `${totalHeightPct}%` }}
                          title={`${m.label}: ${formatCurrencyPT(m.total, 2)} (${m.count} orçamentos)`}
                        >
                          {approvedHeightPct > 0 && (
                            <div
                              className="w-full bg-orange-600 rounded-t-md transition-all duration-200"
                              style={{
                                height: `${Math.min(100, Math.round((m.approved / m.total) * 100))}%`,
                              }}
                              title={`Aprovado: ${formatCurrencyPT(m.approved, 2)}`}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-medium text-slate-600 whitespace-nowrap">
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Distribuição por Estado */}
          <div className="pt-5 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">Distribuição por Estado</h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                Total {formatCurrencyPT(quoteStats.grandAll, 2)}
              </span>
            </div>

            <div className="space-y-2.5">
              {statusOrder.map((st) => {
                const stat = quoteStats.byStatus[st];
                const meta = QUOTE_STATUS_META[st];
                const pct =
                  quotes.length > 0 ? Math.round((stat.count / quotes.length) * 100) : 0;

                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onNavigateHistory(st)}
                    className="w-full text-left group space-y-1 hover:bg-slate-50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
                        <span className="font-mono tabular-nums text-slate-400">
                          {stat.count} ({pct}%)
                        </span>
                      </span>
                      <span className="font-mono tabular-nums font-medium text-slate-900">
                        {formatCurrencyPT(stat.total, 2)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${statusBarColors[st]} transition-all duration-200`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Direita: Estrutura do Catálogo por Folha + Fornecedores */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Catálogo por Folha</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cobertura de preços nas 4 folhas do preçário
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateCatalog('all')}
              className="text-xs font-medium text-orange-700 hover:text-orange-800 inline-flex items-center gap-1 whitespace-nowrap"
            >
              Abrir catálogo
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
            {(['material', 'material_cons', 'servicos', 'outros'] as CatalogSheet[]).map(
              (sheetKey) => {
                const s = catalogStats.sheets[sheetKey];
                const pct = s.total > 0 ? Math.round((s.priced / s.total) * 100) : 0;
                return (
                  <button
                    key={sheetKey}
                    type="button"
                    onClick={() => onNavigateCatalog(sheetKey)}
                    className="w-full py-3 flex items-center justify-between gap-4 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {SHEET_META[sheetKey].label}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
                          {s.priced}/{s.total} com PVP
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-800 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              }
            )}
          </div>

          {/* Fornecedores com melhor preço */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Fornecedores com Melhor Preço</span>
              {catalogStats.latestSupplierDate && (
                <span className="text-slate-400 font-mono tabular-nums">
                  Últ. atualiz. {formatDatePT(catalogStats.latestSupplierDate)}
                </span>
              )}
            </div>

            {catalogStats.topSuppliers.length === 0 ? (
              <p className="text-xs text-slate-500">
                Sem preços de fornecedor preenchidos no catálogo.
              </p>
            ) : (
              <div className="space-y-1.5">
                {catalogStats.topSuppliers.map(([supplierName, count]) => (
                  <div
                    key={supplierName}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span className="text-slate-700">{supplierName}</span>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {count} {count === 1 ? 'artigo mais barato' : 'artigos mais baratos'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Linha Operacional: Orçamentos Recentes (7) + Atenção Necessária (5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Orçamentos Recentes */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Orçamentos Recentes</h2>
            <button
              type="button"
              onClick={() => onNavigateHistory('all')}
              className="text-xs font-medium text-orange-700 hover:text-orange-800 inline-flex items-center gap-1"
            >
              Ver histórico completo
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentQuotes.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-900">Ainda sem orçamentos guardados</p>
              <p className="text-xs text-slate-500 mt-1">
                Os seus últimos orçamentos aparecerão aqui para acesso rápido e exportação em PDF.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4 whitespace-nowrap">Número</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Estado</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">Total</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {recentQuotes.map((q) => {
                    const meta = QUOTE_STATUS_META[q.status];
                    return (
                      <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {q.quoteNumber}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900 truncate max-w-[200px]">
                            {q.clientName || 'Cliente não especificado'}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-[200px]">
                            {q.title || formatDatePT(q.issueDate)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`text-xs font-semibold ${meta.textClass}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrencyPT(q.grandTotal, 2)}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenQuote(q)}
                              title="Abrir no editor"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreviewQuote(q)}
                              title="Pré-visualizar PDF"
                              className="p-1.5 text-slate-500 hover:text-orange-700 hover:bg-orange-50 rounded-md"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Atenção Necessária: Validades + Artigos sem preço + Perfil PDF */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900">Pontos de Atenção</h2>
          </div>

          {/* 1. Orçamentos a expirar */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">
              Validade próxima ou expirada
            </div>
            {expiringQuotes.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nenhum orçamento em aberto com validade crítica nos próximos 7 dias.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {expiringQuotes.map(({ quote, daysLeft }) => (
                  <button
                    key={quote.id}
                    type="button"
                    onClick={() => onOpenQuote(quote)}
                    className="w-full py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-50 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {quote.quoteNumber} · {quote.clientName || 'Sem cliente'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Validade: {formatDatePT(quote.validUntil)}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        (daysLeft ?? 0) < 0 ? 'text-red-700' : 'text-amber-700'
                      }`}
                    >
                      {(daysLeft ?? 0) < 0
                        ? `Expirado há ${Math.abs(daysLeft ?? 0)}d`
                        : daysLeft === 0
                          ? 'Expira hoje'
                          : `${daysLeft}d restantes`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Artigos sem preço */}
          {catalogStats.unpricedCount > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  Artigos sem preço definido ({catalogStats.unpricedCount})
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateCatalog('material_cons')}
                  className="text-xs font-medium text-orange-700 hover:text-orange-800"
                >
                  Preencher
                </button>
              </div>
              <ul className="text-xs text-slate-600 space-y-1">
                {catalogStats.unpricedSample.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{getItemDisplayName(it)}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {SHEET_META[it.sheet].shortLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Aviso caso faltem dados fiscais para o PDF */}
          {(!profile?.nif || !profile?.address) && (
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                Complete o NIF, morada e logótipo da empresa para personalizar os PDFs.
              </div>
              <button
                type="button"
                onClick={onNavigateSettings}
                className="text-xs font-semibold text-slate-900 hover:text-orange-700 whitespace-nowrap shrink-0"
              >
                Configurar →
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
