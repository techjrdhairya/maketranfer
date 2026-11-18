import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, X, LogOut, Cloud, ChevronDown, Files, FileUp, Smartphone } from 'lucide-react';
import { Logo } from './Logo';
import { getMyUploads } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useDevices } from '../context/DeviceContext';
import { navigateToSignIn, navigateToDevices } from '../lib/nav';

export type NavSection = 'home' | 'documents' | 'devices' | null;

interface HeaderProps {
  onGoHome: () => void;
  onOpenMyDocuments: () => void;
  onNavigateToSlug: (slug: string) => void;
  currentSlug?: string | null;
  active?: NavSection;
}

const GoogleG = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({ onGoHome, onOpenMyDocuments, onNavigateToSlug, active = null }) => {
  const { user, signOutUser } = useAuth();
  const { pendingCount } = useDevices();
  const [searchSlug, setSearchSlug] = useState('');
  const [uploadsCount, setUploadsCount] = useState(0);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateCount = () => setUploadsCount(getMyUploads().length);
    updateCount();
    window.addEventListener('storage', updateCount);
    window.addEventListener('maketransfer:uploads_updated', updateCount);
    window.addEventListener('docshare:uploads_updated', updateCount);
    return () => {
      window.removeEventListener('storage', updateCount);
      window.removeEventListener('maketransfer:uploads_updated', updateCount);
      window.removeEventListener('docshare:uploads_updated', updateCount);
    };
  }, []);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setIsUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (isMobileSearchOpen) mobileInputRef.current?.focus();
  }, [isMobileSearchOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchSlug.trim();
    if (!raw) return;
    let slug = raw;
    if (slug.includes('/d/')) slug = slug.split('/d/')[1].split('?')[0];
    else if (slug.startsWith('d/')) slug = slug.slice(2);
    slug = slug.replace(/^\/+|\/+$/g, '');
    if (slug) {
      onNavigateToSlug(slug);
      setSearchSlug('');
      setIsMobileSearchOpen(false);
    }
  };

  const navBtn = (isActive: boolean) =>
    `relative inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-stone-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center gap-3 sm:gap-4">
        {/* Brand */}
        <button id="btn-header-home" onClick={onGoHome} className="flex items-center space-x-2.5 group text-left cursor-pointer focus:outline-none shrink-0">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform p-1.5">
            <Logo className="w-full h-full text-white" />
          </span>
          <span className="leading-tight">
            <span className="block font-extrabold text-[17px] text-stone-900 tracking-tight">MakeTransfer</span>
            <span className="hidden lg:block text-[11px] text-stone-400 font-medium">Share files with a link or a device ID</span>
          </span>
        </button>

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-1 ml-2" aria-label="Main">
          <button id="btn-nav-upload" onClick={onGoHome} className={navBtn(active === 'home')}>
            <FileUp className="w-4 h-4" />
            <span>Upload</span>
          </button>
          <button id="btn-header-my-documents" onClick={onOpenMyDocuments} className={navBtn(active === 'documents')}>
            <Files className="w-4 h-4" />
            <span>My Documents</span>
            {uploadsCount > 0 && <span className="min-w-[18px] h-[18px] px-1 bg-indigo-600 text-white rounded-full text-[10px] flex items-center justify-center font-bold">{uploadsCount}</span>}
          </button>
          <button id="btn-header-devices" type="button" onClick={() => navigateToDevices()} className={navBtn(active === 'devices')}>
            <Smartphone className="w-4 h-4" />
            <span>Devices</span>
            {pendingCount > 0 && <span className="min-w-[18px] h-[18px] px-1 bg-pink-600 text-white rounded-full text-[10px] flex items-center justify-center font-bold">{pendingCount}</span>}
          </button>
        </nav>

        <div className="flex-1" />

        {/* Desktop search */}
        <form onSubmit={handleSearchSubmit} className="hidden md:block relative w-full max-w-[16rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            id="input-desktop-search"
            type="text"
            value={searchSlug}
            onChange={(e) => setSearchSlug(e.target.value)}
            placeholder="Paste a link or ID…"
            className="w-full pl-9 pr-9 py-2 text-xs bg-stone-100/80 border border-transparent rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/15 transition-all font-mono"
          />
          {searchSlug.trim() && (
            <button id="btn-desktop-search-submit" type="submit" aria-label="Open" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-indigo-600">
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* Mobile search toggle */}
        <button
          id="btn-mobile-search-toggle"
          onClick={() => setIsMobileSearchOpen((v) => !v)}
          aria-label="Search by link or ID"
          className={`md:hidden flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${isMobileSearchOpen ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200/80'}`}
        >
          {isMobileSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>

        {/* Account */}
        <div className="relative shrink-0" ref={userMenuRef}>
          {user ? (
            <>
              <button
                id="btn-user-profile-menu"
                onClick={() => setIsUserMenuOpen((v) => !v)}
                className="flex items-center space-x-1.5 p-0.5 pr-1 sm:pr-2 rounded-full border border-stone-200 hover:border-stone-300 bg-white transition-all cursor-pointer"
                aria-label="Account menu"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'Account'} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-xs font-bold flex items-center justify-center">
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-stone-400 hidden sm:block" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-stone-200 py-2 z-50">
                  <div className="px-4 py-2.5 border-b border-stone-100">
                    <p className="text-sm font-bold text-stone-900 truncate">{user.displayName || 'Google user'}</p>
                    <p className="text-xs text-stone-500 truncate">{user.email}</p>
                    <span className="mt-2 inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <Cloud className="w-3 h-3" />
                      <span>Synced to your account</span>
                    </span>
                  </div>
                  <div className="p-1.5">
                    <button onClick={() => { setIsUserMenuOpen(false); onOpenMyDocuments(); }} className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-sm text-stone-700 hover:bg-stone-50 rounded-xl cursor-pointer">
                      <Files className="w-4 h-4 text-stone-400" />
                      <span>My Documents ({uploadsCount})</span>
                    </button>
                    <button onClick={() => { setIsUserMenuOpen(false); navigateToDevices(); }} className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-sm text-stone-700 hover:bg-stone-50 rounded-xl cursor-pointer">
                      <Smartphone className="w-4 h-4 text-stone-400" />
                      <span>Devices</span>
                    </button>
                    <button onClick={() => { setIsUserMenuOpen(false); signOutUser(); }} className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl cursor-pointer">
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <button
              id="btn-header-signin"
              onClick={navigateToSignIn}
              className="inline-flex items-center space-x-2 px-3 sm:px-4 py-2 text-xs font-bold text-stone-800 bg-white hover:bg-stone-50 border border-stone-300 hover:border-stone-400 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <GoogleG />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile search bar */}
      {isMobileSearchOpen && (
        <div className="md:hidden px-4 py-3 bg-stone-50/95 border-t border-stone-200">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                ref={mobileInputRef}
                id="input-mobile-search"
                type="text"
                value={searchSlug}
                onChange={(e) => setSearchSlug(e.target.value)}
                placeholder="Paste a link, ID or slug…"
                className="w-full pl-9 pr-8 py-2.5 text-sm bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 font-mono"
              />
              {searchSlug.trim() && (
                <button type="button" onClick={() => setSearchSlug('')} aria-label="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-0.5">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button id="btn-mobile-search-go" type="submit" disabled={!searchSlug.trim()} className="px-4 py-2.5 bg-indigo-600 disabled:bg-stone-300 text-white rounded-xl text-sm font-bold flex items-center gap-1.5">
              <span>Go</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </header>
  );
};
