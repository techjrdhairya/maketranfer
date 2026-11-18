import React, { useEffect, useState } from 'react';
import { FileUp, Files, Smartphone } from 'lucide-react';
import type { NavSection } from './Header';
import { getMyUploads } from '../lib/api';
import { useDevices } from '../context/DeviceContext';

interface MobileNavProps {
  active: NavSection;
  onHome: () => void;
  onDocuments: () => void;
  onDevices: () => void;
}

// Bottom tab bar for phones: the three main places in the app within thumb reach.
export const MobileNav: React.FC<MobileNavProps> = ({ active, onHome, onDocuments, onDevices }) => {
  const { pendingCount: devicesBadge } = useDevices();
  const [documentsCount, setDocumentsCount] = useState(0);
  useEffect(() => {
    const update = () => setDocumentsCount(getMyUploads().length);
    update();
    window.addEventListener('storage', update);
    window.addEventListener('maketransfer:uploads_updated', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('maketransfer:uploads_updated', update);
    };
  }, []);

  const tabs: Array<{ key: Exclude<NavSection, null>; label: string; icon: React.ElementType; onClick: () => void; badge?: number; badgeCls: string }> = [
    { key: 'home', label: 'Upload', icon: FileUp, onClick: onHome, badgeCls: '' },
    { key: 'documents', label: 'Documents', icon: Files, onClick: onDocuments, badge: documentsCount, badgeCls: 'bg-indigo-600' },
    { key: 'devices', label: 'Devices', icon: Smartphone, onClick: onDevices, badge: devicesBadge, badgeCls: 'bg-pink-600' },
  ];

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-stone-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-3 max-w-md mx-auto">
        {tabs.map(({ key, label, icon: Icon, onClick, badge, badgeCls }) => {
          const isActive = active === key;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={onClick}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${isActive ? 'text-indigo-600' : 'text-stone-500 active:text-stone-800'}`}
              >
                <span className={`relative flex items-center justify-center w-12 h-7 rounded-full transition-colors ${isActive ? 'bg-indigo-50' : ''}`}>
                  <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                  {!!badge && badge > 0 && (
                    <span className={`absolute -top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${badgeCls}`}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
