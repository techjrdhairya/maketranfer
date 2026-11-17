import React, { useState } from 'react';
import { ArrowRight, Cloud, FileText, Loader2, Lock, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';

interface SignInPageProps {
  onDone: () => void;
}

const FEATURES = [
  { icon: Zap, title: 'Instant links', desc: 'Upload a file or folder and get a shareable link in seconds.' },
  { icon: Lock, title: 'You stay in control', desc: 'Passwords, expiry dates and download limits on every link.' },
  { icon: FileText, title: 'Preview anything', desc: 'PDF, Word, Excel, images, video, code and more, right in the browser.' },
  { icon: Cloud, title: 'Synced everywhere', desc: 'Sign in to manage all your links from any phone or PC.' },
];

export const SignInPage: React.FC<SignInPageProps> = ({ onDone }) => {
  const { signInWithGoogle, continueAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle();
      onDone();
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        // user closed the window: nothing to show
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError('This website address is not authorized for sign-in yet. Add it in Firebase > Authentication > Settings > Authorized domains.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
      } else {
        setError(err?.message || 'Could not sign in with Google. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    continueAsGuest();
    onDone();
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white text-stone-900">
      {/* Brand panel */}
      <aside className="relative lg:w-[46%] overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 text-white px-6 py-8 sm:px-10 lg:px-14 lg:py-14 flex flex-col justify-between">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <div className="absolute -bottom-28 -left-16 w-80 h-80 rounded-full bg-pink-300/20 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center p-2 backdrop-blur-sm">
            <Logo className="w-full h-full text-white" />
          </div>
          <span className="text-xl font-extrabold tracking-tight">MakeTransfer</span>
        </div>

        <div className="relative my-8 lg:my-0 space-y-6 max-w-md">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.1]">
            Share anything.<br />Instantly.
          </h1>
          <p className="text-sm sm:text-base text-white/80 leading-relaxed">
            Send documents, photos and whole folders with a clean link. No fuss, no attachments.
          </p>
          <ul className="hidden sm:block space-y-4 pt-2">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start space-x-3">
                <span className="mt-0.5 w-8 h-8 shrink-0 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-xs text-white/75 leading-relaxed">{desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative hidden lg:block text-xs text-white/60">Part of the Make family of tools.</p>
      </aside>

      {/* Sign-in panel */}
      <main className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10 bg-stone-50">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-stone-900">Welcome back</h2>
            <p className="text-sm text-stone-500 mt-1.5">Sign in to save and manage your shared links.</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs leading-relaxed">
              {error}
            </div>
          )}

          <button
            id="btn-login-google"
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full inline-flex items-center justify-center space-x-3 px-4 py-3.5 bg-white border border-stone-300 hover:border-stone-400 hover:shadow-md text-stone-800 rounded-xl font-bold text-sm shadow-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-stone-600" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <div className="flex items-center my-5" aria-hidden="true">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="px-3 text-[11px] uppercase tracking-wider font-semibold text-stone-400">or</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>

          <button
            id="btn-continue-guest"
            type="button"
            onClick={handleGuest}
            disabled={loading}
            className="w-full inline-flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-60"
          >
            <span>Continue as guest</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-stone-500 text-center mt-3 leading-relaxed">
            Guests can share files right away. Your history stays in this browser only.
          </p>

          <div className="mt-8 pt-6 border-t border-stone-200 flex items-center justify-center space-x-1.5 text-[11px] text-stone-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>We only use your Google account to sign you in.</span>
          </div>
        </div>
      </main>
    </div>
  );
};
