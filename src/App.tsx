import { useState, useMemo, useEffect, useCallback } from 'react';
import { useExpenseStore } from './store/useExpenseStore';
import { supabase } from './lib/supabase';
import type { PaymentMode, ExpenseCategory } from './types/expense';
import { PLACES, CATEGORIES } from './constants/taxonomy';
import type { TabId, ToastItem } from './constants/taxonomy';
import { triggerHaptic } from './utils/feedback';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ToastStack } from './components/ToastStack';
import { OverviewTab } from './components/OverviewTab';
import { QuickEntryTab } from './components/QuickEntryTab';
import { StatementImporterTab } from './components/StatementImporterTab';
import { LedgerTab } from './components/LedgerTab';
import { AutomationTab } from './components/AutomationTab';
import { ProfileTab } from './components/ProfileTab';
import { X, Check, LogIn } from 'lucide-react';

interface PendingCapture {
  price: number;
  rawPayee: string;
  name: string;
  place: string;
  cat: ExpenseCategory;
  mode: PaymentMode;
}

const QUICK_ITEM_CHIPS = [
  'Yoghurt',
  'Lassi',
  'Chaach',
  'Paneer Bhurji',
  'Vendi Chips',
  'Maggi',
  'Chili Potato',
  'Burger',
  'Choco Lava',
  'Printout',
];



