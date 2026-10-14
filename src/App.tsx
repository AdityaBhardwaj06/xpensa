import React, { useState, useMemo, useEffect } from 'react';
import { useExpenseStore } from './store/useExpenseStore';
import type {
  PaymentMode,
  ExpenseCategory,
  InflowCategory,
} from './types/expense';
import { CAMPUS_PRESETS } from './types/expense';
import { parseHDFCStatementFile } from './utils/hdfcParser';
import type { RawParsedRow } from './utils/hdfcParser';
import {
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  Upload,
  Sparkles,
  Cloud,
  Search,
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

export default function App() {
  const {
    transactions,
    quickMode,
    openingBalance,
    syncState,
    lastSyncedAt,
    syncError,
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

  const [activeTab, setActiveTab] = useState<'overview' | 'log' | 'import' | 'ledger' | 'cloud'>(
    'overview'
  );
  const [bucketScope, setBucketScope] = useState<'ALL' | 'OOP' | 'SU_ID' | 'PARENTS'>('ALL');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [shorthand, setShorthand] = useState('');

  // Ledger Search, Filter & Memory Toggle
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [rememberEdits, setRememberEdits] = useState(true);
  const [syncStatus, setSyncStatus] = useState('');

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
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [addTransaction, matchPayeeToAlias]);

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

  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.place.toLowerCase().includes(q) ||
        t.cat.toLowerCase().includes(q) ||
        t.mode.toLowerCase().includes(q) ||
        t.date.includes(q)
    );
  }, [transactions, ledgerSearch]);

  const handleShorthandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shorthand.trim()) return;
    const lower = shorthand.toLowerCase();
    const priceMatch = shorthand.match(/(\d+(?:\.\d{1,2})?)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
    if (price <= 0) return;

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
    setShorthand('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    try {
      const rows = await parseHDFCStatementFile(file);
      if (rows.length === 0) {
        setImportError(
          'No valid transaction rows found. Ensure the file has Date, Narration, and Debit/Credit columns.'
        );
        return;
      }
      setParsedRows(rows);

      const initialOverrides: typeof payeeOverrides = {};
      rows.forEach((r) => {
        if (!initialOverrides[r.payee]) {
          const matched = matchPayeeToAlias(r.payee, r.note, r.txType);
          initialOverrides[r.payee] = {
            place: matched.place,
            cat: matched.cat,
            // Strictly UPI or Card for bank statements
            mode: r.detectedBankMode,
            inflowCat: matched.inflowCat || 'Parent Top-up',
          };
        }
      });
      setPayeeOverrides(initialOverrides);
    } catch {
      setImportError('Failed to parse file. Check format and try again.');
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
        // Never allow SU, Cash, or Parents from a bank statement
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
    setParsedRows([]);
    setActiveTab('overview');
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased selection:bg-zinc-800">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-[#09090b]/95 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold tracking-tight text-sm text-zinc-100">
              LEDGER / BITS
            </span>
            <nav className="flex items-center gap-1">
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'log', label: 'Quick Entry' },
                  { id: 'import', label: 'Statement Import' },
                  { id: 'ledger', label: `Transactions (${transactions.length})` },
                  { id: 'cloud', label: 'Cloud & Host' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === tab.id
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>


          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${syncState === 'live'
                  ? 'bg-emerald-400'
                  : syncState === 'syncing'
                    ? 'bg-amber-400 animate-pulse'
                    : syncState === 'error'
                      ? 'bg-red-400'
                      : 'bg-zinc-600'
                }`}
            />
            <span className="text-zinc-400 uppercase">
              {syncState === 'live' ? `DB Live (${lastSyncedAt || 'synced'})` : syncState}
            </span>
            {syncError && <span className="text-red-400 ml-1">({syncError})</span>}
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-zinc-500 mr-1.5">LIQUID BAL</span>
              <span
                className={
                  walletStats.liquidBalance < 0
                    ? 'text-red-400 font-medium'
                    : 'text-zinc-100 font-medium'
                }
              >
                ₹{fmt(walletStats.liquidBalance)}
              </span>
            </div>
            <span className="text-zinc-800">|</span>
            <div>
              <span className="text-zinc-500 mr-1.5">BURN</span>
              <span className="text-zinc-300">₹{Math.round(walletStats.dailyBurn)}/d</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Filter Bar + Opening Balance Adjuster */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
              <div className="inline-flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-md">
                {(
                  [
                    { id: 'ALL', label: 'All Spend' },
                    { id: 'OOP', label: 'Out-of-Pocket' },
                    { id: 'SU_ID', label: 'SU & ID Credit' },
                    { id: 'PARENTS', label: 'Parents' },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBucketScope(b.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-sm transition ${bucketScope === b.id
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs">
                  <span className="text-zinc-500">Aug 1 Opening Bal: ₹</span>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-transparent font-mono text-zinc-200 focus:outline-none"
                  />
                </div>

                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-200"
                >
                  <option value="ALL">Mode: All</option>
                  <option value="UPI">UPI (GPay)</option>
                  <option value="SU">SU App</option>
                  <option value="ID">Campus ID</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Debit Card</option>
                  <option value="Parents">Parents</option>
                </select>

                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-200"
                >
                  <option value="ALL">Period: All Time (Aug+)</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 4-Column Structural Metric Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 bg-zinc-800/80 gap-px border border-zinc-800 rounded-lg overflow-hidden">
              <div className="bg-[#09090b] p-4">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Filtered Spend
                </div>
                <div className="text-2xl font-mono font-semibold text-zinc-100 mt-1">
                  ₹{fmt(bucketTotals.activeTotal)}
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono">
                  {activeDebits.length} txns
                </div>
              </div>

              <div className="bg-[#09090b] p-4">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Out-of-Pocket (Bank/Cash)
                </div>
                <div className="text-2xl font-mono font-semibold text-zinc-100 mt-1">
                  ₹{fmt(bucketTotals.oop)}
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono">
                  Liquid left: ₹{fmt(walletStats.liquidBalance)} ({walletStats.runwayDays}d)
                </div>
              </div>

              <div className="bg-[#09090b] p-4">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  SU App & ID Credit
                </div>
                <div className="text-2xl font-mono font-semibold text-zinc-100 mt-1">
                  ₹{fmt(bucketTotals.su_id)}
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono">
                  SU ₹{fmt(bucketTotals.su)} · ID ₹{fmt(bucketTotals.id)}
                </div>
              </div>

              <div className="bg-[#09090b] p-4">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Total Inflows Received
                </div>
                <div className="text-2xl font-mono font-semibold text-zinc-100 mt-1">
                  ₹{fmt(walletStats.totalCredits)}
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono">
                  Parents ₹{fmt(walletStats.parentInflows)} · Gifts ₹{fmt(walletStats.relativeInflows)}
                </div>
              </div>
            </div>

            {/* 3-Column Analytical Breakdowns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border border-zinc-800/90 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    By Payment Mode
                  </h3>
                  <span className="text-[11px] text-zinc-500">Click to isolate</span>
                </div>
                <div className="space-y-2.5">
                  {breakdowns.modes.map(([mode, info]) => {
                    const total = periodDebits.reduce((s, t) => s + t.price, 0) || 1;
                    const pct = Math.round((info.sum / total) * 100);
                    return (
                      <div
                        key={mode}
                        onClick={() => setModeFilter(modeFilter === mode ? 'ALL' : mode)}
                        className="cursor-pointer group space-y-1"
                      >
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-200 group-hover:text-white font-medium">
                            {mode}{' '}
                            <span className="text-zinc-500 font-mono">({info.count})</span>
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

              <div className="border border-zinc-800/90 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Top Places & Vendors
                  </h3>
                  <span className="text-[11px] text-zinc-500">Click Other in Ledger to map</span>
                </div>
                <div className="space-y-2.5">
                  {breakdowns.places.slice(0, 8).map(([place, info]) => {
                    const max = breakdowns.places[0]?.[1].sum || 1;
                    const pct = Math.round((info.sum / max) * 100);
                    return (
                      <div key={place} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-200 font-medium">
                            {place}{' '}
                            <span className="text-zinc-500 font-mono">({info.count})</span>
                          </span>
                          <span className="font-mono text-zinc-300">₹{fmt(info.sum)}</span>
                        </div>
                        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border border-zinc-800/90 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    By Category
                  </h3>
                  <span className="text-[11px] text-zinc-500">Active view</span>
                </div>
                <div className="space-y-2.5">
                  {breakdowns.categories.map(([cat, info]) => {
                    const total = bucketTotals.activeTotal || 1;
                    const pct = Math.round((info.sum / total) * 100);
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-200 font-medium">
                            {cat}{' '}
                            <span className="text-zinc-500 font-mono">({info.count})</span>
                          </span>
                          <span className="font-mono text-zinc-300">
                            ₹{fmt(info.sum)} <span className="text-zinc-500">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-400" style={{ width: `${pct}%` }} />
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
          <div className="space-y-6">
            <form
              onSubmit={handleShorthandSubmit}
              className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/40 space-y-2"
            >
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-zinc-300">Command Entry</label>
                <span className="text-[11px] text-zinc-500 font-mono">
                  Syntax: [item] [amount] [su|upi|id|cash] [split]
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  value={shorthand}
                  onChange={(e) => setShorthand(e.target.value)}
                  placeholder="redi maggi 80 su   or   cnot pasta 140 upi split"
                  className="flex-1 bg-[#09090b] border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
                <button
                  type="submit"
                  className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200 px-4 py-2 rounded-md font-medium text-xs transition"
                >
                  Record
                </button>
              </div>
            </form>

            <div className="border border-zinc-800 rounded-lg p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Default Payment Mode (Use SU for SU App QR scans)
                </span>
                <div className="inline-flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-md">
                  {(['UPI', 'SU', 'ID', 'Cash', 'Card', 'Parents'] as PaymentMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setQuickMode(m)}
                      className={`px-3 py-1 text-xs font-mono font-medium rounded-sm transition ${quickMode === m
                          ? 'bg-zinc-100 text-zinc-950'
                          : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CAMPUS_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() =>
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
                      })
                    }
                    className="border border-zinc-800/90 hover:border-zinc-600 bg-zinc-900/30 rounded-md p-3 text-left transition group"
                  >
                    <div className="flex justify-between items-center text-[11px] text-zinc-500 font-mono">
                      <span>{p.place}</span>
                      <span>{quickMode}</span>
                    </div>
                    <div className="text-xs font-medium text-zinc-200 mt-1 group-hover:text-white">
                      {p.name}
                    </div>
                    <div className="text-sm font-mono font-semibold text-zinc-100 mt-0.5">
                      ₹{p.price}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
              <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Record Inflow (Parent Top-Up / Relative Gift / Split Return)
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
                  className="bg-[#09090b] border border-zinc-800 rounded-md px-3 py-1.5 text-xs"
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
                    if (!price || price <= 0) return;
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
                    setInflowAmt('');
                    setInflowNote('');
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-md font-medium text-xs py-1.5 transition"
                >
                  Add Inflow
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: HDFC STATEMENT IMPORTER (STRICTLY UPI / CARD) */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <div className="border border-zinc-800 rounded-lg p-5 space-y-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-100">
                  HDFC Bank Statement Importer (.txt, .csv, .xls)
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Bank statements only permit UPI or Debit Card modes (never SU, Cash, or Parents).
                </p>
              </div>

              <input
                type="file"
                accept=".txt,.csv,.xls,.xlsx"
                onChange={handleFileUpload}
                className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 file:font-medium hover:file:bg-zinc-800 cursor-pointer"
              />
              {importError && <p className="text-xs text-red-400 font-mono">{importError}</p>}
            </div>

            {uniquePayeeGroups.length > 0 && (
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-300">
                      Unique Payee Mapping ({uniquePayeeGroups.length} payees · {parsedRows.length} rows)
                    </h3>
                  </div>
                  <button
                    onClick={commitBulkImport}
                    className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200 px-4 py-1.5 rounded-md font-medium text-xs transition"
                  >
                    Import {parsedRows.length} Bank Rows
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Payee</th>
                        <th className="py-2.5 px-3">Flow</th>
                        <th className="py-2.5 px-3 text-right">Count</th>
                        <th className="py-2.5 px-3 text-right">Total (₹)</th>
                        <th className="py-2.5 px-3">Spot / Inflow Type</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Bank Mode</th>
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
                          <tr key={`${g.txType}_${g.payee}`} className="hover:bg-zinc-900/30">
                            <td className="py-2 px-3 font-mono text-zinc-200">{g.payee}</td>
                            <td className="py-2 px-3 font-mono text-[11px]">
                              <span
                                className={
                                  g.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-400'
                                }
                              >
                                {g.txType}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-zinc-400">
                              {g.count}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-zinc-200">
                              ₹{fmt(g.total)}
                            </td>
                            <td className="py-2 px-3">
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
                                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
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
                                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                                >
                                  {PLACES.map((spot) => (
                                    <option key={spot} value={spot}>
                                      {spot}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={cfg.cat}
                                onChange={(e) =>
                                  setPayeeOverrides((prev) => ({
                                    ...prev,
                                    [g.payee]: { ...cfg, cat: e.target.value as ExpenseCategory },
                                  }))
                                }
                                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                              >
                                {CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={cfg.mode}
                                onChange={(e) =>
                                  setPayeeOverrides((prev) => ({
                                    ...prev,
                                    [g.payee]: {
                                      ...cfg,
                                      mode: e.target.value as 'UPI' | 'Card',
                                    },
                                  }))
                                }
                                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono"
                              >
                                <option value="UPI">UPI</option>
                                <option value="Card">Card</option>
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

        {/* TAB 4: EDITABLE TRANSACTIONS LEDGER WITH RETROSPECTIVE MEMORY */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3 bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <input
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Search merchant, note, place, or date..."
                  className="bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none w-full"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberEdits}
                    onChange={(e) => setRememberEdits(e.target.checked)}
                    className="rounded border-zinc-700"
                  />
                  <span>Auto-update & remember all from same payee when edited</span>
                </label>

                <button
                  onClick={reapplyAliasesToExisting}
                  className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-950 hover:bg-zinc-200 px-3 py-1 rounded text-xs font-medium transition"
                  title="Fixes accidental SU tags on bank rows and maps Vending Brothers, Namonarayan, etc."
                >
                  <Sparkles className="w-3.5 h-3.5" /> Re-Run Smart Merchant Rules
                </button>

                {transactions.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('Clear all transactions?')) clearAllTransactions();
                    }}
                    className="text-xs text-zinc-500 hover:text-red-400 transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            <div className="border border-zinc-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[11px] bg-zinc-900/40">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Description (Editable)</th>
                    <th className="py-2.5 px-3">Spot / Source (Editable)</th>
                    <th className="py-2.5 px-3">Category (Editable)</th>
                    <th className="py-2.5 px-3">Mode (Editable)</th>
                    <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredLedger.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-900/30">
                      <td className="py-2 px-3 font-mono text-zinc-400 whitespace-nowrap">
                        <input
                          type="date"
                          value={t.date}
                          onChange={(e) => updateTransaction(t.id, { date: e.target.value }, false)}
                          className="bg-transparent font-mono text-xs text-zinc-400 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 font-medium text-zinc-200">
                        <div className="flex items-center gap-1.5">
                          {t.txType === 'CREDIT' ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          )}
                          <input
                            type="text"
                            value={t.name}
                            onChange={(e) =>
                              updateTransaction(t.id, { name: e.target.value }, false)
                            }
                            className="bg-transparent text-zinc-200 focus:bg-zinc-900 focus:outline-none px-1 py-0.5 rounded w-full"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        {t.txType === 'CREDIT' ? (
                          <select
                            value={t.inflowCat || 'Parent Top-up'}
                            onChange={(e) =>
                              updateTransaction(
                                t.id,
                                { inflowCat: e.target.value as InflowCategory },
                                rememberEdits
                              )
                            }
                            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
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
                            onChange={(e) =>
                              updateTransaction(
                                t.id,
                                { place: e.target.value },
                                rememberEdits
                              )
                            }
                            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                          >
                            {PLACES.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={t.cat}
                          onChange={(e) =>
                            updateTransaction(
                              t.id,
                              { cat: e.target.value as ExpenseCategory },
                              rememberEdits
                            )
                          }
                          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={t.mode}
                          onChange={(e) =>
                            updateTransaction(
                              t.id,
                              { mode: e.target.value as PaymentMode },
                              false
                            )
                          }
                          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300"
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
                      <td className="py-2 px-3 text-right font-mono font-medium whitespace-nowrap">
                        <input
                          type="number"
                          step="0.01"
                          value={t.price}
                          onChange={(e) =>
                            updateTransaction(
                              t.id,
                              { price: parseFloat(e.target.value) || 0 },
                              false
                            )
                          }
                          className={`bg-transparent text-right font-mono w-20 focus:bg-zinc-900 focus:outline-none px-1 rounded ${t.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-100'
                            }`}
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => deleteTransaction(t.id)}
                          className="text-zinc-600 hover:text-red-400 transition"
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

        {/* TAB 5: REAL-TIME CLOUD SYNC & HOSTING */}
        {activeTab === 'cloud' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-zinc-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-zinc-300" />
                <h2 className="text-sm font-medium text-zinc-100">
                  Supabase Real-Time Cloud Memory
                </h2>
              </div>
              <p className="text-xs text-zinc-500">
                Connect a free Supabase table so your transactions and merchant memory sync between your laptop and Android phone automatically.
              </p>

              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Supabase Project URL (https://xyz.supabase.co)"
                  value={cloudUrl}
                  onChange={(e) => setCloudCredentials(e.target.value, cloudKey)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs font-mono"
                />
                <input
                  type="password"
                  placeholder="Supabase Anon Public Key"
                  value={cloudKey}
                  onChange={(e) => setCloudCredentials(cloudUrl, e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      const msg = await pushToCloud();
                      setSyncStatus(msg);
                    } catch (e: any) {
                      setSyncStatus(e.message);
                    }
                  }}
                  className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200 px-3.5 py-1.5 rounded-md text-xs font-medium transition"
                >
                  Push to Cloud
                </button>
                <button
                  onClick={async () => {
                    try {
                      const msg = await pullFromCloud();
                      setSyncStatus(msg);
                    } catch (e: any) {
                      setSyncStatus(e.message);
                    }
                  }}
                  className="bg-zinc-800 text-zinc-200 hover:bg-zinc-700 px-3.5 py-1.5 rounded-md text-xs font-medium transition"
                >
                  Pull from Cloud
                </button>
                {lastSyncedAt && (
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Last: {lastSyncedAt}
                  </span>
                )}
              </div>
              {syncStatus && <p className="text-xs text-zinc-400 font-mono">{syncStatus}</p>}
            </div>

            <div className="border border-zinc-800 rounded-lg p-5 space-y-3">
              <h2 className="text-sm font-medium text-zinc-100">
                1-Command Live Hosting (Vercel)
              </h2>
              <p className="text-xs text-zinc-500">
                Run this single command in your Antigravity terminal to deploy a live HTTPS URL for your Android phone:
              </p>
              <pre className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs font-mono text-zinc-300 overflow-x-auto">
                npx vercel --prod
              </pre>
              <p className="text-xs text-zinc-500">
                Once deployed, open your `.vercel.app` link in Chrome on Android and tap{' '}
                <strong className="text-zinc-300">Add to Home Screen</strong>.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}