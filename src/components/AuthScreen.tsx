import { useState } from 'react';
import { Calculator, FileSpreadsheet, FileText, Layers } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';

export function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code || '')
          : '';
      const msg = err instanceof Error ? err.message : '';
      const host = typeof window !== 'undefined' ? window.location.hostname : '';

      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        setError(
          `Domínio não autorizado no Firebase (${host}). Adicione "${host}" em Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
        setError('A janela de autenticação foi fechada antes de concluir o início de sessão.');
      } else if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
        setError(
          'O navegador bloqueou a janela de início de sessão Google. Permita pop-ups para este site e tente novamente.'
        );
      } else if (code === 'auth/operation-not-allowed') {
        setError(
          'O início de sessão com Google não está ativo no projeto Firebase (Authentication → Sign-in method).'
        );
      } else {
        setError(
          `Não foi possível iniciar sessão com o Google${code ? ` (${code})` : ''}. Verifique os domínios autorizados no Firebase.`
        );
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
            CompHelper
          </span>
          <span className="text-xs text-slate-500">Catálogo & Orçamentação</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
              Preçário multi-fornecedor e orçamentos em segundos.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              Centralize materiais, consumíveis, serviços e serralharia a partir do seu Excel,
              calcule automaticamente o PVP sobre o melhor fornecedor e envie propostas em PDF
              sincronizadas em todos os seus dispositivos.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 pt-4 border-t border-slate-200">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Layers className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>4 folhas estruturadas</span>
                </div>
                <p className="text-sm text-slate-600">
                  Material, Consumíveis, Serviços e Outros com comparação de fornecedores e datas.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Calculator className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>Cálculo automático de PVP</span>
                </div>
                <p className="text-sm text-slate-600">
                  Melhor preço de fornecedor + margem configurável e totais em tempo real com IVA.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileSpreadsheet className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>Importação e exportação Excel</span>
                </div>
                <p className="text-sm text-slate-600">
                  Carregue ficheiros .xlsx/.csv com pré-visualização e atualização em lote.
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileText className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>PDF personalizado</span>
                </div>
                <p className="text-sm text-slate-600">
                  Cabeçalho da sua empresa, logótipo, condições de pagamento e histórico completo.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-white border border-slate-200 rounded-xl p-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-2">
                Aceder à sua área de trabalho
              </h2>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Inicie sessão com a sua conta Google para sincronizar o catálogo e os orçamentos na
                nuvem de forma privada.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.48-1.69 4.34-5.27 4.34-3.17 0-5.76-2.63-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.44l2.53-2.44C16.79 4.13 14.69 3.2 12.17 3.2 7.12 3.2 3.04 7.28 3.04 12.5s4.08 9.3 9.13 9.3c5.27 0 8.76-3.7 8.76-8.92 0-.6-.06-1.06-.16-1.78z"
                  />
                </svg>
                {loading ? 'A iniciar sessão...' : 'Continuar com Google'}
              </button>

              <p className="mt-5 text-xs text-slate-500 leading-relaxed">
                A sua conta inicia totalmente limpa: introduza os seus artigos manualmente ou
                importe diretamente o seu ficheiro Excel (.xlsx / .csv).
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-500">
          <span>CompHelper</span>
          <span>Dados privados e sincronizados por utilizador</span>
        </div>
      </footer>
    </div>
  );
}
