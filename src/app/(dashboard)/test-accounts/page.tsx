'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { FlaskConical, Loader2, RefreshCw, Trash2, Copy, Wand2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import SetPasswordButton from '@/components/SetPasswordButton';

type Rol = 'driver' | 'valet';

interface CuentaPrueba {
  id: string;
  email: string;
  name: string;
  role: Rol;
  createdAt: string;
  createdBy: string;
}

const ROL_LABEL: Record<Rol, { label: string; class: string }> = {
  driver: { label: 'Chofer', class: 'bg-blue-50 text-blue-700 border-blue-200' },
  valet:  { label: 'Valet',  class: 'bg-violet-50 text-violet-700 border-violet-200' },
};

const MIN_PASSWORD = 8;

/** 14 caracteres sin los que se confunden al dictarlos (0/O, 1/l/I). */
function generarContrasena(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const numeros = '23456789';
  const simbolos = '!@#$%*?';
  const todos = letras + numeros + simbolos;
  const azar = (alfabeto: string) => {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    return alfabeto[n[0] % alfabeto.length];
  };
  const base = [azar(letras), azar(numeros), azar(simbolos), ...Array.from({ length: 11 }, () => azar(todos))];
  for (let i = base.length - 1; i > 0; i--) {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const j = n[0] % (i + 1);
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
}

const FORM_VACIO = { role: 'driver' as Rol, firstName: '', lastName: '', email: '', password: '' };

export default function TestAccounts() {
  const [cuentas, setCuentas] = useState<CuentaPrueba[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [creando, setCreando] = useState(false);
  const [creada, setCreada] = useState<{ email: string; password: string; role: Rol } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('/test-accounts');
      setCuentas(data.accounts ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const valido = !!form.firstName.trim() && emailValido && form.password.length >= MIN_PASSWORD;

  const crear = async () => {
    if (!valido) return;
    setCreando(true);
    try {
      await adminFetch('/test-accounts', { method: 'POST', body: JSON.stringify(form) });
      setCreada({ email: form.email.trim().toLowerCase(), password: form.password, role: form.role });
      setForm({ ...FORM_VACIO, role: form.role });
      toast.success('Cuenta de prueba creada');
      loadData();
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo crear la cuenta');
    } finally {
      setCreando(false);
    }
  };

  const eliminar = async (c: CuentaPrueba) => {
    if (!window.confirm(`¿Eliminar la cuenta de prueba ${c.email}? Ya no podrá iniciar sesión.`)) return;
    setBorrando(c.id);
    try {
      await adminFetch(`/test-accounts/${c.id}`, { method: 'DELETE' });
      toast.success('Cuenta eliminada');
      setCuentas(prev => prev.filter(x => x.id !== c.id));
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo eliminar la cuenta');
    } finally {
      setBorrando(null);
    }
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto).then(() => toast.success('Copiado'), () => toast.error('No se pudo copiar'));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Cuentas de prueba</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Cuentas que entran a la app con correo y contraseña, para revisores de Apple y Google y para QA.
          </p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Crear */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5">
        <p className="text-sm font-semibold text-gray-900 mb-4">Nueva cuenta</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
            <div className="flex gap-2">
              {(['driver', 'valet'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role: r }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.role === r ? 'border-(--brand) text-(--brand) bg-(--brand-pale)' : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
                  }`}
                >
                  {ROL_LABEL[r].label}
                </button>
              ))}
            </div>
          </div>
          <div className="hidden md:block" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
            <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="input-base text-sm w-full" placeholder="Apple" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Apellido</label>
            <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="input-base text-sm w-full" placeholder="Review" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Correo</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="input-base text-sm w-full"
              placeholder="applereview@urbont.com"
            />
            {form.email && !emailValido && <p className="text-[11px] text-red-600 mt-1">Correo no válido.</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="input-base text-sm w-full font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, password: generarContrasena() }))}
                className="btn-outline text-xs flex items-center gap-1.5 shrink-0"
              >
                <Wand2 className="w-3.5 h-3.5" /> Generar
              </button>
            </div>
            <p className={`text-[11px] mt-1 ${form.password && form.password.length < MIN_PASSWORD ? 'text-red-600' : 'text-gray-400'}`}>
              Mínimo {MIN_PASSWORD} caracteres.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-gray-500 mt-3">
          {form.role === 'driver'
            ? 'El chofer se crea aprobado, con un vehículo de prueba (sedán), operando en Miami.'
            : 'El valet se crea con la cuenta activa, asignado a "Urbont Test Venue".'}
          {' '}Es una cuenta real en producción: si se pone en línea dentro de la zona de servicio puede recibir viajes reales.
        </p>

        <div className="flex justify-end mt-4">
          <button onClick={crear} disabled={!valido || creando} className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50">
            {creando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crear cuenta
          </button>
        </div>

        {creada && (
          <div className="mt-4 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
            <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-4 h-4" /> Cuenta de {ROL_LABEL[creada.role].label.toLowerCase()} lista
            </p>
            <p className="text-[11px] text-emerald-700 mb-3">
              Guarda la contraseña ahora: no se vuelve a mostrar. Si la pierdes, cámbiala desde la lista.
            </p>
            {([['Usuario', creada.email], ['Contraseña', creada.password]] as const).map(([etiqueta, valor]) => (
              <div key={etiqueta} className="flex items-center gap-2 text-sm mb-1.5">
                <span className="w-24 text-xs text-emerald-700">{etiqueta}</span>
                <code className="flex-1 bg-white border border-emerald-200 rounded px-2 py-1 font-mono text-gray-900">{valor}</code>
                <button onClick={() => copiar(valor)} className="text-emerald-700 hover:text-emerald-900" aria-label={`Copiar ${etiqueta}`}>
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      {loading && cuentas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 border-b border-gray-50">
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-28" /></div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          {cuentas.length === 0 ? (
            <div className="py-14 flex flex-col items-center gap-3">
              <FlaskConical className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">Todavía no hay cuentas de prueba</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cuentas.map(c => (
                <div key={c.id} className="px-5 py-3.5 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.email}</p>
                  </div>
                  <span className={`badge-sm ${ROL_LABEL[c.role].class}`}>{ROL_LABEL[c.role].label}</span>
                  <span className="text-[11px] text-gray-400 w-40">Creada {formatRelativeTime(c.createdAt)} · {c.createdBy}</span>
                  <div className="flex gap-2">
                    <SetPasswordButton userId={c.id} userName={c.name} />
                    <button
                      onClick={() => eliminar(c)}
                      disabled={borrando === c.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 bg-white hover:bg-red-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {borrando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
