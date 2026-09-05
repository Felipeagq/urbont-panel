'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import {
  Shield, RefreshCw, Search, UserPlus, X, Loader2,
  AlertTriangle, Lock, Unlock, Mail, Clock, ChevronDown,
  KeyRound, Eye, EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'developer' | 'support' | 'operations' | 'analyst';
  active: boolean;
  createdAt: string;
  lastLogin?: string;
}

const ROLE_CONFIG: Record<string, { label: string; class: string; desc: string }> = {
  owner:      { label: 'Owner',      class: 'bg-purple-100 text-purple-700 border-purple-200', desc: 'Acceso total al panel' },
  developer:  { label: 'Developer',  class: 'bg-blue-100 text-blue-700 border-blue-200',       desc: 'Acceso técnico y sistema' },
  support:    { label: 'Soporte',    class: 'bg-emerald-100 text-emerald-700 border-emerald-200', desc: 'Tickets y quejas' },
  operations: { label: 'Operaciones', class: 'bg-orange-100 text-orange-700 border-orange-200',  desc: 'Conductores y viajes' },
  analyst:    { label: 'Analista',   class: 'bg-slate-100 text-slate-700 border-slate-200',    desc: 'Reportes y revenue' },
};

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

interface InviteForm {
  name: string;
  email: string;
  role: string;
  password: string;
}

// Mismo mínimo que exige el formulario de invitación, para no aceptar aquí
// contraseñas que el backend rechazaría al crear el usuario.
const MIN_PASSWORD_LENGTH = 8;

