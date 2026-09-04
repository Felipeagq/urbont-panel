'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Star, RefreshCw, Search, TrendingUp, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface FeedbackItem {
  id: string;
  userId: string;
  userName: string;
  driverId: string;
  driverName: string;
  rating: number;
  comment: string;
  createdAt: string;
  rideId: string;
}

function StarRow({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const sz = size === 'lg' ? 'w-6 h-6' : 'w-3.5 h-3.5';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`${sz} ${i <= rating ? 'text-amber-400' : 'text-gray-200'}`}
          fill={i <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}

const BAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/feedback')
      .then(data => setFeedback((data.feedback ?? []).map((f: any) => ({
        id: f.id,
        userId: f.user_id,
        userName: f.is_anonymous ? 'Anónimo' : (f.user_id || 'Usuario'),
        driverId: f.chauffeur_id,
        driverName: f.chauffeur_id || 'N/A',
        rating: f.rating ?? 0,
        comment: f.comment ?? '',
        createdAt: f.created_at,
        rideId: f.trip_id,
      }))))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const avgRating = feedback.length > 0
    ? feedback.reduce((acc, f) => acc + f.rating, 0) / feedback.length
    : 0;

  const distribution = [5, 4, 3, 2, 1].map(r => ({
    rating: `${r}★`,
    ratingNum: r,
    count: feedback.filter(f => f.rating === r).length,
    pct: feedback.length > 0 ? (feedback.filter(f => f.rating === r).length / feedback.length) * 100 : 0,
  }));

  // Top rated drivers
  const driverRatings = Object.values(
    feedback.reduce((acc, f) => {
      if (!acc[f.driverId]) acc[f.driverId] = { name: f.driverName, total: 0, count: 0 };
      acc[f.driverId].total += f.rating;
      acc[f.driverId].count += 1;
      return acc;
    }, {} as Record<string, { name: string; total: number; count: number }>)
  )
    .map(d => ({ ...d, avg: d.total / d.count }))
    .filter(d => d.count >= 3)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  const filtered = feedback.filter(f => {
    const q = search.toLowerCase();
    const matchSearch = f.userName.toLowerCase().includes(q) || f.driverName.toLowerCase().includes(q) || f.comment.toLowerCase().includes(q);
    const matchRating = ratingFilter === null || f.rating === ratingFilter;
    return matchSearch && matchRating;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Calificaciones y Reseñas</h1>
          <p className="text-sm text-gray-400 mt-0.5">{feedback.length} reseñas registradas</p>
        </div>
        <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Big average rating */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Calificación promedio</p>
              <p className="text-6xl font-bold text-gray-900 mb-2">{avgRating.toFixed(1)}</p>
              <StarRow rating={Math.round(avgRating)} size="lg" />
              <p className="text-sm text-gray-400 mt-3">Basado en {feedback.length.toLocaleString()} reseñas</p>
            </div>

            {/* Distribution chart */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Distribución de estrellas</p>
              <div className="space-y-2">
                {distribution.map(d => (
                  <button
                    key={d.ratingNum}
                    onClick={() => setRatingFilter(ratingFilter === d.ratingNum ? null : d.ratingNum)}
                    className={`w-full flex items-center gap-3 group rounded-lg px-2 py-1 transition-colors ${ratingFilter === d.ratingNum ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-xs font-medium text-gray-500 w-4">{d.ratingNum}</span>
                    <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" />
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${d.pct}%`, backgroundColor: BAR_COLORS[d.ratingNum - 1] }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{d.count}</span>
                  </button>
                ))}
              </div>
              {ratingFilter && (
                <button
                  onClick={() => setRatingFilter(null)}
                  className="mt-2 text-xs text-(--brand) hover:underline"
                >
                  Limpiar filtro
                </button>
              )}
            </div>

            {/* Top drivers */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Top conductores
              </p>
              {driverRatings.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Datos insuficientes</p>
              ) : (
                <div className="space-y-2.5">
                  {driverRatings.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{d.name}</p>
                        <p className="text-[10px] text-gray-400">{d.count} reseñas</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400" fill="currentColor" />
                        <span className="text-xs font-bold text-gray-900">{d.avg.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Search + filter */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                placeholder="Buscar por usuario, conductor, comentario..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand)"
              />
            </div>
            {ratingFilter && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 flex items-center gap-1">
                <Star className="w-3 h-3" fill="currentColor" />
                Solo {ratingFilter} estrellas
                <button onClick={() => setRatingFilter(null)} className="ml-1 hover:text-red-600">×</button>
              </span>
            )}
          </div>

          {/* Reviews table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="grid grid-cols-[100px_1fr_150px_150px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <span>Calificación</span>
              <span>Comentario</span>
              <span>Pasajero</span>
              <span>Conductor</span>
            </div>
            {filtered.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <Star className="w-10 h-10 text-gray-200" />
                <p className="text-sm text-gray-400">No se encontraron reseñas</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map(f => (
                  <div key={f.id} className="grid grid-cols-[100px_1fr_150px_150px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/60 transition-colors">
                    <div>
                      <StarRow rating={f.rating} />
                      <p className="text-[10px] text-gray-400 mt-1">{formatRelativeTime(f.createdAt)}</p>
                    </div>
                    <p className="text-sm text-gray-700 italic leading-snug line-clamp-2">"{f.comment}"</p>
                    <p className="text-sm text-gray-600 truncate">{f.userName}</p>
                    <p className="text-sm text-gray-600 truncate">{f.driverName}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
