import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useExpenseStore } from './store/useExpenseStore';
import type {
  PaymentMode,
  ExpenseCategory,
  InflowCategory,
  Transaction,
} from './types/expense';
import { CAMPUS_PRESETS } from './types/expense';
import { parseHDFCStatementFile } from './utils/hdfcParser';
import type { RawParsedRow } from './utils/hdfcParser';
import { triggerHaptic, exportTransactionsToCSV } from './utils/feedback';
import {
  Trash2,
  Upload,
  Sparkles,
  Search,
  LayoutDashboard,
  Zap,
  ReceiptText,
  Download,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Filter,
  X,
} from 'lucide-react';

const PLACES = [
  'Amul',
  'Vendi',
  'Mess',
  'Redi',
  'ANC',
  'FM',
  'Cnot',
  'Looters',
  'Pitstop',
  'IC',
  'Akshay',
  'Blinkit',
  "Domino's",
  'Amazon',
  'Pilani / Local',
  'Hostel / Campus',
  'Other',
];

const CATEGORIES: ExpenseCategory[] = [
  'Food',
  'Essentials',
  'Stationery',
  'Entertainment',
  'Gift, treat',
  'Transportation',
  'Health',
  'Miscellaneous',
];

const INFLOW_TYPES: InflowCategory[] = [
  'Parent Top-up',
  'Relative / Gift',
  'Split Reimbursement',
  'Refund / Reversal',
];

interface ToastItem {
  id: string;
  title: string;
  subtitle?: string;
  type: 'success' | 'info' | 'error';
  undoAction?: () => void;
}

