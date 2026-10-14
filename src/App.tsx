import { useState, useMemo, useEffect, useCallback } from 'react';
import { useExpenseStore } from './store/useExpenseStore';
import type { PaymentMode } from './types/expense';
import type { TabId, ToastItem } from './constants/taxonomy';
import { triggerHaptic } from './utils/feedback';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ToastStack } from './components/ToastStack';
import { OverviewTab } from './components/OverviewTab';
import { QuickEntryTab } from './components/QuickEntryTab';
import { StatementImporterTab } from './components/StatementImporterTab';
import { LedgerTab } from './components/LedgerTab';

export default function App() {
  const {
    transactions,
    openingBalance,
    syncState,
    initRealtimeSync,
    addTransaction,
    matchPayeeToAlias,
  } = useExpenseStore();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [drilldown, setDrilldown] = useState<{
    place?: string;
    category?: string;
    date?: string;
  } | null>(null);

  const notify = useCallback(
    (
      title: string,
      subtitle?: string,
      type: 'success' | 'info' | 'error' = 'success',
      undoAction?: () => void
    ) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      setToasts((prev) => [...prev.slice(-2), { id, title, subtitle, type, undoAction }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  useEffect(() => {
    const cleanup = initRealtimeSync();
    return cleanup;
  }, [initRealtimeSync]);

  // Android MacroDroid Deep-Link Handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const amt = parseFloat(params.get('amt') || '0');
    const merchant = params.get('merchant');
    const mode = (params.get('mode') as PaymentMode) || 'UPI';
    if (amt > 0 && merchant) {
      const matched = matchPayeeToAlias(merchant, '', 'DEBIT');
      addTransaction({
        date: new Date().toISOString().slice(0, 10),
        name: matched.place !== 'Other' ? `${matched.place} · ${merchant}` : merchant,
        rawPayee: merchant.toUpperCase(),
        price: amt,
        txType: 'DEBIT',
        mode,
        cat: matched.cat,
        subcat: matched.subcat,
        place: matched.place,
        indiv: 'Solo',
        note: 'Auto-capture',
        status: 'completed',
      });
      triggerHaptic('success');
      notify(`Auto-logged ₹${amt}`, `${matched.place} via ${mode}`, 'success');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [addTransaction, matchPayeeToAlias, notify]);

  const liquidBalance = useMemo(() => {
    const credits = transactions
      .filter((t) => t.txType === 'CREDIT')
      .reduce((s, t) => s + t.price, 0);
    const oopDebits = transactions
      .filter((t) => t.txType === 'DEBIT' && ['UPI', 'Cash', 'Card'].includes(t.mode))
      .reduce((s, t) => s + t.price, 0);
    return openingBalance + credits - oopDebits;
  }, [transactions, openingBalance]);

  const handleSelectTab = (tab: TabId) => {
    triggerHaptic('light');
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#09090b] text-zinc-100 antialiased selection:bg-zinc-800 pb-24 md:pb-12">
      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        txCount={transactions.length}
        syncState={syncState}
        liquidBalance={liquidBalance}
      />

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 w-full overflow-hidden">
        {activeTab === 'overview' && (
          <OverviewTab
            notify={notify}
            onDrillDown={(opts: { place?: string; category?: string; date?: string }) => {
              setDrilldown(opts);
              setActiveTab('ledger');
            }}
          />
        )}

        {activeTab === 'log' && <QuickEntryTab notify={notify} />}

        {activeTab === 'import' && (
          <StatementImporterTab
            notify={notify}
            onImportSuccess={() => setActiveTab('overview')}
          />
        )}

        {activeTab === 'ledger' && (
          <LedgerTab
            notify={notify}
            initialDrilldown={drilldown}
            onClearDrilldown={() => setDrilldown(null)}
          />
        )}
      </main>

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <MobileBottomNav activeTab={activeTab} onSelectTab={handleSelectTab} />
    </div>
  );
}