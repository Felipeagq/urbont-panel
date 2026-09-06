'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Car, Users, FileText, DollarSign,
  MapPin, TrendingUp, AlertTriangle, MessageSquareWarning,
  Headphones, Star, Settings, Shield, LogOut, Menu, X, ChevronRight, CreditCard
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminRole } from '@/lib/api';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/version';
const urbontLogo = '/urbont-logo.png';

interface NavItem {
  name: string;
  label: string;
  href: string;
  icon: React.ElementType;
  roles: AdminRole[];
  group: 'main' | 'ops' | 'admin';
}

const NAV_ITEMS: NavItem[] = [
  { name: 'overview',    label: 'Resumen',         href: '/',           icon: LayoutDashboard,      roles: ['owner','developer','support','operations','analyst'], group: 'main' },
  { name: 'drivers',     label: 'Conductores',      href: '/drivers',    icon: Car,                  roles: ['owner','support','operations','analyst'],             group: 'main' },
  { name: 'passengers',  label: 'Pasajeros',        href: '/passengers', icon: Users,                roles: ['owner','support','analyst'],                          group: 'main' },
  { name: 'rides',       label: 'Viajes',           href: '/rides',      icon: MapPin,               roles: ['owner','support','operations','analyst'],             group: 'ops' },
  { name: 'documents',   label: 'Documentos',       href: '/documents',  icon: FileText,             roles: ['owner','operations'],                                 group: 'ops' },
  { name: 'fares',       label: 'Tarifas',          href: '/fares',      icon: DollarSign,           roles: ['owner','developer','operations'],                     group: 'ops' },
  { name: 'revenue',     label: 'Ingresos',         href: '/revenue',    icon: TrendingUp,           roles: ['owner','operations','analyst'],                       group: 'ops' },
  { name: 'incidents',   label: 'Incidentes',       href: '/incidents',  icon: AlertTriangle,        roles: ['owner','support','operations'],                       group: 'ops' },
  { name: 'complaints',  label: 'Quejas',           href: '/complaints', icon: MessageSquareWarning, roles: ['owner','support','operations'],                       group: 'ops' },
  { name: 'support',     label: 'Soporte',          href: '/support',    icon: Headphones,           roles: ['owner','support'],                                    group: 'ops' },
  { name: 'feedback',    label: 'Feedback',         href: '/feedback',   icon: Star,                 roles: ['owner','support','analyst'],                          group: 'ops' },
  { name: 'financiero',  label: 'Financiero',       href: '/financiero', icon: CreditCard,           roles: ['owner','analyst'],                                    group: 'admin' },
  { name: 'system',      label: 'Sistema',          href: '/system',     icon: Settings,             roles: ['owner','developer'],                                  group: 'admin' },
  { name: 'users',       label: 'Admin Users',      href: '/users',      icon: Shield,               roles: ['owner'],                                              group: 'admin' },
];

const ROLE_META: Record<AdminRole, { label: string; color: string }> = {
  owner:      { label: 'Owner',      color: 'bg-purple-500/20 text-purple-200 border-purple-400/30' },
  developer:  { label: 'Developer',  color: 'bg-blue-500/20 text-blue-200 border-blue-400/30' },
  support:    { label: 'Support',    color: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' },
  operations: { label: 'Operations', color: 'bg-orange-500/20 text-orange-200 border-orange-400/30' },
  analyst:    { label: 'Analyst',    color: 'bg-slate-500/20 text-slate-300 border-slate-400/30' },
};

const GROUP_LABELS: Record<string, string> = {
  main: 'General',
  ops: 'Operaciones',
  admin: 'Administración',
};

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function NavGroup({ label, items, location, onNavigate }: {
  label: string;
  items: NavItem[];
  location: string;
  onNavigate: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="section-label">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href} onClick={onNavigate}>
              <div
                className={cn('sidebar-item', isActive ? 'sidebar-item-active' : 'sidebar-item-inactive')}
                data-testid={`nav-${item.name}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-[13px]">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const location = usePathname() ?? '/';
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Cargando sesión...</span>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const allowedItems = NAV_ITEMS.filter(item => item.roles.includes(user.role));
  const groups = ['main', 'ops', 'admin'] as const;
  const roleMeta = ROLE_META[user.role];

  // Current page title
  const currentPage = NAV_ITEMS.find(i => i.href === location || (i.href !== '/' && location.startsWith(i.href)));

  const SidebarContent = () => (
    <div className="flex flex-col h-full" style={{ background: 'hsl(var(--sidebar))' }}>
      {/* Logo */}
      <div className="px-4 py-5 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <div className="flex items-center gap-3">
          <img src={urbontLogo} alt="Urbont" className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-white font-bold text-[15px] leading-none tracking-tight" data-testid="sidebar-logo">Urbont</p>
            <p className="text-white/45 text-[10px] uppercase tracking-widest font-medium mt-1">Command Center</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {groups.map(group => {
          const items = allowedItems.filter(i => i.group === group);
          return (
            <NavGroup
              key={group}
              label={GROUP_LABELS[group]}
              items={items}
              location={location}
              onNavigate={() => setMobileOpen(false)}
            />
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'var(--brand)' }}
          >
            {getInitials(user.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-none">{user.name}</p>
            <span className={cn(
              'inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border',
              roleMeta.color
            )}>
              {roleMeta.label}
            </span>
          </div>
        </div>
        <button
          onClick={() => logout()}
          data-testid="button-logout"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/6 text-xs font-medium transition-all duration-150"
          style={{ '--tw-bg-opacity': 1 } as React.CSSProperties}
        >
          <LogOut className="w-3.5 h-3.5" />
          Cerrar sesión
        </button>
        <p className="text-center text-white/25 text-[10px] mt-2" data-testid="app-version">
          {APP_VERSION}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop */}
      <div className="hidden lg:flex lg:w-[248px] lg:flex-shrink-0 lg:flex-col">
        <div className="fixed h-screen w-[248px]">
          <SidebarContent />
        </div>
      </div>

      {/* Sidebar — mobile */}
      <div className={cn(
        'fixed inset-y-0 left-0 z-50 w-[248px] lg:hidden transition-transform duration-300 ease-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-white/60 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center px-4 sm:px-6 flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <button
            className="lg:hidden mr-3 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400 font-medium">Urbont</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-gray-800 font-semibold">
              {currentPage?.label ?? 'Panel'}
            </span>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              En vivo
            </div>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
              style={{ background: 'var(--brand)' }}>
              {getInitials(user.name)}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
