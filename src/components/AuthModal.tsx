import React, { useState } from 'react';
import { Sparkles, User, ShieldCheck, ArrowRight, Loader2, X, Cloud, Lock, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';

export const AuthModal: React.FC = () => {
  const { showAuthModal, setShowAuthModal, signInWithGoogle, continueAsGuest, user, isGuest } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!showAuthModal) return null;

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    continueAsGuest();
  };

  const canDismiss = user !== null || isGuest;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Dismiss button if user is already logged in or was a guest */}
        {canDismiss && (
          <button
            id="btn-close-auth-modal"
            onClick={() => setShowAuthModal(false)}
            className="absolute top-5 right-5 p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header Header */}
        <div className="p-8 pb-6 text-center border-b border-stone-100 bg-stone-50/50">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 text-white p-2.5 shadow-md mb-4">
            <Logo className="w-full h-full text-white" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-stone-900">
            Welcome to MakeTransfer
          </h2>
          <p className="text-sm text-stone-500 mt-1.5 max-w-sm mx-auto">
            Share any document, PDF, code, or folder bundle instantly with secure links.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
            <span className="font-semibold">Sign in notice:</span> {error}
          </div>
        )}

        {/* Options */}
        <div className="p-6 sm:p-8 space-y-4">
          
          {/* Option 1: Continue with Google (Primary / Recommended) */}
          <div className="relative border-2 border-indigo-600 bg-indigo-600/2 rounded-2xl p-5 hover:bg-indigo-600/4 transition-all">
            <div className="absolute -top-3 right-4 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-2xs flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Recommended</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-900 flex items-center space-x-2">
                    <span>Continue with Google</span>
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Saves all your uploads to your Google account & syncs across all devices.
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 text-xs text-stone-600">
                <li className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Permanent cloud document catalog</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Access and manage your links from any phone or PC</span>
                </li>
              </ul>

              <button
                id="btn-login-google"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full mt-2 inline-flex items-center justify-center space-x-3 px-4 py-3 bg-white border border-stone-300 hover:border-stone-400 text-stone-800 rounded-xl font-bold text-sm shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-stone-600" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    {/* Google Colored Icon */}
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Option 2: Guest Mode */}
          <div className="border border-stone-200 bg-stone-50/70 hover:bg-stone-50 rounded-2xl p-5 transition-all">
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center space-x-2">
                  <User className="w-4 h-4 text-stone-500" />
                  <span>Guest Mode</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Instant frictionless sharing. No login required.
                </p>
              </div>

              <p className="text-xs text-stone-500 leading-relaxed">
                Upload files right away. Upload history is preserved on this browser.
              </p>

              <button
                id="btn-continue-guest"
                type="button"
                onClick={handleGuest}
                disabled={loading}
                className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                <span>Continue as Guest</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

        {/* Footer info */}
        <div className="px-8 py-3.5 bg-stone-100/60 border-t border-stone-200/80 text-center">
          <p className="text-[11px] text-stone-500">
            You can switch between Guest and Google Account anytime from the top bar.
          </p>
        </div>

      </div>
    </div>
  );
};
