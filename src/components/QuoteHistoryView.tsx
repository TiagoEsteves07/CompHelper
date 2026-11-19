import { useMemo, useState } from 'react';
import { Copy, Eye, FileEdit, Plus, Search, Trash2 } from 'lucide-react';
import { formatCurrencyPT, formatDatePT } from '../lib/pricing';
import { QUOTE_STATUS_META, type Quote, type QuoteStatus } from '../types';

interface QuoteHistoryViewProps {
  quotes: Quote[];
  loading: boolean;
  initialStatus?: 'all' | QuoteStatus;
  onNewQuote: () => void;
  onOpenQuote: (quote: Quote) => Promise<void>;
  onPreviewQuote: (quote: Quote) => Promise<void>;
  onDuplicateQuote: (quote: Quote) => Promise<void>;
  onUpdateStatus: (quoteId: string, status: QuoteStatus) => Promise<void>;
  onDeleteQuote: (quoteId: string) => Promise<void>;
}

type StatusFilter = 'all' | QuoteStatus;

export function QuoteHistoryView({
  quotes,
  loading,
  initialStatus = 'all',
  onNewQuote,
  onOpenQuote,
  onPreviewQuote,
  onDuplicateQuote,
  onUpdateStatus,
  onDeleteQuote,
}: QuoteHistoryViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: quotes.length,
      rascunho: 0,
      enviado: 0,
      aprovado: 0,
      recusado: 0,
    };
    for (const q of quotes) {
      if (c[q.status] !== undefined) c[q.status]++;
    }
    return c;
  }, [quotes]);

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${item.quoteNumber} ${item.clientName} ${item.title} ${item.clientNif}`.toLowerCase();
      return hay.includes(q);
    });
  }, [quotes, search, statusFilter]);

  const totalApproved = useMemo(
    () =>
      quotes
        .filter((q) => q.status === 'aprovado')
        .reduce((acc, q) => acc + (q.grandTotal || 0), 0),
    [quotes]
  );

  const totalPending = useMemo(
    () =>
      quotes
        .filter((q) => q.status === 'enviado' || q.status === 'rascunho')
        .reduce((acc, q) => acc + (q.grandTotal || 0), 0),
    [quotes]
  );

  const statusTabs: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'rascunho', label: 'Rascunho' },
    { id: 'enviado', label: 'Enviado' },
    { id: 'aprovado', label: 'Aprovado' },
    { id: 'recusado', label: 'Recusado' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Histórico de Orçamentos
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Acompanhe propostas enviadas, duplique orçamentos anteriores e exporte PDFs prontos a enviar.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewQuote}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Novo Orçamento
        </button>
      </div>

      {/* Faixa de Resumo Estruturada (sem cards aninhados) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs text-slate-500">Total de orçamentos</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {quotes.length}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Em aberto (Rascunho + Enviado)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatCurrencyPT(totalPending, 2)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Aprovados</div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {formatCurrencyPT(totalApproved, 2)}
          </div>
        </div>
      </div>

      {/* Tabela de Orçamentos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}{' '}
                <span className="font-mono tabular-nums text-slate-400 ml-1">
                  {counts[tab.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="relative lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar cliente, número ou obra..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              {quotes.length === 0
                ? 'Ainda não guardou nenhum orçamento'
                : 'Nenhum orçamento corresponde aos filtros aplicados'}
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              {quotes.length === 0
                ? 'Crie o seu primeiro orçamento no Criador de Orçamentos para aparecer aqui.'
                : 'Limpe a pesquisa ou mude o filtro de estado.'}
            </p>
            {quotes.length === 0 && (
              <button
                type="button"
                onClick={onNewQuote}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Criar primeiro orçamento
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 whitespace-nowrap">Número</th>
                  <th className="py-3 px-4">Cliente e Referência</th>
                  <th className="py-3 px-4 whitespace-nowrap">Data · Validade</th>
                  <th className="py-3 px-4 whitespace-nowrap">Estado</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Total</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredQuotes.map((quote) => {
                  const meta = QUOTE_STATUS_META[quote.status];
                  const isFinal = quote.status === 'aprovado' || quote.status === 'recusado';
                  const isDeleting = confirmDeleteId === quote.id;
                  const isBusy = busyId === quote.id;

                  return (
                    <tr key={quote.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {quote.quoteNumber}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">
                          {quote.clientName || 'Cliente não especificado'}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {quote.title || 'Sem referência'} ·{' '}
                          <span className="font-mono tabular-nums">
                            {quote.lineCount} {quote.lineCount === 1 ? 'item' : 'itens'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatDatePT(quote.issueDate)}
                        <span className="text-slate-300 mx-1.5">·</span>
                        {formatDatePT(quote.validUntil)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isFinal ? (
                          <span className={`text-xs font-semibold ${meta.textClass}`}>
                            {meta.label}
                          </span>
                        ) : (
                          <select
                            value={quote.status}
                            disabled={isBusy}
                            aria-label={`Alterar estado do orçamento ${quote.quoteNumber}`}
                            onChange={async (e) => {
                              setBusyId(quote.id);
                              try {
                                await onUpdateStatus(quote.id, e.target.value as QuoteStatus);
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className={`text-xs font-medium bg-white border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-orange-600 ${meta.textClass}`}
                          >
                            <option value="rascunho">Rascunho</option>
                            <option value="enviado">Enviado</option>
                            <option value="aprovado">Aprovado</option>
                            <option value="recusado">Recusado</option>
                          </select>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-mono tabular-nums font-semibold text-slate-900">
                          {formatCurrencyPT(quote.grandTotal, 2)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {quote.applyVat ? `c/ IVA ${quote.vatRate}%` : 's/ IVA'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isDeleting ? (
                          <div className="inline-flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={async () => {
                                setBusyId(quote.id);
                                try {
                                  await onDeleteQuote(quote.id);
                                } finally {
                                  setBusyId(null);
                                  setConfirmDeleteId(null);
                                }
                              }}
                              className="px-2 py-1 font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                            >
                              Eliminar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-slate-600 hover:text-slate-900"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onOpenQuote(quote)}
                              title="Abrir no editor"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              Abrir
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onPreviewQuote(quote)}
                              title="Pré-visualizar e exportar PDF"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setBusyId(quote.id);
                                try {
                                  await onDuplicateQuote(quote);
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              title="Duplicar orçamento"
                              className="p-1.5 text-slate-500 hover:text-orange-700 hover:bg-orange-50 rounded-md transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteId(quote.id)}
                              title="Eliminar orçamento"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
