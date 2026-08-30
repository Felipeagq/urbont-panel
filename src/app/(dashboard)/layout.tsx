'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/MainLayout';

/**
 * Guardia de autenticación para todas las rutas del panel.
 *
 * Equivale al antiguo `ProtectedRoute` de App.tsx, pero aplicado una sola vez
 * a nivel de layout: cualquier página dentro de (dashboard) queda protegida
 * sin envolverla individualmente.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        Loading session...
      </div>
    );
  }

  return <MainLayout>{children}</MainLayout>;
}
