'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../services/auth/AuthProvider';

/** Pantalla unica de login para usuarios web (Firebase Auth email/password). */
export default function LoginPage() {
  const { firebaseUser, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && firebaseUser) router.replace('/');
  }, [loading, firebaseUser, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch {
      setError('Credenciales invalidas. Verifica tu correo y contrasena.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="gt-card"
        style={{ width: 360, display: 'grid', gap: 12 }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>GEN-Task</h1>
        <p className="gt-muted" style={{ margin: 0 }}>
          Inicia sesion para continuar
        </p>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Correo</span>
          <input
            className="gt-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Contrasena</span>
          <input
            className="gt-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <div className="gt-error">{error}</div>}

        <button className="gt-btn" type="submit" disabled={submitting}>
          {submitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
