'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, Mail, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
const urbontLogo = '/urbont-logo.png';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Invalid credentials');
      login(data.token, data.user);
      router.push('/');
      toast.success('Signed in successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, hsl(205 55% 22%) 0%, hsl(205 51% 37%) 100%)' }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <img src={urbontLogo} alt="Urbont" className="w-10 h-10 rounded-xl shadow-lg" />
          <div>
            <p className="text-white font-bold text-lg tracking-tight leading-none">Urbont</p>
            <p className="text-white/60 text-xs font-medium tracking-wider uppercase mt-0.5">Command Center</p>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
              Command<br />Center
            </h1>
            <p className="text-white/65 text-base leading-relaxed max-w-sm">
              Operations platform for managing drivers, rides, revenue, and support across the Urbont network.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="space-y-3">
            {[
              'Real-time operations monitoring',
              'Driver & passenger management',
              'Fare control and revenue tracking',
              'Integrated support system',
            ].map((label) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/50 flex-shrink-0" />
                <p className="text-white/65 text-sm">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10 flex items-center gap-2 text-white/35 text-xs">
          <Shield className="w-3.5 h-3.5" />
          <span>Restricted access — authorized personnel only</span>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 lg:px-16 bg-white">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10 flex items-center gap-3">
          <img src={urbontLogo} alt="Urbont" className="w-9 h-9 rounded-xl" />
          <div>
            <p className="font-bold text-gray-900 text-lg leading-none">Urbont</p>
            <p className="text-gray-400 text-xs tracking-wider uppercase mt-0.5">Command Center</p>
          </div>
        </div>

        <div className="w-full max-w-[380px]">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight" data-testid="text-login-title">
              Sign in
            </h2>
            <p className="text-gray-400 text-sm mt-1.5">Enter your credentials to access the platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="user@urbont.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-email"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[--brand]/30 focus:border-[--brand] transition-all duration-150 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="input-password"
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[--brand]/30 focus:border-[--brand] transition-all duration-150 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || !email || !password}
                data-testid="button-submit-login"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--brand]/50 disabled:opacity-55 disabled:cursor-not-allowed"
                style={{ background: 'var(--brand)' }}
                onMouseEnter={(e) => { (e.currentTarget.style.background = 'var(--brand-light)') }}
                onMouseLeave={(e) => { (e.currentTarget.style.background = 'var(--brand)') }}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verifying...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-center text-xs text-gray-400">
              Having trouble signing in? Contact your system administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
