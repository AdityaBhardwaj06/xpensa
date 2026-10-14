import React from 'react';
import type { TabId } from '../constants/taxonomy';
import { fmt } from '../constants/taxonomy';

interface HeaderProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  txCount: number;
  syncState: 'offline' | 'syncing' | 'live' | 'error';
  liquidBalance: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  txCount,
  syncState,
  liquidBalance,
}) => {
  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview & Analytics' },
    { id: 'log', label: 'Quick Entry' },
    { id: 'import', label: 'Statement Import' },
    { id: 'ledger', label: `Transactions (${txCount})` },
  ];

  return (
    <header className="border-b border-zinc-800/80 bg-[#09090b]/95 sticky top-0 z-30 backdrop-blur w-full">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-semibold tracking-tight text-sm text-zinc-100 shrink-0">
            LEDGER / BITS
          </span>

          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono shrink-0">
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-md">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                syncState === 'live'
                  ? 'bg-emerald-400'
                  : syncState === 'syncing'
                  ? 'bg-amber-400 animate-pulse'
                  : syncState === 'error'
                  ? 'bg-red-400'
                  : 'bg-zinc-600'
              }`}
            />
            <span className="text-[11px] text-zinc-300">
              {syncState === 'live' ? 'LIVE' : syncState.toUpperCase()}
            </span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md text-[11px]">
            <span className="text-zinc-500 mr-1 hidden sm:inline">BAL</span>
            <span
              className={
                liquidBalance < 0
                  ? 'text-red-400 font-semibold'
                  : 'text-zinc-100 font-semibold'
              }
            >
              ₹{fmt(liquidBalance)}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};