export default function App() {
  const {
    transactions,
    quickMode,
    openingBalance,
    syncState,
    initRealtimeSync,
    setQuickMode,
    setOpeningBalance,
    addTransaction,
    bulkAddTransactions,
    updateTransaction,
    reapplyAliasesToExisting,
    deleteTransaction,
    clearAllTransactions,
    upsertAlias,
    matchPayeeToAlias,
  } = useExpenseStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'log' | 'import' | 'ledger'>('overview');
  const [bucketScope, setBucketScope] = useState<'ALL' | 'OOP' | 'SU_ID' | 'PARENTS'>('ALL');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [shorthand, setShorthand] = useState('');

  // Visual pulse feedback on clicked preset card
  const [flashedPreset, setFlashedPreset] = useState<string | null>(null);

  // Toast Notification Queue
  const [toasts, setToasts] = useState<ToastItem[]>([]);

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

  // Rich Multi-Criteria Ledger Filters
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerPlaceFilter, setLedgerPlaceFilter] = useState<string>('ALL');
  const [ledgerCatFilter, setLedgerCatFilter] = useState<string>('ALL');
  const [ledgerModeFilter, setLedgerModeFilter] = useState<string>('ALL');
  const [ledgerFlowFilter, setLedgerFlowFilter] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [rememberEdits, setRememberEdits] = useState(true);

  // Importer State
  const [parsedRows, setParsedRows] = useState<RawParsedRow[]>([]);
  const [importError, setImportError] = useState<string>('');
  const [payeeOverrides, setPayeeOverrides] = useState<
    Record<
      string,
      { place: string; cat: ExpenseCategory; mode: 'UPI' | 'Card'; inflowCat?: InflowCategory }
    >
  >({});

  // Manual Inflow State
  const [inflowAmt, setInflowAmt] = useState('');
  const [inflowSource, setInflowSource] = useState<InflowCategory>('Parent Top-up');
  const [inflowNote, setInflowNote] = useState('');

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

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.date && t.date.length >= 7) set.add(t.date.slice(0, 7));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const walletStats = useMemo(() => {
    const credits = transactions.filter((t) => t.txType === 'CREDIT');
    const totalCredits = credits.reduce((acc, t) => acc + t.price, 0);
    const parentInflows = credits
      .filter((t) => t.inflowCat === 'Parent Top-up')
      .reduce((acc, t) => acc + t.price, 0);
    const relativeInflows = credits
      .filter((t) => t.inflowCat === 'Relative / Gift')
      .reduce((acc, t) => acc + t.price, 0);

    const oopDebits = transactions.filter(
      (t) => t.txType === 'DEBIT' && ['UPI', 'Cash', 'Card'].includes(t.mode)
    );
    const totalOOPDebits = oopDebits.reduce((acc, t) => acc + t.price, 0);
    const liquidBalance = openingBalance + totalCredits - totalOOPDebits;

    const uniqueDays = new Set(oopDebits.map((t) => t.date)).size || 1;
    const dailyBurn = oopDebits.length > 0 ? totalOOPDebits / uniqueDays : 0;
    const runwayDays =
      dailyBurn > 0 && liquidBalance > 0 ? Math.round(liquidBalance / dailyBurn) : 0;

    return {
      totalCredits,
      parentInflows,
      relativeInflows,
      totalOOPDebits,
      liquidBalance,
      dailyBurn,
      runwayDays,
    };
  }, [transactions, openingBalance]);

  const periodDebits = useMemo(() => {
    return transactions.filter((t) => {
      if (t.txType !== 'DEBIT') return false;
      if (monthFilter !== 'ALL' && !t.date.startsWith(monthFilter)) return false;
      return true;
    });
  }, [transactions, monthFilter]);

  const activeDebits = useMemo(() => {
    return periodDebits.filter((t) => {
      if (bucketScope === 'OOP' && !['UPI', 'Cash', 'Card'].includes(t.mode)) return false;
      if (bucketScope === 'SU_ID' && !['SU', 'ID'].includes(t.mode)) return false;
      if (bucketScope === 'PARENTS' && t.mode !== 'Parents') return false;
      if (modeFilter !== 'ALL' && t.mode !== modeFilter) return false;
      return true;
    });
  }, [periodDebits, bucketScope, modeFilter]);

  const bucketTotals = useMemo(() => {
    const oop = periodDebits
      .filter((t) => ['UPI', 'Cash', 'Card'].includes(t.mode))
      .reduce((s, t) => s + t.price, 0);
    const su = periodDebits.filter((t) => t.mode === 'SU').reduce((s, t) => s + t.price, 0);
    const id = periodDebits.filter((t) => t.mode === 'ID').reduce((s, t) => s + t.price, 0);
    const parents = periodDebits
      .filter((t) => t.mode === 'Parents')
      .reduce((s, t) => s + t.price, 0);
    const activeTotal = activeDebits.reduce((s, t) => s + t.price, 0);
    return { oop, su, id, su_id: su + id, parents, activeTotal };
  }, [periodDebits, activeDebits]);

  const breakdowns = useMemo(() => {
    const byPlace: Record<string, { sum: number; count: number }> = {};
    const byCat: Record<string, { sum: number; count: number }> = {};
    const byMode: Record<string, { sum: number; count: number }> = {};

    activeDebits.forEach((t) => {
      const p = t.place || 'Other';
      byPlace[p] = { sum: (byPlace[p]?.sum || 0) + t.price, count: (byPlace[p]?.count || 0) + 1 };

      const c = t.cat || 'Miscellaneous';
      byCat[c] = { sum: (byCat[c]?.sum || 0) + t.price, count: (byCat[c]?.count || 0) + 1 };
    });

    periodDebits.forEach((t) => {
      byMode[t.mode] = {
        sum: (byMode[t.mode]?.sum || 0) + t.price,
        count: (byMode[t.mode]?.count || 0) + 1,
      };
    });

    return {
      places: Object.entries(byPlace).sort((a, b) => b[1].sum - a[1].sum),
      categories: Object.entries(byCat).sort((a, b) => b[1].sum - a[1].sum),
      modes: Object.entries(byMode).sort((a, b) => b[1].sum - a[1].sum),
    };
  }, [activeDebits, periodDebits]);

  // TRACK 4 ANALYTICS: Daily Trajectory, Habit Inspector, Weekday Matrix & Ticket Tiers
  const deepAnalytics = useMemo(() => {
    // 1. Last 14 Active Dates Trajectory
    const byDate: Record<string, number> = {};
    activeDebits.forEach((t) => {
      byDate[t.date] = (byDate[t.date] || 0) + t.price;
    });
    const recentDates = Object.entries(byDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14);
    const maxDaily = Math.max(...recentDates.map((d) => d[1]), 1);

    // 2. Habit Frequency Inspector
    const habitDefs = [
      {
        id: 'dairy',
        name: 'Yoghurt, Lassi & Chaach',
        spot: 'Amul / Namonarayan',
        match: (t: Transaction) =>
          /yoghurt|youghurt|lassi|chaach|chaas|curd|dahi|amul/i.test(`${t.name} ${t.place}`),
      },
      {
        id: 'vendi',
        name: 'Vendi Chips & Night Snacks',
        spot: 'Vendi / Vending Bros',
        match: (t: Transaction) =>
          /vendi|vending|chips|lays|chocolate/i.test(`${t.name} ${t.place}`),
      },
      {
        id: 'mess',
        name: 'Paneer Bhurji & Mess Extras',
        spot: 'Mess / Aditya Food',
        match: (t: Transaction) =>
          /bhurji|paneer|panner|mess|adityafood/i.test(`${t.name} ${t.place}`),
      },
      {
        id: 'canteen',
        name: 'Maggi, Burgers & Night Eateries',
        spot: 'Redi / ANC / FM / Looters',
        match: (t: Transaction) =>
          /maggi|burger|chili potato|sandwich|redi|anc|food ministry|looters|\bfm\b/i.test(
            `${t.name} ${t.place}`
          ),
      },
      {
        id: 'cnot',
        name: 'Cnot Meals, Pastries & Pizza',
        spot: "Cnot / Domino's",
        match: (t: Transaction) =>
          /cnot|connaught|choco lava|pastry|domino|pizza|bedrock/i.test(`${t.name} ${t.place}`),
      },
      {
        id: 'quickcom',
        name: 'Quick Commerce & Supermarket',
        spot: 'Blinkit / Amazon / Akshay',
        match: (t: Transaction) =>
          /blinkit|amazon|akshay|zepto|instamart/i.test(`${t.name} ${t.place}`),
      },
      {
        id: 'print',
        name: 'Printouts, Pens & Stationery',
        spot: 'Shubhan Print / Campus',
        match: (t: Transaction) =>
          /print|pen|xerox|stationery|shubhan/i.test(`${t.name} ${t.place} ${t.cat}`),
      },
    ];

    const habits = habitDefs
      .map((h) => {
        const matched = activeDebits.filter(h.match);
        const sum = matched.reduce((s, t) => s + t.price, 0);
        const count = matched.length;
        const avg = count > 0 ? sum / count : 0;
        const share = bucketTotals.activeTotal > 0 ? (sum / bucketTotals.activeTotal) * 100 : 0;
        return { ...h, count, sum, avg, share };
      })
      .filter((h) => h.count > 0)
      .sort((a, b) => b.sum - a.sum);

    // 3. Day-of-Week Intensity
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daySums = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    activeDebits.forEach((t) => {
      const d = new Date(t.date + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        const idx = d.getDay();
        daySums[idx] += t.price;
        dayCounts[idx] += 1;
      }
    });
    const maxDaySum = Math.max(...daySums, 1);
    const weekdayStats = dayNames.map((label, idx) => ({
      label,
      sum: daySums[idx],
      count: dayCounts[idx],
      pct: Math.round((daySums[idx] / maxDaySum) * 100),
    }));

    // 4. Ticket Size Distribution (Micro <=50, Mid 51-200, Bulk >200)
    const micro = activeDebits.filter((t) => t.price <= 50);
    const mid = activeDebits.filter((t) => t.price > 50 && t.price <= 200);
    const bulk = activeDebits.filter((t) => t.price > 200);

    const tiers = [
      {
        label: 'Micro (≤ ₹50)',
        count: micro.length,
        sum: micro.reduce((s, t) => s + t.price, 0),
      },
      {
        label: 'Mid-Ticket (₹51–₹200)',
        count: mid.length,
        sum: mid.reduce((s, t) => s + t.price, 0),
      },
      {
        label: 'High-Ticket (> ₹200)',
        count: bulk.length,
        sum: bulk.reduce((s, t) => s + t.price, 0),
      },
    ];

    return { recentDates, maxDaily, habits, weekdayStats, tiers };
  }, [activeDebits, bucketTotals.activeTotal]);

  // Multi-Dimensional Filtered Ledger + Live Summary
  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return transactions.filter((t) => {
      if (ledgerFlowFilter !== 'ALL' && t.txType !== ledgerFlowFilter) return false;
      if (ledgerPlaceFilter !== 'ALL') {
        const p = t.txType === 'CREDIT' ? t.inflowCat : t.place;
        if (p !== ledgerPlaceFilter) return false;
      }
      if (ledgerCatFilter !== 'ALL' && t.cat !== ledgerCatFilter) return false;
      if (ledgerModeFilter !== 'ALL' && t.mode !== ledgerModeFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.place.toLowerCase().includes(q) ||
        t.cat.toLowerCase().includes(q) ||
        t.mode.toLowerCase().includes(q) ||
        t.date.includes(q)
      );
    });
  }, [
    transactions,
    ledgerSearch,
    ledgerPlaceFilter,
    ledgerCatFilter,
    ledgerModeFilter,
    ledgerFlowFilter,
  ]);

  const filteredLedgerStats = useMemo(() => {
    const debits = filteredLedger
      .filter((t) => t.txType === 'DEBIT')
      .reduce((s, t) => s + t.price, 0);
    const credits = filteredLedger
      .filter((t) => t.txType === 'CREDIT')
      .reduce((s, t) => s + t.price, 0);
    return { debits, credits, count: filteredLedger.length };
  }, [filteredLedger]);

  // Helper to jump from Overview analytics directly into filtered Ledger
  const drillIntoPlace = (place: string) => {
    triggerHaptic('light');
    setLedgerPlaceFilter(place);
    setLedgerCatFilter('ALL');
    setLedgerFlowFilter('DEBIT');
    setActiveTab('ledger');
    notify(`Filtered by ${place}`, 'Showing matching ledger entries', 'info');
  };

  const drillIntoCategory = (cat: string) => {
    triggerHaptic('light');
    setLedgerCatFilter(cat);
    setLedgerPlaceFilter('ALL');
    setLedgerFlowFilter('DEBIT');
    setActiveTab('ledger');
    notify(`Filtered by ${cat}`, 'Showing matching ledger entries', 'info');
  };

  const handleShorthandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shorthand.trim()) {
      triggerHaptic('error');
      notify('Empty command', 'Type item + amount (e.g. redi maggi 40 su)', 'error');
      return;
    }
    const lower = shorthand.toLowerCase();
    const priceMatch = shorthand.match(/(\d+(?:\.\d{1,2})?)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
    if (price <= 0) {
      triggerHaptic('error');
      notify('Missing price', 'Include a valid ₹ number (e.g. maggi 40)', 'error');
      return;
    }

    let mode: PaymentMode = quickMode;
    if (/\bsu\b/.test(lower)) mode = 'SU';
    else if (/\bid\b|\bswd\b/.test(lower)) mode = 'ID';
    else if (/\bcash\b/.test(lower)) mode = 'Cash';
    else if (/\bparents?\b/.test(lower)) mode = 'Parents';
    else if (/\bupi\b/.test(lower)) mode = 'UPI';

    const indiv = /\bsplit\b/.test(lower) ? 'Split' : 'Solo';
    const matched = matchPayeeToAlias(shorthand, shorthand, 'DEBIT');

    const cleanName =
      shorthand
        .replace(/\b(su|upi|id|swd|cash|parents|split)\b/gi, '')
        .replace(/\d+(?:\.\d{1,2})?/, '')
        .trim() || matched.place;

    addTransaction({
      date: new Date().toISOString().slice(0, 10),
      name: cleanName,
      rawPayee: cleanName.toUpperCase(),
      price,
      txType: 'DEBIT',
      mode,
      cat: matched.cat,
      subcat: matched.subcat,
      place: matched.place,
      indiv,
      note: '',
      status: 'completed',
    });

    triggerHaptic('success');
    notify(`Recorded ₹${price} · ${cleanName}`, `${matched.place} · ${mode}`, 'success');
    setShorthand('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    try {
      const rows = await parseHDFCStatementFile(file);
      if (rows.length === 0) {
        triggerHaptic('error');
        setImportError(
          'No valid transaction rows found. Ensure file contains Date, Narration, and Debit/Credit columns.'
        );
        notify('Import failed', 'No valid transaction rows detected', 'error');
        return;
      }
      setParsedRows(rows);
      triggerHaptic('success');
      notify(`Parsed ${rows.length} rows`, 'Review unique payees below before committing', 'info');

      const initialOverrides: typeof payeeOverrides = {};
      rows.forEach((r) => {
        if (!initialOverrides[r.payee]) {
          const matched = matchPayeeToAlias(r.payee, r.note, r.txType);
          initialOverrides[r.payee] = {
            place: matched.place,
            cat: matched.cat,
            mode: r.detectedBankMode,
            inflowCat: matched.inflowCat || 'Parent Top-up',
          };
        }
      });
      setPayeeOverrides(initialOverrides);
    } catch {
      triggerHaptic('error');
      setImportError('Failed to parse statement. Please check file format.');
      notify('Parse error', 'Could not read statement file', 'error');
    }
  };

  const uniquePayeeGroups = useMemo(() => {
    const groups: Record<
      string,
      { payee: string; count: number; total: number; txType: 'DEBIT' | 'CREDIT' }
    > = {};
    parsedRows.forEach((r) => {
      const key = `${r.txType}__${r.payee}`;
      if (!groups[key]) {
        groups[key] = { payee: r.payee, count: 0, total: 0, txType: r.txType };
      }
      groups[key].count += 1;
      groups[key].total += r.amount;
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [parsedRows]);

  const commitBulkImport = () => {
    Object.entries(payeeOverrides).forEach(([payeeKey, cfg]) => {
      upsertAlias({
        key: payeeKey,
        place: cfg.place,
        cat: cfg.cat,
        subcat: cfg.place,
        txType: 'DEBIT',
        inflowCat: cfg.inflowCat,
      });
    });

    const toCommit = parsedRows.map((r) => {
      const cfg = payeeOverrides[r.payee] || {
        place: 'Other',
        cat: 'Food' as ExpenseCategory,
        mode: r.detectedBankMode,
        inflowCat: 'Parent Top-up' as InflowCategory,
      };
      return {
        date: r.date,
        name: r.note ? `${r.payee} · ${r.note}` : r.payee,
        rawPayee: r.payee,
        price: r.amount,
        txType: r.txType,
        mode: cfg.mode,
        cat: cfg.cat,
        subcat: cfg.place,
        place: r.txType === 'CREDIT' ? 'Bank Transfer' : cfg.place,
        indiv: 'Solo' as const,
        inflowCat: r.txType === 'CREDIT' ? cfg.inflowCat : undefined,
        note: r.note || '',
        status: 'completed' as const,
      };
    });

    bulkAddTransactions(toCommit);
    triggerHaptic('success');
    notify(`Imported ${toCommit.length} transactions`, 'Synced with cloud ledger', 'success');
    setParsedRows([]);
    setActiveTab('overview');
  };

  const switchTabWithFeedback = (tab: 'overview' | 'log' | 'import' | 'ledger') => {
    triggerHaptic('light');
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#09090b] text-zinc-100 antialiased selection:bg-zinc-800 pb-24 md:pb-12">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-[#09090b]/95 sticky top-0 z-30 backdrop-blur w-full">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-4 min-w-0">
            <span className="font-semibold tracking-tight text-sm text-zinc-100 shrink-0">
              LEDGER / BITS
            </span>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {(
                [
                  { id: 'overview', label: 'Overview & Analytics' },
                  { id: 'log', label: 'Quick Entry' },
                  { id: 'import', label: 'Statement Import' },
                  { id: 'ledger', label: `Transactions (${transactions.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => switchTabWithFeedback(tab.id)}
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

          {/* Status & Wallet Indicator */}
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
                  walletStats.liquidBalance < 0
                    ? 'text-red-400 font-semibold'
                    : 'text-zinc-100 font-semibold'
                }
              >
                ₹{fmt(walletStats.liquidBalance)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 w-full overflow-hidden">
        {/* TAB 1: OVERVIEW & TRACK 4 ANALYTICS */}
        {activeTab === 'overview' && (
          <div className="space-y-5 animate-pane">
            {/* Filter Bar */}
            <div className="space-y-2.5 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar w-full py-0.5">
                <div className="inline-flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-md shrink-0">
                  {(
                    [
                      { id: 'ALL', label: 'All' },
                      { id: 'OOP', label: 'Out-of-Pocket' },
                      { id: 'SU_ID', label: 'SU & ID' },
                      { id: 'PARENTS', label: 'Parents' },
                    ] as const
                  ).map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        triggerHaptic('light');
                        setBucketScope(b.id);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-sm whitespace-nowrap transition ${
                        bucketScope === b.id
                          ? 'bg-zinc-100 text-zinc-950'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={modeFilter}
                    onChange={(e) => {
                      triggerHaptic('light');
                      setModeFilter(e.target.value);
                    }}
                    className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200"
                  >
                    <option value="ALL">Mode: All</option>
                    <option value="UPI">UPI</option>
                    <option value="SU">SU App</option>
                    <option value="ID">Campus ID</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Debit Card</option>
                    <option value="Parents">Parents</option>
                  </select>

                  <select
                    value={monthFilter}
                    onChange={(e) => {
                      triggerHaptic('light');
                      setMonthFilter(e.target.value);
                    }}
                    className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200"
                  >
                    <option value="ALL">Period: All</option>
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      exportTransactionsToCSV(transactions);
                      notify('CSV Exported', `${transactions.length} rows downloaded`, 'info');
                    }}
                    className="inline-flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2.5 py-1 rounded-md text-xs text-zinc-300"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-900/50 border border-zinc-800/80 px-2.5 py-1.5 rounded-md">
                <span>Aug 1 Opening Bank Balance:</span>
                <div className="flex items-center gap-1 font-mono">
                  <span>₹</span>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    onBlur={() => notify('Opening balance saved', `₹${fmt(openingBalance)}`, 'info')}
                    className="w-20 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-right font-mono text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 4-Column Metric Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 bg-zinc-800/80 gap-px border border-zinc-800 rounded-lg overflow-hidden w-full">
              <div className="bg-[#09090b] p-3.5 sm:p-4">
                <div className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Filtered Spend
                </div>
                <div className="text-lg sm:text-2xl font-mono font-semibold text-zinc-100 mt-1 truncate">
                  ₹{fmt(bucketTotals.activeTotal)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                  {activeDebits.length} txns · Avg ₹{Math.round(walletStats.dailyBurn)}/d
                </div>
              </div>

              <div className="bg-[#09090b] p-3.5 sm:p-4">
                <div className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Out-of-Pocket
                </div>
                <div className="text-lg sm:text-2xl font-mono font-semibold text-zinc-100 mt-1 truncate">
                  ₹{fmt(bucketTotals.oop)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 font-mono truncate">
                  Left: ₹{fmt(walletStats.liquidBalance)} ({walletStats.runwayDays}d)
                </div>
              </div>

              <div className="bg-[#09090b] p-3.5 sm:p-4">
                <div className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  SU & ID Credit
                </div>
                <div className="text-lg sm:text-2xl font-mono font-semibold text-zinc-100 mt-1 truncate">
                  ₹{fmt(bucketTotals.su_id)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 font-mono truncate">
                  SU ₹{fmt(bucketTotals.su)} · ID ₹{fmt(bucketTotals.id)}
                </div>
              </div>

              <div className="bg-[#09090b] p-3.5 sm:p-4">
                <div className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Total Inflows
                </div>
                <div className="text-lg sm:text-2xl font-mono font-semibold text-zinc-100 mt-1 truncate">
                  ₹{fmt(walletStats.totalCredits)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 font-mono truncate">
                  Par ₹{fmt(walletStats.parentInflows)} · Gift ₹{fmt(walletStats.relativeInflows)}
                </div>
              </div>
            </div>

            {/* TRACK 4 ANALYTICS ROW 1: Daily Spend Trajectory + Day-of-Week Intensity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* 14-Day Daily Burn Bar Chart */}
              <div className="lg:col-span-2 border border-zinc-800/90 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-300">
                      Daily Spend Trajectory (Last 14 Active Days)
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Tap any bar to inspect transactions on that date
                    </p>
                  </div>
                  <span className="text-xs font-mono text-zinc-400">
                    Peak: ₹{fmt(deepAnalytics.maxDaily)}
                  </span>
                </div>

                {deepAnalytics.recentDates.length === 0 ? (
                  <div className="h-36 flex items-center justify-center text-xs text-zinc-600">
                    No daily spend data in selected filter
                  </div>
                ) : (
                  <div className="h-40 flex items-end gap-1.5 sm:gap-2 pt-5 pb-1 border-b border-zinc-800/60">
                    {deepAnalytics.recentDates.map(([date, sum]) => {
                      const heightPct = Math.max(6, Math.round((sum / deepAnalytics.maxDaily) * 100));
                      return (
                        <div
                          key={date}
                          onClick={() => {
                            triggerHaptic('light');
                            setLedgerSearch(date);
                            setActiveTab('ledger');
                            notify(`Date: ${date}`, `Spent ₹${fmt(sum)}`, 'info');
                          }}
                          className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                        >
                          <span className="text-[9px] font-mono text-zinc-500 group-hover:text-zinc-100 mb-1 truncate">
                            ₹{Math.round(sum)}
                          </span>
                          <div className="w-full max-w-[28px] bg-zinc-900 rounded-t-xs h-24 flex items-end overflow-hidden">
                            <div
                              className="w-full bg-zinc-300 group-hover:bg-white transition-all rounded-t-xs"
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-zinc-500 mt-1.5">
                            {date.slice(8)}/{date.slice(5, 7)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Day-of-Week Intensity + Ticket Size Tiers */}
              <div className="border border-zinc-800/90 rounded-lg p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-300 border-b border-zinc-800/80 pb-2">
                    Day-of-Week Spend Intensity
                  </h3>
                  <div className="grid grid-cols-7 gap-1.5 pt-3">
                    {deepAnalytics.weekdayStats.map((d) => (
                      <div key={d.label} className="flex flex-col items-center">
                        <div className="w-full h-16 bg-zinc-900 rounded-xs flex items-end overflow-hidden p-0.5">
                          <div
                            className="w-full bg-zinc-400 rounded-xs"
                            style={{ height: `${Math.max(4, d.pct)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 mt-1">{d.label}</span>
                        <span className="text-[9px] font-mono text-zinc-500">
                          ₹{d.sum >= 1000 ? `${(d.sum / 1000).toFixed(1)}k` : Math.round(d.sum)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Ticket Size Distribution
                  </div>
                  {deepAnalytics.tiers.map((tier) => (
                    <div key={tier.label} className="flex justify-between items-center text-xs">
                      <span className="text-zinc-300">
                        {tier.label}{' '}
                        <span className="text-zinc-500 font-mono">({tier.count}x)</span>
                      </span>
                      <span className="font-mono text-zinc-200">₹{fmt(tier.sum)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* TRACK 4 ANALYTICS ROW 2: Habit Frequency Inspector */}
            <div className="border border-zinc-800/90 rounded-lg overflow-hidden">
              <div className="p-3.5 sm:p-4 border-b border-zinc-800/80 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-200">
                    Campus Habit Frequency Inspector
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Tracks cumulative drain from repeat ₹10–₹100 campus purchases
                  </p>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  {deepAnalytics.habits.length} active clusters
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/50 text-zinc-500 font-mono uppercase text-[10px] border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3">Habit Cluster</th>
                      <th className="py-2.5 px-3">Primary Spot</th>
                      <th className="py-2.5 px-3 text-right">Frequency</th>
                      <th className="py-2.5 px-3 text-right">Avg Ticket</th>
                      <th className="py-2.5 px-3 text-right">Share</th>
                      <th className="py-2.5 px-3 text-right">Cumulative Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {deepAnalytics.habits.map((h) => (
                      <tr key={h.id} className="hover:bg-zinc-900/30">
                        <td className="py-2.5 px-3 font-medium text-zinc-200">{h.name}</td>
                        <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">{h.spot}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                          {h.count}x
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-400">
                          ₹{Math.round(h.avg)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-400">
                          {h.share.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-100">
                          ₹{fmt(h.sum)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3-Column Drilldown Breakdowns (Click any row to filter Ledger) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="border border-zinc-800/90 rounded-lg p-3.5 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    By Payment Mode
                  </h3>
                  <span className="text-[10px] text-zinc-500">Tap to isolate</span>
                </div>
                <div className="space-y-2">
                  {breakdowns.modes.map(([mode, info]) => {
                    const total = periodDebits.reduce((s, t) => s + t.price, 0) || 1;
                    const pct = Math.round((info.sum / total) * 100);
                    return (
                      <div
                        key={mode}
                        onClick={() => {
                          triggerHaptic('light');
                          setModeFilter(modeFilter === mode ? 'ALL' : mode);
                          notify(
                            modeFilter === mode ? 'Cleared mode filter' : `Mode: ${mode}`,
                            `₹${fmt(info.sum)} across ${info.count} txns`,
                            'info'
                          );
                        }}
                        className="cursor-pointer group space-y-1"
                      >
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-200 group-hover:text-white font-medium">
                            {mode} <span className="text-zinc-500 font-mono">({info.count})</span>
                          </span>
                          <span className="font-mono text-zinc-300">
                            ₹{fmt(info.sum)} <span className="text-zinc-500">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-300" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border border-zinc-800/90 rounded-lg p-3.5 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Top Campus Spots
                  </h3>
                  <span className="text-[10px] text-zinc-500">Tap to view txns</span>
                </div>
                <div className="space-y-2">
                  {breakdowns.places.slice(0, 8).map(([place, info]) => {
                    const max = breakdowns.places[0]?.[1].sum || 1;
                    const pct = Math.round((info.sum / max) * 100);
                    return (
                      <div
                        key={place}
                        onClick={() => drillIntoPlace(place)}
                        className="space-y-1 cursor-pointer group"
                      >
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-200 group-hover:text-white font-medium truncate max-w-[150px]">
                            {place} <span className="text-zinc-500 font-mono">({info.count})</span>
                          </span>
                          <span className="font-mono text-zinc-300 shrink-0">₹{fmt(info.sum)}</span>
                        </div>
                        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-zinc-400 group-hover:bg-zinc-200 transition-colors"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border border-zinc-800/90 rounded-lg p-3.5 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    By Category
                  </h3>
                  <span className="text-[10px] text-zinc-500">Tap to view txns</span>
                </div>
                <div className="space-y-2">
                  {breakdowns.categories.map(([cat, info]) => {
                    const total = bucketTotals.activeTotal || 1;
                    const pct = Math.round((info.sum / total) * 100);
                    return (
                      <div
                        key={cat}
                        onClick={() => drillIntoCategory(cat)}
                        className="space-y-1 cursor-pointer group"
                      >
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-200 group-hover:text-white font-medium truncate max-w-[150px]">
                            {cat} <span className="text-zinc-500 font-mono">({info.count})</span>
                          </span>
                          <span className="font-mono text-zinc-300 shrink-0">
                            ₹{fmt(info.sum)} <span className="text-zinc-500">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-zinc-400 group-hover:bg-zinc-200 transition-colors"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QUICK ENTRY */}
        {activeTab === 'log' && (
          <div className="space-y-4 sm:space-y-6 animate-pane">
            <form
              onSubmit={handleShorthandSubmit}
              className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 bg-zinc-900/40 space-y-2"
            >
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-zinc-300">Command Entry</label>
                <span className="text-[10px] text-zinc-500 font-mono">
                  [item] [amount] [su|upi|id|cash]
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  value={shorthand}
                  onChange={(e) => setShorthand(e.target.value)}
                  placeholder="e.g. redi maggi 80 su   or   cnot pasta 140 upi"
                  className="flex-1 min-w-0 bg-[#09090b] border border-zinc-800 rounded-md px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
                <button
                  type="submit"
                  className="bg-zinc-100 hover:bg-white text-zinc-950 px-4 py-2 rounded-md font-medium text-xs shrink-0"
                >
                  Record
                </button>
              </div>
            </form>

            <div className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider shrink-0">
                  Active Mode:
                </span>
                <div className="inline-flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-md shrink-0">
                  {(['UPI', 'SU', 'ID', 'Cash', 'Card', 'Parents'] as PaymentMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        triggerHaptic('light');
                        setQuickMode(m);
                        notify(`Mode switched to ${m}`, '1-Tap presets updated', 'info');
                      }}
                      className={`px-2.5 py-1 text-xs font-mono font-medium rounded-sm transition ${
                        quickMode === m ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CAMPUS_PRESETS.map((p) => {
                  const isFlashed = flashedPreset === p.name;
                  return (
                    <button
                      key={p.name}
                      onClick={() => {
                        triggerHaptic('success');
                        setFlashedPreset(p.name);
                        setTimeout(() => setFlashedPreset(null), 350);

                        addTransaction({
                          date: new Date().toISOString().slice(0, 10),
                          name: p.name,
                          rawPayee: p.place.toUpperCase(),
                          price: p.price,
                          txType: 'DEBIT',
                          mode: quickMode,
                          cat: p.cat,
                          subcat: p.subcat,
                          place: p.place,
                          indiv: 'Solo',
                          note: '',
                          status: 'completed',
                        });

                        notify(
                          `Added ${p.name} (₹${p.price})`,
                          `Logged under ${p.place} · ${quickMode}`,
                          'success'
                        );
                      }}
                      className={`border rounded-md p-2.5 text-left transition ${
                        isFlashed
                          ? 'border-zinc-100 bg-zinc-800 scale-[0.97]'
                          : 'border-zinc-800/90 hover:border-zinc-600 bg-zinc-900/30'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                        <span>{p.place}</span>
                        <span>{quickMode}</span>
                      </div>
                      <div className="text-xs font-medium text-zinc-200 mt-1 truncate">
                        {p.name}
                      </div>
                      <div className="text-xs sm:text-sm font-mono font-semibold text-zinc-100 mt-0.5">
                        ₹{p.price}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border border-zinc-800 rounded-lg p-3.5 sm:p-4 space-y-2.5">
              <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Log Inflow / Top-up
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="number"
                  placeholder="Amount (₹)"
                  value={inflowAmt}
                  onChange={(e) => setInflowAmt(e.target.value)}
                  className="bg-[#09090b] border border-zinc-800 rounded-md px-3 py-1.5 text-xs font-mono"
                />
                <select
                  value={inflowSource}
                  onChange={(e) => setInflowSource(e.target.value as InflowCategory)}
                  className="bg-[#09090b] border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs"
                >
                  {INFLOW_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Note (optional)"
                  value={inflowNote}
                  onChange={(e) => setInflowNote(e.target.value)}
                  className="bg-[#09090b] border border-zinc-800 rounded-md px-3 py-1.5 text-xs"
                />
                <button
                  onClick={() => {
                    const price = parseFloat(inflowAmt);
                    if (!price || price <= 0) {
                      triggerHaptic('error');
                      notify('Invalid amount', 'Enter an inflow amount greater than ₹0', 'error');
                      return;
                    }
                    triggerHaptic('success');
                    addTransaction({
                      date: new Date().toISOString().slice(0, 10),
                      name: inflowNote ? `${inflowSource} · ${inflowNote}` : inflowSource,
                      price,
                      txType: 'CREDIT',
                      mode: 'UPI',
                      cat: 'Miscellaneous',
                      subcat: 'Inflow',
                      place: 'Bank Transfer',
                      indiv: 'Solo',
                      inflowCat: inflowSource,
                      note: inflowNote,
                      status: 'completed',
                    });
                    notify(`+₹${fmt(price)} added to wallet`, inflowSource, 'success');
                    setInflowAmt('');
                    setInflowNote('');
                  }}
                  className="bg-zinc-100 text-zinc-950 rounded-md font-medium text-xs py-1.5"
                >
                  + Add to Balance
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STATEMENT IMPORTER */}
        {activeTab === 'import' && (
          <div className="space-y-4 sm:space-y-6 animate-pane">
            <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-100">HDFC Delimited .txt Importer</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Parsed locally. Strictly logged as UPI or Card transactions.
                </p>
              </div>
              <input
                type="file"
                accept=".txt,.csv,.xls,.xlsx"
                onChange={handleFileUpload}
                className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 cursor-pointer"
              />
              {importError && <p className="text-xs text-red-400 font-mono">{importError}</p>}
            </div>

            {uniquePayeeGroups.length > 0 && (
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="p-3 bg-zinc-900/50 border-b border-zinc-800 flex justify-between items-center gap-2">
                  <span className="text-xs font-medium text-zinc-300">
                    {uniquePayeeGroups.length} payees detected
                  </span>
                  <button
                    onClick={commitBulkImport}
                    className="bg-zinc-100 text-zinc-950 px-3 py-1 rounded text-xs font-medium"
                  >
                    Commit {parsedRows.length} Rows
                  </button>
                </div>
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead className="border-b border-zinc-800 text-zinc-500 font-mono text-[11px]">
                      <tr>
                        <th className="py-2 px-2.5">Payee</th>
                        <th className="py-2 px-2.5">Type</th>
                        <th className="py-2 px-2.5">Total</th>
                        <th className="py-2 px-2.5">Place / Source</th>
                        <th className="py-2 px-2.5">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {uniquePayeeGroups.map((g) => {
                        const cfg = payeeOverrides[g.payee] || {
                          place: 'Other',
                          cat: 'Food',
                          mode: 'UPI',
                          inflowCat: 'Parent Top-up',
                        };
                        return (
                          <tr key={`${g.txType}_${g.payee}`}>
                            <td className="py-2 px-2.5 font-mono text-zinc-200 truncate max-w-[130px]">
                              {g.payee}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-[10px]">
                              <span
                                className={
                                  g.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-400'
                                }
                              >
                                {g.txType}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 font-mono">₹{fmt(g.total)}</td>
                            <td className="py-2 px-2.5">
                              {g.txType === 'CREDIT' ? (
                                <select
                                  value={cfg.inflowCat}
                                  onChange={(e) =>
                                    setPayeeOverrides((prev) => ({
                                      ...prev,
                                      [g.payee]: {
                                        ...cfg,
                                        inflowCat: e.target.value as InflowCategory,
                                      },
                                    }))
                                  }
                                  className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
                                >
                                  {INFLOW_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <select
                                  value={cfg.place}
                                  onChange={(e) =>
                                    setPayeeOverrides((prev) => ({
                                      ...prev,
                                      [g.payee]: { ...cfg, place: e.target.value },
                                    }))
                                  }
                                  className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
                                >
                                  {PLACES.map((spot) => (
                                    <option key={spot} value={spot}>
                                      {spot}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-2 px-2.5">
                              <select
                                value={cfg.cat}
                                onChange={(e) =>
                                  setPayeeOverrides((prev) => ({
                                    ...prev,
                                    [g.payee]: { ...cfg, cat: e.target.value as ExpenseCategory },
                                  }))
                                }
                                className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-xs"
                              >
                                {CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: MULTI-FILTER TRANSACTIONS LEDGER */}
        {activeTab === 'ledger' && (
          <div className="space-y-3 w-full overflow-hidden animate-pane">
            {/* Search + Multi-Filter Bar */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3 space-y-2.5">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2">
                <div className="flex items-center gap-2 flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1.5">
                  <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <input
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search merchant, item, date (YYYY-MM-DD)..."
                    className="bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none w-full"
                  />
                  {ledgerSearch && (
                    <button
                      onClick={() => setLedgerSearch('')}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      triggerHaptic('success');
                      reapplyAliasesToExisting();
                      notify(
                        'Smart Merchant Rules Applied',
                        'Mapped Vending Bros, Namonarayan, Shubhan Print & fixed UPI modes',
                        'success'
                      );
                    }}
                    className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-950 px-2.5 py-1.5 rounded-md text-xs font-medium shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Auto-Clean
                  </button>

                  {transactions.length > 0 && (
                    <button
                      onClick={() => {
                        triggerHaptic('warning');
                        if (confirm('Clear all entries?')) {
                          clearAllTransactions();
                          notify('Ledger cleared', 'All entries removed', 'info');
                        }
                      }}
                      className="text-xs text-zinc-500 hover:text-red-400 px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Dropdowns */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                <Filter className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <select
                  value={ledgerPlaceFilter}
                  onChange={(e) => {
                    triggerHaptic('light');
                    setLedgerPlaceFilter(e.target.value);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 shrink-0"
                >
                  <option value="ALL">Spot: All Locations</option>
                  {PLACES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <select
                  value={ledgerCatFilter}
                  onChange={(e) => {
                    triggerHaptic('light');
                    setLedgerCatFilter(e.target.value);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 shrink-0"
                >
                  <option value="ALL">Category: All</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={ledgerModeFilter}
                  onChange={(e) => {
                    triggerHaptic('light');
                    setLedgerModeFilter(e.target.value);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 shrink-0"
                >
                  <option value="ALL">Mode: All</option>
                  {(['UPI', 'SU', 'ID', 'Cash', 'Card', 'Parents'] as PaymentMode[]).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={ledgerFlowFilter}
                  onChange={(e) => {
                    triggerHaptic('light');
                    setLedgerFlowFilter(e.target.value as 'ALL' | 'DEBIT' | 'CREDIT');
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 shrink-0"
                >
                  <option value="ALL">Flow: Debits & Credits</option>
                  <option value="DEBIT">Expenses Only (Debit)</option>
                  <option value="CREDIT">Inflows Only (Credit)</option>
                </select>

                {(ledgerPlaceFilter !== 'ALL' ||
                  ledgerCatFilter !== 'ALL' ||
                  ledgerModeFilter !== 'ALL' ||
                  ledgerFlowFilter !== 'ALL' ||
                  ledgerSearch !== '') && (
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setLedgerPlaceFilter('ALL');
                      setLedgerCatFilter('ALL');
                      setLedgerModeFilter('ALL');
                      setLedgerFlowFilter('ALL');
                      setLedgerSearch('');
                    }}
                    className="text-xs text-zinc-400 hover:text-white underline shrink-0 px-1"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Live Filtered Summary Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/70 text-[11px] font-mono text-zinc-400">
                <span>
                  Showing <strong className="text-zinc-100">{filteredLedgerStats.count}</strong> of{' '}
                  {transactions.length} rows
                </span>
                <div className="flex items-center gap-3">
                  <span>
                    Filtered Spend:{' '}
                    <strong className="text-zinc-100">₹{fmt(filteredLedgerStats.debits)}</strong>
                  </span>
                  {filteredLedgerStats.credits > 0 && (
                    <span>
                      Inflows:{' '}
                      <strong className="text-emerald-400">
                        +₹{fmt(filteredLedgerStats.credits)}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="border border-zinc-800 rounded-lg overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[620px]">
                <thead className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px] bg-zinc-900/40">
                  <tr>
                    <th className="py-2 px-2.5">Date</th>
                    <th className="py-2 px-2.5">Description</th>
                    <th className="py-2 px-2.5">Place / Inflow</th>
                    <th className="py-2 px-2.5">Category</th>
                    <th className="py-2 px-2.5">Mode</th>
                    <th className="py-2 px-2.5 text-right">Amount</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {filteredLedger.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-900/30">
                      <td className="py-2 px-2.5 text-zinc-400 whitespace-nowrap text-[11px]">
                        {t.date.slice(5)}
                      </td>
                      <td className="py-2 px-2.5 text-zinc-200 font-sans max-w-[160px] truncate">
                        {t.name}
                      </td>
                      <td className="py-2 px-2.5 font-sans">
                        {t.txType === 'CREDIT' ? (
                          <select
                            value={t.inflowCat || 'Parent Top-up'}
                            onChange={(e) => {
                              triggerHaptic('medium');
                              updateTransaction(
                                t.id,
                                { inflowCat: e.target.value as InflowCategory },
                                rememberEdits
                              );
                              notify('Updated Inflow Type', `${t.name} → ${e.target.value}`, 'info');
                            }}
                            className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 text-xs text-emerald-400"
                          >
                            {INFLOW_TYPES.map((inf) => (
                              <option key={inf} value={inf}>
                                {inf}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={t.place}
                            onChange={(e) => {
                              triggerHaptic('medium');
                              updateTransaction(t.id, { place: e.target.value }, rememberEdits);
                              notify(
                                `Mapped to ${e.target.value}`,
                                rememberEdits
                                  ? 'Updated all matching merchant entries'
                                  : 'Updated single entry',
                                'success'
                              );
                            }}
                            className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 text-xs text-zinc-300"
                          >
                            {PLACES.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 px-2.5 font-sans">
                        <select
                          value={t.cat}
                          onChange={(e) => {
                            triggerHaptic('medium');
                            updateTransaction(
                              t.id,
                              { cat: e.target.value as ExpenseCategory },
                              rememberEdits
                            );
                            notify(`Category → ${e.target.value}`, t.name, 'info');
                          }}
                          className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 text-xs text-zinc-300"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2.5 font-sans">
                        <select
                          value={t.mode}
                          onChange={(e) => {
                            triggerHaptic('medium');
                            updateTransaction(
                              t.id,
                              { mode: e.target.value as PaymentMode },
                              false
                            );
                            notify(`Mode → ${e.target.value}`, t.name, 'info');
                          }}
                          className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 text-xs font-mono text-zinc-300"
                        >
                          {(['UPI', 'SU', 'ID', 'Cash', 'Card', 'Parents'] as PaymentMode[]).map(
                            (m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td
                        className={`py-2 px-2.5 text-right font-medium whitespace-nowrap ${
                          t.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-100'
                        }`}
                      >
                        {t.txType === 'CREDIT' ? '+' : '-'}₹{fmt(t.price)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => {
                            triggerHaptic('warning');
                            const backup = { ...t };
                            deleteTransaction(t.id);
                            notify(
                              `Deleted ${t.name}`,
                              `₹${fmt(t.price)} removed`,
                              'info',
                              () => {
                                addTransaction(backup);
                                triggerHaptic('success');
                              }
                            );
                          }}
                          className="text-zinc-600 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Floating Tactile Toast Stack */}
      <div className="fixed bottom-16 md:bottom-5 right-3 left-3 sm:left-auto sm:w-80 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-toast pointer-events-auto bg-zinc-900/95 backdrop-blur border border-zinc-700 text-zinc-100 px-3.5 py-2.5 rounded-lg shadow-2xl flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {t.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium text-zinc-100 truncate">{t.title}</div>
                {t.subtitle && (
                  <div className="text-[11px] text-zinc-400 truncate font-mono">{t.subtitle}</div>
                )}
              </div>
            </div>

            {t.undoAction && (
              <button
                onClick={() => {
                  t.undoAction?.();
                  setToasts((prev) => prev.filter((item) => item.id !== t.id));
                }}
                className="inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 py-1 rounded text-[11px] font-mono shrink-0"
              >
                <RotateCcw className="w-3 h-3" /> Undo
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Fixed Bottom Navigation Bar for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 border-t border-zinc-800 backdrop-blur px-2 py-1.5 flex justify-around items-center">
        <button
          onClick={() => switchTabWithFeedback('overview')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-md transition ${
            activeTab === 'overview' ? 'text-zinc-100' : 'text-zinc-500'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="text-[10px] font-medium">Overview</span>
        </button>

        <button
          onClick={() => switchTabWithFeedback('log')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-md transition ${
            activeTab === 'log' ? 'text-zinc-100' : 'text-zinc-500'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span className="text-[10px] font-medium">Quick Log</span>
        </button>

        <button
          onClick={() => switchTabWithFeedback('import')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-md transition ${
            activeTab === 'import' ? 'text-zinc-100' : 'text-zinc-500'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span className="text-[10px] font-medium">Import</span>
        </button>

        <button
          onClick={() => switchTabWithFeedback('ledger')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-md transition ${
            activeTab === 'ledger' ? 'text-zinc-100' : 'text-zinc-500'
          }`}
        >
          <ReceiptText className="w-4 h-4" />
          <span className="text-[10px] font-medium">Ledger</span>
        </button>
      </nav>
    </div>
  );
}