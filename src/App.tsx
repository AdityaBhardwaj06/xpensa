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
import { Trash2, ArrowUpRight, ArrowDownLeft, Upload } from 'lucide-react';

export default function App() {
  const {
    transactions,
    quickMode,
    setQuickMode,
    addTransaction,
    bulkAddTransactions,
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

  // Importer State
  const [parsedRows, setParsedRows] = useState<RawParsedRow[]>([]);
  const [importError, setImportError] = useState<string>('');
  const [payeeOverrides, setPayeeOverrides] = useState<
    Record<string, { place: string; cat: ExpenseCategory; mode: PaymentMode; inflowCat?: InflowCategory }>
  >({});

  // Manual Inflow State
  const [inflowAmt, setInflowAmt] = useState('');
  const [inflowSource, setInflowSource] = useState<InflowCategory>('Parent Top-up');
  const [inflowNote, setInflowNote] = useState('');

  // Android MacroDroid Deep-Link Handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const amt = parseFloat(params.get('amt') || '0');
    const merchant = params.get('merchant');
    const mode = (params.get('mode') as PaymentMode) || 'UPI';
    if (amt > 0 && merchant) {
      const matched = matchPayeeToAlias(merchant, 'DEBIT');
      addTransaction({
        date: new Date().toISOString().slice(0, 10),
        name: matched.place !== 'Other' ? `${matched.place} · ${merchant}` : merchant,
        price: amt,
        txType: 'DEBIT',
        mode: mode || matched.mode,
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

  // Distinct YYYY-MM months present in actual data
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => {
      if (t.date && t.date.length >= 7) set.add(t.date.slice(0, 7));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  // Rolling Liquid Wallet Stats
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
    const liquidBalance = totalCredits - totalOOPDebits;

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
  }, [transactions]);

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

  // Breakdown by Place and Category
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
    const matched = matchPayeeToAlias(shorthand, 'DEBIT');

    const cleanName =
      shorthand
        .replace(/\b(su|upi|id|swd|cash|parents|split)\b/gi, '')
        .replace(/\d+(?:\.\d{1,2})?/, '')
        .trim() || matched.place;

    addTransaction({
      date: new Date().toISOString().slice(0, 10),
      name: cleanName,
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
          const matched = matchPayeeToAlias(r.payee, r.txType);
          initialOverrides[r.payee] = {
            place: matched.place,
            cat: matched.cat,
            mode: matched.mode,
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
        mode: cfg.mode,
        txType: 'DEBIT',
        inflowCat: cfg.inflowCat,
      });
    });

    const toCommit = parsedRows.map((r) => {
      const cfg = payeeOverrides[r.payee] || {
        place: 'Other',
        cat: 'Food' as ExpenseCategory,
        mode: 'UPI' as PaymentMode,
        inflowCat: 'Parent Top-up' as InflowCategory,
      };
      return {
        date: r.date,
        name: r.note ? `${r.payee} · ${r.note}` : r.payee,
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
    setParsedRows([]);
    setActiveTab('overview');
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased selection:bg-zinc-800">
      {/* Minimal Top Header */}
      <header className="border-b border-zinc-800/80 bg-[#09090b]/95 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
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
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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

          <div className="hidden sm:flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-zinc-500 mr-1.5">LIQUID BAL</span>
              <span className="text-zinc-100 font-medium">₹{fmt(walletStats.liquidBalance)}</span>
            </div>
            <span className="text-zinc-800">|</span>
            <div>
              <span className="text-zinc-500 mr-1.5">BURN</span>
              <span className="text-zinc-300">₹{Math.round(walletStats.dailyBurn)}/d</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {transactions.length === 0 && (
              <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center space-y-3">
                <p className="text-sm text-zinc-300 font-medium">
                  Your ledger is clean and ready for your August statement.
                </p>
                <p className="text-xs text-zinc-500 max-w-md mx-auto">
                  Upload your delimited .txt HDFC statement in the Statement Import tab to populate your inflows and campus spend.
                </p>
                <button
                  onClick={() => setActiveTab('import')}
                  className="mt-2 inline-flex items-center gap-2 bg-zinc-100 text-zinc-950 px-3.5 py-1.5 rounded-md text-xs font-medium hover:bg-zinc-200 transition"
                >
                  <Upload className="w-3.5 h-3.5" /> Import HDFC .txt Statement
                </button>
              </div>
            )}

            {/* Filter Bar */}
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
                    className={`px-3 py-1 text-xs font-medium rounded-sm transition ${
                      bucketScope === b.id
                        ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
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
                  className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
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
                  Wallet left: ₹{fmt(walletStats.liquidBalance)}
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
              {/* By Payment Mode (Individual View) */}
              <div className="border border-zinc-800/90 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    By Payment Mode
                  </h3>
                  <span className="text-[11px] text-zinc-500">Click to isolate</span>
                </div>
                <div className="space-y-2.5">
                  {breakdowns.modes.length === 0 && (
                    <p className="text-xs text-zinc-600">No data in period</p>
                  )}
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
                          <div
                            className="h-full bg-zinc-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By Campus Place / Merchant */}
              <div className="border border-zinc-800/90 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Top Places & Vendors
                  </h3>
                  <span className="text-[11px] text-zinc-500">Active view</span>
                </div>
                <div className="space-y-2.5">
                  {breakdowns.places.length === 0 && (
                    <p className="text-xs text-zinc-600">No data in period</p>
                  )}
                  {breakdowns.places.slice(0, 7).map(([place, info]) => {
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
                          <div
                            className="h-full bg-zinc-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By Basic Category */}
              <div className="border border-zinc-800/90 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    By Category
                  </h3>
                  <span className="text-[11px] text-zinc-500">Active view</span>
                </div>
                <div className="space-y-2.5">
                  {breakdowns.categories.length === 0 && (
                    <p className="text-xs text-zinc-600">No data in period</p>
                  )}
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
                          <div
                            className="h-full bg-zinc-400"
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
          <div className="space-y-6">
            {/* Command Bar */}
            <form
              onSubmit={handleShorthandSubmit}
              className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/40 space-y-2"
            >
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-zinc-300">
                  Command Entry
                </label>
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

            {/* Mode + Campus Presets */}
            <div className="border border-zinc-800 rounded-lg p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Default Payment Mode
                </span>
                <div className="inline-flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-md">
                  {(['UPI', 'SU', 'ID', 'Cash', 'Card', 'Parents'] as PaymentMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setQuickMode(m)}
                      className={`px-3 py-1 text-xs font-mono font-medium rounded-sm transition ${
                        quickMode === m
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

            {/* Record Inflow (Parents / Relative Gift) */}
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
                  <option value="Parent Top-up">Parent Top-up</option>
                  <option value="Relative / Gift">Relative / Gift</option>
                  <option value="Split Reimbursement">Split Reimbursement</option>
                  <option value="Refund / Reversal">Refund / Reversal</option>
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

        {/* TAB 3: HDFC DELIMITED TXT / EXCEL IMPORTER */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <div className="border border-zinc-800 rounded-lg p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-sm font-medium text-zinc-100">
                    HDFC Delimited (.txt / .csv / .xls) & SU Statement Importer
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Parsed locally in browser memory. Account numbers, IFSC codes, and closing balances are automatically stripped.
                  </p>
                </div>
              </div>

              <input
                type="file"
                accept=".txt,.csv,.xls,.xlsx"
                onChange={handleFileUpload}
                className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 file:font-medium hover:file:bg-zinc-800 cursor-pointer"
              />

              {importError && (
                <p className="text-xs text-red-400 font-mono">{importError}</p>
              )}
            </div>

            {uniquePayeeGroups.length > 0 && (
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-300">
                      Unique Payee Mapping ({uniquePayeeGroups.length} payees · {parsedRows.length} rows)
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Assign each payee once below to categorize all matching transactions automatically.
                    </p>
                  </div>
                  <button
                    onClick={commitBulkImport}
                    className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200 px-4 py-1.5 rounded-md font-medium text-xs transition"
                  >
                    Import {parsedRows.length} Transactions
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
                        <th className="py-2.5 px-3">Mode</th>
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
                                  <option value="Parent Top-up">Parent Top-up</option>
                                  <option value="Relative / Gift">Relative / Gift</option>
                                  <option value="Split Reimbursement">Split Reimbursement</option>
                                  <option value="Refund / Reversal">Refund / Reversal</option>
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
                                  {[
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
                                    "Domino's",
                                    'Amazon',
                                    'Pilani / Local',
                                    'Hostel / Campus',
                                    'Other',
                                  ].map((spot) => (
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
                                {[
                                  'Food',
                                  'Essentials',
                                  'Stationery',
                                  'Entertainment',
                                  'Gift, treat',
                                  'Transportation',
                                  'Health',
                                  'Miscellaneous',
                                ].map((c) => (
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
                                    [g.payee]: { ...cfg, mode: e.target.value as PaymentMode },
                                  }))
                                }
                                className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono"
                              >
                                <option value="UPI">UPI</option>
                                <option value="SU">SU</option>
                                <option value="ID">ID</option>
                                <option value="Card">Card</option>
                                <option value="Parents">Parents</option>
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

        {/* TAB 4: FULL LEDGER */}
        {activeTab === 'ledger' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-500 font-mono">
                Showing {transactions.length} entries
              </span>
              {transactions.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear all transactions from local storage?')) {
                      clearAllTransactions();
                    }
                  }}
                  className="text-xs text-zinc-500 hover:text-red-400 transition"
                >
                  Clear All Data
                </button>
              )}
            </div>

            <div className="border border-zinc-800 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[11px] bg-zinc-900/40">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Spot / Source</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-900/30">
                      <td className="py-2.5 px-3 font-mono text-zinc-400 whitespace-nowrap">
                        {t.date}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-zinc-200 flex items-center gap-1.5">
                        {t.txType === 'CREDIT' ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        )}
                        <span>{t.name}</span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400">
                        {t.txType === 'CREDIT' ? t.inflowCat : t.place}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500">{t.cat}</td>
                      <td className="py-2.5 px-3 font-mono text-zinc-300">{t.mode}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-medium whitespace-nowrap ${
                          t.txType === 'CREDIT' ? 'text-emerald-400' : 'text-zinc-100'
                        }`}
                      >
                        {t.txType === 'CREDIT' ? '+' : '-'}₹{fmt(t.price)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
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
      </main>
    </div>
  );
}