/** Primer valor no vacío entre varias claves candidatas. */
function pick(raw: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * El backend no es consistente en la convención de nombres: /feedback devuelve
 * `created_at` (ver feedback/page.tsx) mientras que aquí `active` llega en
 * camelCase. En lugar de asumir una convención, aceptamos ambas para las fechas.
 *
 * Si aun así no reconocemos la fecha de creación —que todo usuario tiene— es que
 * el campo se llama de otra forma, así que lo avisamos con las claves reales para
 * poder ajustarlo sin tener que inspeccionar el payload a mano.
 */
function normalizeUser(raw: any): AdminUser {
  const createdAt = pick(raw, 'createdAt', 'created_at', 'createdOn', 'created');
  const lastLogin = pick(raw, 'lastLogin', 'last_login', 'lastLoginAt', 'last_login_at');

  if (process.env.NODE_ENV === 'development' && !createdAt) {
    console.warn(
      '[users] No se reconoció la fecha de creación. Claves recibidas:',
      Object.keys(raw ?? {}),
    );
  }

  return { ...raw, createdAt, lastLogin };
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  // El backend sólo permite a un owner cambiar la contraseña de otros admins;
  // ocultamos la acción al resto para no ofrecer un botón que dará 403.
  const isOwner = currentUser?.role === 'owner';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({ name: '', email: '', role: 'support', password: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [pwdTarget, setPwdTarget] = useState<AdminUser | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdVisible, setPwdVisible] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    adminFetch('/auth/users')
      .then((data: any) => (data.users ?? []).map(normalizeUser))
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInvite = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim() || !inviteForm.role || inviteForm.password.length < 8) return;
    setInviteLoading(true);
    try {
      await adminFetch('/auth/users', {
        method: 'POST',
        body: JSON.stringify(inviteForm),
      });
      toast.success(`Invitación enviada a ${inviteForm.email}`);
      setShowInvite(false);
      setInviteForm({ name: '', email: '', role: 'support', password: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar la invitación');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    setActionLoading(`toggle-${user.id}`);
    try {
      await adminFetch(`/auth/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !user.active }),
      });
      toast.success(user.active ? 'Usuario desactivado' : 'Usuario activado');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar el estado');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (userId: string) => {
    if (!editRole) return;
    setActionLoading(`role-${userId}`);
    try {
      await adminFetch(`/auth/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: editRole }),
      });
      toast.success('Rol actualizado');
      setEditTarget(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar el rol');
    } finally {
      setActionLoading(null);
    }
  };

  const closePasswordModal = useCallback(() => {
    setPwdTarget(null);
    setPwdValue('');
    setPwdConfirm('');
    setPwdVisible(false);
  }, []);

  // Cerrar con Escape, como cualquier diálogo modal.
  useEffect(() => {
    if (!pwdTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pwdLoading) closePasswordModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pwdTarget, pwdLoading, closePasswordModal]);

  const pwdTooShort = pwdValue.length > 0 && pwdValue.length < MIN_PASSWORD_LENGTH;
  const pwdMismatch = pwdConfirm.length > 0 && pwdValue !== pwdConfirm;
  const pwdValid = pwdValue.length >= MIN_PASSWORD_LENGTH && pwdValue === pwdConfirm;

  const handlePasswordChange = async () => {
    if (!pwdTarget || !pwdValid) return;
    setPwdLoading(true);
    try {
      await adminFetch(`/auth/users/${pwdTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: pwdValue }),
      });
      toast.success(`Contraseña actualizada para ${pwdTarget.name}`);
      closePasswordModal();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar la contraseña');
    } finally {
      setPwdLoading(false);
    }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const counts = {
    total: users.length,
    active: users.filter(u => u.active).length,
    byRole: Object.fromEntries(
      Object.keys(ROLE_CONFIG).map(r => [r, users.filter(u => u.role === r).length])
    ),
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title" data-testid="page-title">Usuarios del Panel</h1>
          <p className="text-sm text-gray-400 mt-0.5">{counts.active} activos de {counts.total} usuarios</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn-outline flex items-center gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="btn-primary flex items-center gap-2 text-xs"
          >
            <UserPlus className="w-3.5 h-3.5" /> Invitar usuario
          </button>
        </div>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
          <div key={role} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{counts.byRole[role] ?? 0}</p>
            <span className={`badge-sm mt-1 ${cfg.class}`}>{cfg.label}</span>
            <p className="text-[10px] text-gray-400 mt-1 leading-tight">{cfg.desc}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Buscar por nombre, email, rol..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand)"
        />
      </div>

      {/* Invite form panel */}
      {showInvite && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Invitar nuevo usuario al panel</h2>
            <button onClick={() => setShowInvite(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) bg-white"
                placeholder="Juan Pérez"
                value={inviteForm.name}
                onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) bg-white"
                placeholder="juan@urbont.com"
                value={inviteForm.email}
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Rol</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 bg-white"
                value={inviteForm.role}
                onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
              >
                <option value="support">Soporte</option>
                <option value="operations">Operaciones</option>
                <option value="analyst">Analista</option>
                <option value="developer">Developer</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contraseña temporal</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) bg-white"
                placeholder="Mín. 8 caracteres"
                value={inviteForm.password}
                onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleInvite}
              disabled={!inviteForm.name.trim() || !inviteForm.email.trim() || inviteForm.password.length < 8 || inviteLoading}
              className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {inviteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Enviar invitación
            </button>
            <button onClick={() => setShowInvite(false)} className="btn-outline text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 border-b border-gray-50">
              <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          {/* Table head */}
          <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1.4fr] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <span>Usuario</span>
            <span>Email</span>
            <span>Rol</span>
            <span>Último acceso</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Shield className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400">No se encontraron usuarios</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(user => {
                const role = ROLE_CONFIG[user.role] ?? ROLE_CONFIG.analyst;
                const av = avatarColor(user.name);
                const isEditingRole = editTarget === user.id;

                return (
                  <div key={user.id} className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1.4fr] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/50 transition-colors">
                    {/* User */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${av} ${!user.active ? 'opacity-40' : ''}`}>
                        {getInitials(user.name)}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${user.active ? 'text-gray-900' : 'text-gray-400'}`}>{user.name}</p>
                        <p className="text-xs text-gray-400 truncate">Creado {formatDate(user.createdAt)}</p>
                      </div>
                    </div>

                    {/* Email */}
                    <p className="text-sm text-gray-600 truncate">{user.email}</p>

                    {/* Role */}
                    <div>
                      {isEditingRole ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={editRole}
                            onChange={e => setEditRole(e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-(--brand)/30"
                          >
                            {Object.entries(ROLE_CONFIG).map(([r, cfg]) => (
                              <option key={r} value={r}>{cfg.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleRoleChange(user.id)}
                            disabled={!!actionLoading}
                            className="px-2 py-1 bg-(--brand) text-white rounded text-[10px] font-medium disabled:opacity-50"
                          >
                            {actionLoading === `role-${user.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
                          </button>
                          <button onClick={() => setEditTarget(null)} className="p-1 text-gray-400 hover:text-gray-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditTarget(user.id); setEditRole(user.role); }}
                          className={`badge-sm cursor-pointer hover:opacity-80 transition-opacity ${role.class}`}
                        >
                          {role.label} <ChevronDown className="w-2.5 h-2.5 ml-0.5 inline" />
                        </button>
                      )}
                    </div>

                    {/* Last login */}
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock className="w-3 h-3 text-gray-300 flex-shrink-0" />
                      {user.lastLogin ? formatRelativeTime(user.lastLogin) : 'Nunca'}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end items-center gap-1.5">
                      {isOwner && (
                        <button
                          onClick={() => { closePasswordModal(); setPwdTarget(user); }}
                          disabled={!!actionLoading}
                          title={`Cambiar contraseña de ${user.name}`}
                          aria-label={`Cambiar contraseña de ${user.name}`}
                          className="flex items-center justify-center p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-(--brand)/5 hover:text-(--brand) hover:border-(--brand)/30 transition-colors disabled:opacity-50"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={!!actionLoading}
                        title={user.active ? 'Desactivar acceso' : 'Activar acceso'}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                          user.active
                            ? 'border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {actionLoading === `toggle-${user.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : user.active ? (
                          <><Lock className="w-3.5 h-3.5" /> Desactivar</>
                        ) : (
                          <><Unlock className="w-3.5 h-3.5" /> Activar</>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Password change modal */}
      {pwdTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px] p-4"
          onClick={() => { if (!pwdLoading) closePasswordModal(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Cambiar contraseña de ${pwdTarget.name}`}
            className="bg-white rounded-xl border border-gray-100 shadow-xl w-full max-w-md p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor(pwdTarget.name)}`}>
                  {getInitials(pwdTarget.name)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 truncate">Cambiar contraseña</h2>
                  <p className="text-xs text-gray-400 truncate">{pwdTarget.name} · {pwdTarget.email}</p>
                </div>
              </div>
              <button
                onClick={closePasswordModal}
                disabled={pwdLoading}
                className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nueva contraseña</label>
                <div className="relative">
                  <input
                    type={pwdVisible ? 'text' : 'password'}
                    autoFocus
                    autoComplete="new-password"
                    className="w-full border border-gray-200 rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) bg-white"
                    placeholder={`Mín. ${MIN_PASSWORD_LENGTH} caracteres`}
                    value={pwdValue}
                    onChange={e => setPwdValue(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setPwdVisible(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                    aria-label={pwdVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {pwdVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {pwdTooShort && (
                  <p className="text-[11px] text-red-600 mt-1">La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Confirmar contraseña</label>
                <input
                  type={pwdVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--brand)/30 focus:border-(--brand) bg-white"
                  placeholder="Repite la contraseña"
                  value={pwdConfirm}
                  onChange={e => setPwdConfirm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && pwdValid && !pwdLoading) handlePasswordChange(); }}
                />
                {pwdMismatch && (
                  <p className="text-[11px] text-red-600 mt-1">Las contraseñas no coinciden.</p>
                )}
              </div>

              <p className="text-[11px] text-gray-400 leading-snug">
                El usuario deberá iniciar sesión con esta contraseña. Comunícasela por un canal seguro.
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handlePasswordChange}
                disabled={!pwdValid || pwdLoading}
                className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {pwdLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Cambiar contraseña
              </button>
              <button onClick={closePasswordModal} disabled={pwdLoading} className="btn-outline text-xs disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
