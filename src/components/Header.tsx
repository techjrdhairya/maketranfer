import React, { useState, useEffect, useRef } from 'react';
import { navigateToSignIn, navigateToDevices } from '../lib/nav';
import { useDevices } from '../context/DeviceContext';
import {
  FileUp,
  FolderLock,
  Search,
  ArrowRight,
  Sparkles,
  Files,
  X,
  User as UserIcon,
  LogOut,
  Cloud,
  ChevronDown,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { Logo } from './Logo';
import { getMyUploads } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { DeviceAccessModal } from './DeviceAccessModal';

interface HeaderProps {
  onGoHome: () => void;
  onOpenMyDocuments: () => void;
  onNavigateToSlug: (slug: string) => void;
  currentSlug?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  onGoHome,
  onOpenMyDocuments,
  onNavigateToSlug,
  currentSlug,
}) => {
  const { user, isGuest, signOutUser } = useAuth();
  const [searchSlug, setSearchSlug] = useState('');
  const [uploadsCount, setUploadsCount] = useState(0);
  const { pendingCount } = useDevices();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateCount = () => {
      const items = getMyUploads();
      setUploadsCount(items.length);
    };
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
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isMobileSearchOpen && mobileInputRef.current) {
      mobileInputRef.current.focus();
    }
  }, [isMobileSearchOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchSlug.trim();
    if (!raw) return;

    // Extract slug if full URL was pasted
    let slug = raw;
    if (slug.includes('/d/')) {
      slug = slug.split('/d/')[1].split('?')[0];
    } else if (slug.startsWith('d/')) {
      slug = slug.slice(2);
    }
    slug = slug.replace(/^\/+|\/+$/g, '');
    if (slug) {
      onNavigateToSlug(slug);
      setSearchSlug('');
      setIsMobileSearchOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-200/80">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <button
            id="btn-header-home"
            onClick={onGoHome}
            className="flex items-center space-x-2 sm:space-x-2.5 group text-left cursor-pointer focus:outline-none"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform p-1.5">
              <Logo className="w-full h-full text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-1 sm:space-x-1.5">
                <span className="font-extrabold text-base sm:text-lg text-stone-900 tracking-tight">MakeTransfer</span>
                <span className="text-[9px] sm:text-[10px] uppercase font-bold px-1.5 py-0.2 bg-stone-100 text-stone-600 rounded border border-stone-200">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-stone-400 font-medium leading-none hidden sm:block">
                Frictionless Document Publishing
              </p>
            </div>
          </button>

        </div>

        {/* Desktop Search Slug or Quick URL input */}
        <div className="hidden md:flex items-center flex-1 max-w-xs mx-4">
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              id="input-desktop-search"
              type="text"
              value={searchSlug}
              onChange={(e) => setSearchSlug(e.target.value)}
              placeholder="Paste MakeTransfer link or ID..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none focus:bg-white focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all font-mono"
            />
            {searchSlug.trim() && (
              <button
                id="btn-desktop-search-submit"
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-900 transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5">
          {/* Mobile Search Toggle Button */}
          <button
            id="btn-mobile-search-toggle"
            onClick={() => setIsMobileSearchOpen((prev) => !prev)}
            aria-label="Search documents"
            className={`md:hidden flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${
              isMobileSearchOpen
                ? 'bg-indigo-600 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200/80'
            }`}
          >
            {isMobileSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>

          {/* Desktop & Cross-Device Access Button */}
          <button
            id="btn-header-device-access"
            onClick={() => setIsDeviceModalOpen(true)}
            title="Connect from desktop CPU, monitor, ethernet, or phone"
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-stone-700 hover:text-stone-950 bg-stone-100 hover:bg-stone-200/80 rounded-xl transition-colors cursor-pointer"
          >
            <Monitor className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="hidden lg:inline">Desktop / Devices</span>
          </button>

          {/* My Uploads Button */}
          <button
            id="btn-header-my-documents"
            onClick={onOpenMyDocuments}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-stone-700 hover:text-stone-950 bg-stone-100 hover:bg-stone-200/80 rounded-xl transition-colors relative cursor-pointer"
          >
            <Files className="w-4 h-4 text-stone-500" />
            <span className="hidden sm:inline">My Uploads</span>
            {uploadsCount > 0 && (
              <span className="w-4 h-4 bg-indigo-600 text-white rounded-full text-[10px] flex items-center justify-center font-mono font-bold">
                {uploadsCount}
              </span>
            )}
          </button>

          {/* Devices: send / receive with a device ID */}
          <button
            id="btn-header-devices"
            type="button"
            onClick={() => navigateToDevices()}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-stone-700 hover:text-stone-950 bg-stone-100 hover:bg-stone-200/80 rounded-xl transition-colors relative cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-stone-500" />
            <span className="hidden sm:inline">Devices</span>
            {pendingCount > 0 && (
              <span className="min-w-4 h-4 px-1 bg-pink-600 text-white rounded-full text-[10px] flex items-center justify-center font-mono font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Upload New CTA */}
          <button
            id="btn-header-upload"
            onClick={onGoHome}
            className="hidden xs:flex items-center space-x-1.5 px-3 sm:px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            <span>Upload</span>
          </button>

          {/* Auth State Button / Dropdown */}
          <div className="relative" ref={userMenuRef}>
            {user ? (
              <div>
                <button
                  id="btn-user-profile-menu"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  className="flex items-center space-x-1.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-stone-200 hover:border-stone-300 bg-stone-50 hover:bg-white transition-all cursor-pointer"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Google User'}
                      className="w-6 h-6 rounded-full ring-1 ring-stone-200 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-bold text-stone-800 hidden md:inline max-w-[100px] truncate">
                    {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
                  </span>
                  <ChevronDown className="w-3 h-3 text-stone-400 hidden sm:inline" />
                </button>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-stone-200 py-2 z-50 animate-in fade-in zoom-in-95">
                    <div className="px-4 py-2 border-b border-stone-100">
                      <p className="text-xs font-bold text-stone-900 truncate">
                        {user.displayName || 'Google User'}
                      </p>
                      <p className="text-[11px] text-stone-500 truncate">{user.email}</p>
                      <div className="mt-1.5 inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <Cloud className="w-3 h-3" />
                        <span>Cloud Synced Account</span>
                      </div>
                    </div>

                    <div className="p-1">
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenMyDocuments();
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-stone-700 hover:bg-stone-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <Files className="w-3.5 h-3.5 text-stone-400" />
                        <span>My Uploaded Documents ({uploadsCount})</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          signOutUser();
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5 text-red-500" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                id="btn-header-signin"
                onClick={navigateToSignIn}
                className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-stone-800 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl shadow-2xs hover:border-stone-400 transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
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
                <span className="hidden sm:inline">Sign In</span>
                <span className="sm:hidden">Login</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Search Expandable Bar */}
      {isMobileSearchOpen && (
        <div className="md:hidden px-3.5 py-2.5 bg-stone-50/95 border-t border-stone-200 animate-in fade-in slide-in-from-top-2 duration-150">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center w-full gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                ref={mobileInputRef}
                id="input-mobile-search"
                type="text"
                value={searchSlug}
                onChange={(e) => setSearchSlug(e.target.value)}
                placeholder="Paste link, ID, or slug..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500 font-mono shadow-xs"
              />
              {searchSlug.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchSlug('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              id="btn-mobile-search-go"
              type="submit"
              disabled={!searchSlug.trim()}
              className="px-3 py-2 bg-indigo-600 disabled:bg-stone-300 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-all"
            >
              <span>Go</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Cross-device / Desktop PC Access Modal */}
      <DeviceAccessModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        documentSlug={currentSlug}
      />
    </header>
  );
};
