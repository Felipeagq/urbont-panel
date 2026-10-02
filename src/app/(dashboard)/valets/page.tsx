'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { Search, ConciergeBell, RefreshCw, AlertTriangle, ChevronRight, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import ValetDrawer, { VALET_STATUS, type Valet, type ValetStatus } from '@/components/ValetDrawer';

const FILTERS = ['all', 'pending', 'active', 'suspended', 'rejected'] as const;

const money = (n: number) => `$${n.toFixed(2)}`;

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700',
];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

const BADGE: Record<ValetStatus, string> = {
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  rejected:  'bg-gray-50 text-gray-600 border-gray-200',
};

export default function Valets() {
  const [valets, setValets] = useState<Valet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [selected, setSelected] = useState<Valet | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('/valets');
      setValets(data.valets ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Mantiene el drawer al día cuando la lista se recarga tras una acción.
  useEffect(() => {
    setSelected(prev => (prev ? valets.find(v => v.id === prev.id) ?? prev : prev));
  }, [valets]);

  const filtered = valets.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q)
      || v.phone.includes(q) || v.property.toLowerCase().includes(q) || v.city.toLowerCase().includes(q);
    return matchSearch && (filter === 'all' || v.status === filter);
  });

  const counts = Object.fromEntries(
    FILTERS.map(f => [f, f === 'all' ? valets.length : valets.filter(v => v.status === f).length]),
  ) as Record<(typeof FILTERS)[number], number>;

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title" data-testid="page-title">Valets</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {valets.length} registrados · {counts.pending} solicitudes por revisar
            </p>
          </div>
          <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filter === f
                  ? 'border-(--brand) text-(--brand) bg-(--brand-pale)'
                  : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
              }`}
            >
              {f === 'all' ? 'Todos' : VALET_STATUS[f].label}
              <span className={`ml-1.5 font-bold ${filter === f ? 'text-(--brand)' : 'text-gray-400'}`}>{counts[f]}</span>
            </button>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar por nombre, email, propiedad o ciudad..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-valets"
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) transition-all"
          />
        </div>

        {loading && valets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-gray-50">
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
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
            <div className="grid grid-cols-[2fr_1.5fr_1.2fr_1fr_30px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <span>Valet</span><span>Propiedad</span><span>Actividad</span><span>Estado</span><span />
            </div>

            {filtered.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <ConciergeBell className="w-10 h-10 text-gray-200" />
                <p className="text-sm text-gray-400">No se encontraron valets</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map(v => (
                  <div
                    key={v.id}
                    className="grid grid-cols-[2fr_1.5fr_1.2fr_1fr_30px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/70 transition-colors cursor-pointer"
                    onClick={() => setSelected(v)}
                    data-testid={`row-valet-${v.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(v.name)}`}>
                        {getInitials(v.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{v.name}</p>
                        <p className="text-xs text-gray-400 truncate">{v.email}</p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 truncate">{v.property || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">{v.city || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                        {v.ridesCompleted} viajes
                        {v.rating != null && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-500 ml-1">
                            <Star className="w-3 h-3 text-amber-400" />{v.rating.toFixed(1)}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{money(v.commissionTotal)} ganados</p>
                    </div>
                    <span className={`badge-sm w-fit ${BADGE[v.status]}`}>{VALET_STATUS[v.status].label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ValetDrawer valet={selected} onClose={() => setSelected(null)} onRefresh={loadData} />
    </>
  );
}
