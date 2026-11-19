import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import type { CompanyProfile } from '../types';

interface CompanySettingsViewProps {
  profile: CompanyProfile | null;
  onSaveProfile: (
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
  ) => Promise<void>;
}

async function compressLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 260;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Erro ao processar imagem.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const pngData = canvas.toDataURL('image/png');
        if (pngData.length <= 320000) {
          resolve(pngData);
        } else {
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        }
      };
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    reader.readAsDataURL(file);
  });
}

export function CompanySettingsView({ profile, onSaveProfile }: CompanySettingsViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [companyName, setCompanyName] = useState('');
  const [nif, setNif] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [defaultMarginPercent, setDefaultMarginPercent] = useState('30');
  const [defaultVatRate, setDefaultVatRate] = useState('23');
  const [defaultValidityDays, setDefaultValidityDays] = useState('30');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState('');
  const [defaultNotes, setDefaultNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setCompanyName(profile.companyName || '');
    setNif(profile.nif || '');
    setAddress(profile.address || '');
    setPhone(profile.phone || '');
    setEmail(profile.email || '');
    setLogoDataUrl(profile.logoDataUrl || '');
    setDefaultMarginPercent(String(profile.defaultMarginPercent ?? 30));
    setDefaultVatRate(String(profile.defaultVatRate ?? 23));
    setDefaultValidityDays(String(profile.defaultValidityDays ?? 30));
    setDefaultPaymentTerms(profile.defaultPaymentTerms || '');
    setDefaultNotes(profile.defaultNotes || '');
  }, [profile]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressLogoFile(file);
      setLogoDataUrl(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar logótipo.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSaveProfile({
        companyName,
        nif,
        address,
        phone,
        email,
        logoDataUrl,
        defaultMarginPercent: Number(defaultMarginPercent.replace(',', '.')) || 0,
        defaultVatRate: Number(defaultVatRate.replace(',', '.')) || 0,
        defaultValidityDays: Math.max(1, Math.round(Number(defaultValidityDays) || 30)),
        defaultPaymentTerms,
        defaultNotes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar definições.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Dados da Empresa e PDF
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Estes dados aparecem automaticamente no cabeçalho e rodapé dos seus orçamentos exportados em PDF.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identidade e Logótipo */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900">Identificação da Empresa</h2>

          <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-5 border-b border-slate-100">
            <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              {logoDataUrl ? (
                <img
                  src={logoDataUrl}
                  alt="Logótipo da empresa"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-1.5"
                />
              ) : (
                <ImagePlus className="w-6 h-6 text-slate-400" />
              )}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-900">Logótipo para o PDF</div>
              <p className="text-xs text-slate-500">
                PNG ou JPG. Redimensionado automaticamente para impressão nítida em A4.
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  {logoDataUrl ? 'Alterar logótipo' : 'Carregar logótipo'}
                </button>
                {logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoDataUrl('')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-8">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nome Comercial / Denominação Social
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex.: Metalúrgica Central, Lda."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-600"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">NIF</label>
              <input
                type="text"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                placeholder="Ex.: 509 123 456"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>

            <div className="sm:col-span-12">
              <label className="block text-xs font-medium text-slate-700 mb-1">Morada</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Zona Industrial, Lote 12, 4000-000 Porto"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>

            <div className="sm:col-span-6">
              <label className="block text-xs font-medium text-slate-700 mb-1">Telefone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+351 912 345 678"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>
            <div className="sm:col-span-6">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Comercial
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="orcamentos@empresa.pt"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>
          </div>
        </section>

        {/* Parâmetros Financeiros e Condições */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Parâmetros Financeiros e Condições Padrão
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Margem Global sobre Fornecedor (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={defaultMarginPercent}
                onChange={(e) => setDefaultMarginPercent(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Taxa de IVA Padrão (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={defaultVatRate}
                onChange={(e) => setDefaultVatRate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Validade Padrão (dias)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={defaultValidityDays}
                onChange={(e) => setDefaultValidityDays(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums text-right bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Condições de Pagamento (impressas no PDF)
              </label>
              <textarea
                rows={2}
                value={defaultPaymentTerms}
                onChange={(e) => setDefaultPaymentTerms(e.target.value)}
                placeholder="Ex.: 50% na adjudicação e 50% na entrega."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Notas / Observações Padrão para Novos Orçamentos
              </label>
              <textarea
                rows={2}
                value={defaultNotes}
                onChange={(e) => setDefaultNotes(e.target.value)}
                placeholder="Ex.: Prazo de entrega sujeito a confirmação de stock."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-orange-600"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'A guardar...' : 'Guardar Definições'}
          </button>
        </div>
      </form>
    </div>
  );
}
