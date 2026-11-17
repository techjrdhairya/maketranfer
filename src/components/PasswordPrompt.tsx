import React, { useState } from 'react';
import { Lock, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { verifyDocumentPassword } from '../lib/api';
import { DocumentMetadata } from '../types';

interface PasswordPromptProps {
  slug: string;
  filename: string;
  onUnlocked: (token: string, doc: DocumentMetadata) => void;
}

export const PasswordPrompt: React.FC<PasswordPromptProps> = ({ slug, filename, onUnlocked }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await verifyDocumentPassword(slug, password);
      if (res.success) {
        onUnlocked(res.token, res.document);
      }
    } catch (err: any) {
      setError(err.message || 'Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-8 bg-white border border-stone-200/80 rounded-2xl shadow-sm text-center">
      <div className="w-16 h-16 bg-amber-50 border border-amber-200/60 rounded-2xl flex items-center justify-center mx-auto mb-5 text-amber-600 shadow-2xs">
        <Lock className="w-8 h-8" />
      </div>

      <h2 className="text-xl font-bold text-stone-900 mb-2">Password Protected Document</h2>
      <p className="text-sm text-stone-500 mb-6 truncate font-mono">
        {filename}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter document password"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 transition-all"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 font-medium bg-red-50 py-2 px-3 rounded-lg border border-red-200/60">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white rounded-xl font-semibold text-sm transition-all shadow-xs"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Unlock & View Document</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