export default function App() {
  const {
    currentUser,
    transactions,
    presets,
    openingBalance,
    syncState,
    setCurrentUser,
    initRealtimeSync,
    addTransaction,
    upsertAlias,
    matchPayeeToAlias,
  } = useExpenseStore();

  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [drilldown, setDrilldown] = useState<{
    place?: string;
    category?: string;
    date?: string;
  } | null>(null);

  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);

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

  // Supabase Google Auth Listener
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          email: session.user.email || '',
          name:
            session.user.user_metadata?.full_name ||
            session.user.email?.split('@')[0] ||
            'User',
          avatarUrl: session.user.user_metadata?.avatar_url,
        });
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          email: session.user.email || '',
          name:
            session.user.user_metadata?.full_name ||
            session.user.email?.split('@')[0] ||
            'User',
          avatarUrl: session.user.user_metadata?.avatar_url,
        });
      } else {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [setCurrentUser]);

  // Start Real-time DB Sync for the Logged-In User
  useEffect(() => {
    if (!currentUser) return;
    const cleanup = initRealtimeSync(currentUser.id, currentUser.email);
    return cleanup;
  }, [currentUser, initRealtimeSync]);

  const parseRawNotificationIntoModal = useCallback(
    (rawText: string, modeOverride?: PaymentMode) => {
      const amtMatch = rawText.match(/(?:₹|Rs\.?|INR)\s*(\d+(?:\.\d{1,2})?)/i);
      const price = amtMatch ? parseFloat(amtMatch[1]) : 0;

      const payeeMatch = rawText.match(
        /(?:Paid.*?to|at)\s+([A-Za-z0-9\s.&_-]{2,30}?)(?:\s+on|\s+via|\s+UPI|\.|$)/i
      );
      const rawPayee = (payeeMatch ? payeeMatch[1] : rawText.slice(0, 28))
        .trim()
        .toUpperCase();

      const mode: PaymentMode =
        modeOverride || (/\bSU\b|SU QR/i.test(rawText) ? 'SU' : 'UPI');
      const matched = matchPayeeToAlias(rawPayee, rawText, 'DEBIT');

      setPendingCapture({
        price: price || 30,
        rawPayee,
        name: matched.place !== 'Other' ? matched.place : rawPayee,
        place: matched.place,
        cat: matched.cat,
        mode,
      });
      triggerHaptic('medium');
    },
    [matchPayeeToAlias]
  );

  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('raw');
    const amt = parseFloat(params.get('amt') || '0');
    const merchant = params.get('merchant');
    const mode = (params.get('mode') as PaymentMode) || 'UPI';

    if (raw) {
      parseRawNotificationIntoModal(raw, mode);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (amt > 0 && merchant) {
      const matched = matchPayeeToAlias(merchant, '', 'DEBIT');
      setPendingCapture({
        price: amt,
        rawPayee: merchant.toUpperCase(),
        name: matched.place !== 'Other' ? matched.place : merchant,
        place: matched.place,
        cat: matched.cat,
        mode,
      });
      triggerHaptic('medium');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [currentUser, matchPayeeToAlias, parseRawNotificationIntoModal]);

  const liquidBalance = useMemo(() => {
    const credits = transactions
      .filter((t) => t.txType === 'CREDIT')
      .reduce((s, t) => s + t.price, 0);
    const oopDebits = transactions
      .filter((t) => t.txType === 'DEBIT' && ['UPI', 'Cash', 'Card'].includes(t.mode))
      .reduce((s, t) => s + t.price, 0);
    return openingBalance + credits - oopDebits;
  }, [transactions, openingBalance]);

  const handleGoogleSignIn = async () => {
    if (!supabase) return;
    triggerHaptic('medium');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      notify('Sign-in error', error.message, 'error');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-400 flex items-center justify-center text-xs font-mono">
        INITIALIZING Xpensa SESSION...
      </div>
    );
  }

  // Multi-User Google Login Screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-4">
        <div className="max-w-sm w-full border border-zinc-800 bg-zinc-900/40 rounded-2xl p-6 space-y-6 text-center shadow-2xl">
          <div className="flex flex-col items-center gap-3">
            <img
              src="/pwa-192x192.png"
              alt="Xpensa"
              className="w-12 h-12 rounded-xl border border-zinc-700"
            />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
                Xpensa
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                Campus Expense, SU Credit & Group Split Analytics
              </p>
            </div>
          </div>

          <div className="space-y-2 text-left bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 text-[11px] text-zinc-400 font-mono">
            <div>• Isolated cloud ledger per Google account</div>
            <div>• Customizable 1-tap campus presets</div>
            <div>• De-inflated group split & true spend analytics</div>
            <div>• Bank statement & Android GPay auto-capture</div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="w-full inline-flex items-center justify-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs py-2.5 px-4 rounded-lg transition cursor-pointer"
          >
            <LogIn className="w-4 h-4" /> Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#09090b] text-zinc-100 antialiased selection:bg-zinc-800 pb-24 md:pb-12">
      <Header
        activeTab={activeTab}
        onSelectTab={(tab) => {
          triggerHaptic('light');
          setActiveTab(tab);
        }}
        txCount={transactions.length}
        syncState={syncState}
        liquidBalance={liquidBalance}
      />

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 w-full overflow-hidden">
        {activeTab === 'overview' && (
          <OverviewTab
            notify={notify}
            onDrillDown={(opts) => {
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

        {activeTab === 'auto' && (
          <AutomationTab
            notify={notify}
            onSimulateRawNotification={parseRawNotificationIntoModal}
          />
        )}

        {activeTab === 'profile' && <ProfileTab notify={notify} />}
      </main>

      {/* 1-Tap Android Auto-Capture Confirmation Bottom Sheet */}
      {pendingCapture && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-3">
          <div className="animate-toast bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-4 space-y-3.5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-2.5">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                  Android Payment Detected · {pendingCapture.mode}
                </span>
                <h3 className="text-sm font-semibold text-zinc-100">Confirm & Tag Expense</h3>
              </div>
              <button
                onClick={() => setPendingCapture(null)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-mono text-zinc-400 uppercase">Amount (₹)</label>
                <input
                  type="number"
                  value={pendingCapture.price}
                  onChange={(e) =>
                    setPendingCapture({
                      ...pendingCapture,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-sm font-mono font-semibold text-zinc-100 mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-zinc-400 uppercase">Campus Spot</label>
                <select
                  value={pendingCapture.place}
                  onChange={(e) =>
                    setPendingCapture({ ...pendingCapture, place: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 mt-0.5"
                >
                  {PLACES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-zinc-400 uppercase">
                Description (Or tap one of your custom presets)
              </label>
              <input
                type="text"
                value={pendingCapture.name}
                onChange={(e) =>
                  setPendingCapture({ ...pendingCapture, name: e.target.value })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 mt-0.5"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPendingCapture({
                        ...pendingCapture,
                        name: p.name,
                        place: p.place,
                        cat: p.cat,
                      });
                    }}
                    className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px]"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <select
                value={pendingCapture.cat}
                onChange={(e) =>
                  setPendingCapture({
                    ...pendingCapture,
                    cat: e.target.value as ExpenseCategory,
                  })
                }
                className="bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-300"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  triggerHaptic('success');
                  if (pendingCapture.rawPayee && pendingCapture.place !== 'Other') {
                    upsertAlias({
                      key: pendingCapture.rawPayee,
                      place: pendingCapture.place,
                      cat: pendingCapture.cat,
                      subcat: pendingCapture.place,
                      txType: 'DEBIT',
                    });
                  }
                  addTransaction({
                    date: new Date().toISOString().slice(0, 10),
                    name: pendingCapture.name,
                    rawPayee: pendingCapture.rawPayee,
                    price: pendingCapture.price,
                    myShare: pendingCapture.price,
                    splitCount: 1,
                    txType: 'DEBIT',
                    mode: pendingCapture.mode,
                    cat: pendingCapture.cat,
                    subcat: pendingCapture.place,
                    place: pendingCapture.place,
                    indiv: 'Solo',
                    note: 'Android Auto-Capture',
                    status: 'completed',
                  });
                  notify(
                    `Logged ₹${pendingCapture.price} · ${pendingCapture.name}`,
                    `${pendingCapture.place} via ${pendingCapture.mode}`,
                    'success'
                  );
                  setPendingCapture(null);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-zinc-100 text-zinc-950 hover:bg-white py-2 rounded-md text-xs font-semibold"
              >
                <Check className="w-4 h-4" /> Save & Remember Payee
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => {
          triggerHaptic('light');
          setActiveTab(tab);
        }}
      />
    </div>
  );
}