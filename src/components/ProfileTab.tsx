import { LogOut, RefreshCw, Download, Database, ShieldCheck, UserCheck } from 'lucide-react';
import { useExpenseStore } from '../store/useExpenseStore';
import { supabase } from '../lib/supabase';
import { exportTransactionsToCSV, triggerHaptic } from '../utils/feedback';
import { fmt } from '../constants/taxonomy';
import type { NotifyFn } from '../constants/taxonomy';

interface ProfileTabProps {
  notify: NotifyFn;
}

export function ProfileTab({ notify }: ProfileTabProps) {
  const {
    currentUser,
    transactions,
    presets,
    aliases,
    openingBalance,
    syncState,
    lastSyncedAt,
    setOpeningBalance,
    syncNowToCloud,
    migrateLegacyData,
  } = useExpenseStore();

  const handleSignOut = async () => {
    triggerHaptic('warning');
    if (supabase) {
      await supabase.auth.signOut();
    }
    notify('Signed out', 'Session closed safely', 'info');
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-5 animate-pane max-w-3xl mx-auto">
      {/* User Identity Card */}
      <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {currentUser.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.name}
              className="w-14 h-14 rounded-full border border-zinc-700 object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-semibold text-zinc-200">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-100">{currentUser.name}</h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3" /> Google Verified
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">{currentUser.email}</p>
            <p className="text-[10px] text-zinc-600 font-mono mt-0.5">UID: {currentUser.id}</p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-red-950/50 text-zinc-300 hover:text-red-300 border border-zinc-800 hover:border-red-800/60 px-3.5 py-2 rounded-lg text-xs font-medium transition"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign Out
        </button>
      </div>

      {/* Account Stats & Cloud Sync Health */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-zinc-800 rounded-lg p-3.5 bg-zinc-900/20">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Cloud Status</div>
          <div className="text-sm font-mono font-semibold text-emerald-400 mt-1 uppercase">
            {syncState}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
            {lastSyncedAt || 'Synced'}
          </div>
        </div>

        <div className="border border-zinc-800 rounded-lg p-3.5 bg-zinc-900/20">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Transactions</div>
          <div className="text-lg font-mono font-semibold text-zinc-100 mt-0.5">
            {transactions.length}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono">Isolated to your UID</div>
        </div>

        <div className="border border-zinc-800 rounded-lg p-3.5 bg-zinc-900/20">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Custom Presets</div>
          <div className="text-lg font-mono font-semibold text-zinc-100 mt-0.5">
            {presets.length}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono">Synced in Quick Log</div>
        </div>

        <div className="border border-zinc-800 rounded-lg p-3.5 bg-zinc-900/20">
          <div className="text-[10px] font-mono uppercase text-zinc-500">Merchant Rules</div>
          <div className="text-lg font-mono font-semibold text-zinc-100 mt-0.5">
            {aliases.length}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono">Auto-mapped payees</div>
        </div>
      </div>

      {/* Personal Wallet Configuration */}
      <div className="border border-zinc-800 rounded-xl p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 border-b border-zinc-800 pb-2">
          Personal Ledger Settings & Cloud Actions
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-zinc-200">Semester Opening Bank Balance</div>
            <div className="text-[11px] text-zinc-500">
              Base balance before calculating inflows and out-of-pocket debits
            </div>
          </div>
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-xs text-zinc-400">₹</span>
            <input
              type="number"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
              onBlur={() =>
                notify('Opening balance updated', `Saved ₹${fmt(openingBalance)} to DB`, 'success')
              }
              className="w-28 bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-100 text-right"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap gap-2.5">
          <button
            onClick={async () => {
              triggerHaptic('medium');
              await syncNowToCloud();
              notify('Cloud Sync Complete', 'All transactions & presets pushed to Supabase', 'success');
            }}
            className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-950 hover:bg-white px-3.5 py-2 rounded-md text-xs font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Force Sync Now
          </button>

          <button
            onClick={() => {
              exportTransactionsToCSV(transactions);
              notify('CSV Downloaded', `${transactions.length} rows exported`, 'info');
            }}
            className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 px-3.5 py-2 rounded-md text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Export Backup CSV
          </button>

          <button
            onClick={async () => {
              triggerHaptic('medium');
              const ok = await migrateLegacyData();
              if (ok) {
                notify(
                  'Legacy Data Migrated!',
                  'Imported your 290 earlier transactions into this Google account',
                  'success'
                );
              } else {
                notify('No legacy data found', 'Could not find row aditya_main', 'error');
              }
            }}
            className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 px-3.5 py-2 rounded-md text-xs font-medium"
          >
            <Database className="w-3.5 h-3.5" /> Import Legacy Prototype Data
          </button>
        </div>
      </div>
    </div>
  );
}