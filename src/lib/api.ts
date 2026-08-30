'use client';

export type AdminRole = 'owner' | 'developer' | 'support' | 'operations' | 'analyst';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

const TOKEN_KEY = 'urbont_admin_token';
const USER_KEY = 'urbont_admin_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getUser(): AdminUser | null {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as AdminUser;
  } catch {
    return null;
  }
}

export function setUser(user: AdminUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeUser() {
  localStorage.removeItem(USER_KEY);
}

const API_BASE = '/api/admin';

export async function adminFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeToken();
    removeUser();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'API Error');
    }
    return data;
  }

  if (!response.ok) {
    throw new Error('API Error');
  }

  return response.text();
}
