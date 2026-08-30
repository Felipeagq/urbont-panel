'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, setToken, setUser, removeToken, removeUser, type AdminUser, adminFetch } from '@/lib/api';

interface AuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  login: (token: string, user: AdminUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initAuth = () => {
      const token = getToken();
      const storedUser = getUser();
      
      if (token && storedUser) {
        setUserState(storedUser);
      } else {
        removeToken();
        removeUser();
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = (token: string, newUser: AdminUser) => {
    setToken(token);
    setUser(newUser);
    setUserState(newUser);
    router.push('/');
  };

  const logout = async () => {
    try {
      await adminFetch('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      removeToken();
      removeUser();
      setUserState(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
