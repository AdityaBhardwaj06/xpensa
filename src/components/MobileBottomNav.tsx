import React from 'react';
import { LayoutDashboard, Zap, Upload, ReceiptText } from 'lucide-react';
import type { TabId } from '../constants/taxonomy';

interface MobileBottomNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 border-t border-zinc-800 backdrop-blur px-2 py-1.5 flex justify-around items-center">
      <button
        onClick={() => onSelectTab('overview')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-md transition ${
          activeTab === 'overview' ? 'text-zinc-100' : 'text-zinc-500'
        }`}
      >
        <LayoutDashboard className="w-4 h-4" />
        <span className="text-[10px] font-medium">Overview</span>
      </button>

      <button
        onClick={() => onSelectTab('log')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-md transition ${
          activeTab === 'log' ? 'text-zinc-100' : 'text-zinc-500'
        }`}
      >
        <Zap className="w-4 h-4" />
        <span className="text-[10px] font-medium">Quick Log</span>
      </button>

      <button
        onClick={() => onSelectTab('import')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-md transition ${
          activeTab === 'import' ? 'text-zinc-100' : 'text-zinc-500'
        }`}
      >
        <Upload className="w-4 h-4" />
        <span className="text-[10px] font-medium">Import</span>
      </button>

      <button
        onClick={() => onSelectTab('ledger')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-md transition ${
          activeTab === 'ledger' ? 'text-zinc-100' : 'text-zinc-500'
        }`}
      >
        <ReceiptText className="w-4 h-4" />
        <span className="text-[10px] font-medium">Ledger</span>
      </button>
    </nav>
  );
};