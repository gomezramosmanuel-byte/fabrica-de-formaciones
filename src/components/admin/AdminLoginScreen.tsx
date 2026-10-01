import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { UClaroTecnologiaLogo } from '../common/ClaroBrandAssets.tsx';
import { signInWithGoogleAdmin } from '../../firebase.ts';

interface AdminLoginScreenProps {
  onSuccess: (token: string, email: string) => void;
  onBackToPortal: () => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  onSuccess,
  onBackToPortal,
}) => {
  const [email, setEmail] = useState('admin@fabricaformacion.co');
  const [password, setPassword] = useState('Admin2026*');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Credenciales administrativas no válidas');
      }
      onSuccess(data.token, data.admin?.email || email);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFirebaseGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const { user, idToken } = await signInWithGoogleAdmin();
      const res = await fetch('/api/admin/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          uid: user.uid,
          displayName: user.displayName,
          idToken,
          emailVerified: user.emailVerified,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || 'Tu cuenta de Google no está autorizada como Administrador.'
        );
      }
      onSuccess(data.token, data.admin?.email || user.email || '');
    } catch (err: any) {
      setError(
        err.message ||
          'No se pudo completar el inicio de sesión con Firebase Authentication.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between">
      <header className="border-b-2 border-[#DA291C] bg-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UClaroTecnologiaLogo className="w-11 h-11 shrink-0" />
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#DA291C]">
                U Claro Tecnología · Acceso Restringido
              </div>
              <div className="text-sm font-bold text-slate-900">
                Panel del Administrador (/admin/login)
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToPortal}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ir a Biblioteca de Capacitaciones</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="h-2 w-full bg-[#DA291C]" />
          <div className="p-7 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-[#DA291C]" />
              </div>
              <div>
                <div className="text-[11px] font-mono font-bold uppercase text-[#DA291C]">
                  ZONA EXCLUSIVA ADMINISTRADORES
                </div>
                <h1 className="text-lg font-extrabold text-slate-900">
                  Iniciar Sesión Administrativa
                </h1>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Esta ruta (<span className="font-mono font-semibold">/admin/login</span>) está protegida mediante Firebase Authentication y reglas de seguridad en Firestore. Los participantes públicos no tienen acceso a este panel.
            </p>

            {error && (
              <div className="p-3.5 bg-red-50 border-l-4 border-[#DA291C] rounded-r-lg flex items-start gap-2.5 text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 text-[#DA291C] shrink-0 mt-0.5" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={handleFirebaseGoogleLogin}
              className="w-full py-3 px-4 text-xs font-extrabold uppercase tracking-wide text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl transition-colors flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Autenticar con Firebase Auth (Google Corporativo)</span>
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200" />
              <span className="shrink mx-3 text-[11px] font-semibold text-slate-400 uppercase">
                o credenciales autorizadas
              </span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <form onSubmit={handleCredentialsLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Correo de Administrador *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Contraseña *
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? 'Verificando permisos...' : 'Ingresar a /admin/dashboard'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};
