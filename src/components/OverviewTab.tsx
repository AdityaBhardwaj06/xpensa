import { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { useExpenseStore } from '../store/useExpenseStore';
import { getEffectiveSpend } from '../types/expense';
import type { Transaction } from '../types/expense';
import { triggerHaptic, exportTransactionsToCSV } from '../utils/feedback';
import type { NotifyFn } from '../constants/taxonomy';
import { fmt } from '../constants/taxonomy';

interface OverviewTabProps {
  notify: NotifyFn;
  onDrillDown: (opts: { place?: string; category?: string; date?: string }) => void;
}

export function OverviewTab({ notify, onDrillDown }: OverviewTabProps) {
  const { transactions, openingBalance, setOpeningBalance } = useExpenseStore();

  const [bucketScope, setBucketScope] = useState<'ALL' | 'OOP' | 'SU_ID' | 'PARENTS'>('ALL');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');

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
    const splitReimbursements = credits
      .filter((t) => t.inflowCat === 'Split Reimbursement')
      .reduce((acc, t) => acc + t.price, 0);

    const oopDebits = transactions.filter(
      (t) => t.txType === 'DEBIT' && ['UPI', 'Cash', 'Card'].includes(t.mode)
    );
    // Actual money that left your bank account
    const totalOOPOutflow = oopDebits.reduce((acc, t) => acc + t.price, 0);
    // Your true personal out-of-pocket spend (excludes friends' shares)
    const trueOOPPersonalSpend = oopDebits.reduce((acc, t) => acc + getEffectiveSpend(t), 0);

    // Total fronted for friends across all debits
    const allDebits = transactions.filter((t) => t.txType === 'DEBIT');
    const totalFrontedForFriends = allDebits.reduce(
      (acc, t) => acc + Math.max(0, t.price - getEffectiveSpend(t)),
      0
    );
    const netPendingFromFriends = Math.max(0, totalFrontedForFriends - splitReimbursements);

    const liquidBalance = openingBalance + totalCredits - totalOOPOutflow;

    const uniqueDays = new Set(oopDebits.map((t) => t.date)).size || 1;
    const dailyBurn = oopDebits.length > 0 ? trueOOPPersonalSpend / uniqueDays : 0;
    const runwayDays =
      dailyBurn > 0 && liquidBalance > 0 ? Math.round(liquidBalance / dailyBurn) : 0;

    return {
      totalCredits,
      parentInflows,
      splitReimbursements,
      totalOOPOutflow,
      trueOOPPersonalSpend,
      totalFrontedForFriends,
      netPendingFromFriends,
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

  // All analytics use getEffectiveSpend(t) so group bills never inflate your personal numbers
  const bucketTotals = useMemo(() => {
    const oop = periodDebits
      .filter((t) => ['UPI', 'Cash', 'Card'].includes(t.mode))
      .reduce((s, t) => s + getEffectiveSpend(t), 0);
    const su = periodDebits
      .filter((t) => t.mode === 'SU')
      .reduce((s, t) => s + getEffectiveSpend(t), 0);
    const id = periodDebits
      .filter((t) => t.mode === 'ID')
      .reduce((s, t) => s + getEffectiveSpend(t), 0);
    const activePersonalTotal = activeDebits.reduce((s, t) => s + getEffectiveSpend(t), 0);
    const activeGrossBillTotal = activeDebits.reduce((s, t) => s + t.price, 0);
    return {
      oop,
      su,
      id,
      su_id: su + id,
      activeTotal: activePersonalTotal,
      grossTotal: activeGrossBillTotal,
    };
  }, [periodDebits, activeDebits]);

  const breakdowns = useMemo(() => {
    const byPlace: Record<string, { sum: number; count: number }> = {};
    const byCat: Record<string, { sum: number; count: number }> = {};
    const byMode: Record<string, { sum: number; count: number }> = {};

    activeDebits.forEach((t) => {
      const spend = getEffectiveSpend(t);
      const p = t.place || 'Other';
      byPlace[p] = { sum: (byPlace[p]?.sum || 0) + spend, count: (byPlace[p]?.count || 0) + 1 };

      const c = t.cat || 'Miscellaneous';
      byCat[c] = { sum: (byCat[c]?.sum || 0) + spend, count: (byCat[c]?.count || 0) + 1 };
    });

    periodDebits.forEach((t) => {
      const spend = getEffectiveSpend(t);
      byMode[t.mode] = {
        sum: (byMode[t.mode]?.sum || 0) + spend,
        count: (byMode[t.mode]?.count || 0) + 1,
      };
    });

    return {
      places: Object.entries(byPlace).sort((a, b) => b[1].sum - a[1].sum),
      categories: Object.entries(byCat).sort((a, b) => b[1].sum - a[1].sum),
      modes: Object.entries(byMode).sort((a, b) => b[1].sum - a[1].sum),
    };
  }, [activeDebits, periodDebits]);

  const deepAnalytics = useMemo(() => {
    const byDate: Record<string, number> = {};
    activeDebits.forEach((t) => {
      byDate[t.date] = (byDate[t.date] || 0) + getEffectiveSpend(t);
    });
    const recentDates = Object.entries(byDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14);
    const maxDaily = Math.max(...recentDates.map((d) => d[1]), 1);

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
        const sum = matched.reduce((s, t) => s + getEffectiveSpend(t), 0);
        const count = matched.length;
        const avg = count > 0 ? sum / count : 0;
        const share = bucketTotals.activeTotal > 0 ? (sum / bucketTotals.activeTotal) * 100 : 0;
        return { ...h, count, sum, avg, share };
      })
      .filter((h) => h.count > 0)
      .sort((a, b) => b.sum - a.sum);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daySums = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    activeDebits.forEach((t) => {
      const d = new Date(t.date + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        const idx = d.getDay();
        daySums[idx] += getEffectiveSpend(t);
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

    const micro = activeDebits.filter((t) => getEffectiveSpend(t) <= 50);
    const mid = activeDebits.filter((t) => {
      const s = getEffectiveSpend(t);
      return s > 50 && s <= 200;
    });
    const bulk = activeDebits.filter((t) => getEffectiveSpend(t) > 200);

    const tiers = [
      {
        label: 'Micro (≤ ₹50)',
        count: micro.length,
        sum: micro.reduce((s, t) => s + getEffectiveSpend(t), 0),
      },
      {
        label: 'Mid-Ticket (₹51–₹200)',
        count: mid.length,
        sum: mid.reduce((s, t) => s + getEffectiveSpend(t), 0),
      },
      {
        label: 'High-Ticket (> ₹200)',
        count: bulk.length,
        sum: bulk.reduce((s, t) => s + getEffectiveSpend(t), 0),
      },
    ];

    return { recentDates, maxDaily, habits, weekdayStats, tiers };
  }, [activeDebits, bucketTotals.activeTotal]);

  return (
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

      {/* 4-Column Metric Strip (De-Inflated Personal Spend vs Group Splits) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-zinc-800/80 gap-px border border-zinc-800 rounded-lg overflow-hidden w-full">
        <div className="bg-[#09090b] p-3.5 sm:p-4">
          <div className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            True Personal Spend
          </div>
          <div className="text-lg sm:text-2xl font-mono font-semibold text-zinc-100 mt-1 truncate">
            ₹{fmt(bucketTotals.activeTotal)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5 font-mono truncate">
            {bucketTotals.grossTotal > bucketTotals.activeTotal
              ? `Gross Paid: ₹${fmt(bucketTotals.grossTotal)}`
              : `${activeDebits.length} txns · Avg ₹${Math.round(walletStats.dailyBurn)}/d`}
          </div>
        </div>

        <div className="bg-[#09090b] p-3.5 sm:p-4">
          <div className="text-[10px] sm:text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            Liquid Bank Balance
          </div>
          <div className="text-lg sm:text-2xl font-mono font-semibold text-zinc-100 mt-1 truncate">
            ₹{fmt(walletStats.liquidBalance)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5 font-mono truncate">
            My OOP: ₹{fmt(bucketTotals.oop)} ({walletStats.runwayDays}d left)
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
            Group Splits & Inflows
          </div>
          <div className="text-lg sm:text-2xl font-mono font-semibold text-emerald-400 mt-1 truncate">
            {walletStats.netPendingFromFriends > 0
              ? `₹${fmt(walletStats.netPendingFromFriends)} Owed`
              : `₹${fmt(walletStats.totalCredits)} In`}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5 font-mono truncate">
            Fronted ₹{fmt(walletStats.totalFrontedForFriends)} · Reimb ₹{fmt(walletStats.splitReimbursements)}
          </div>
        </div>
      </div>

      {/* Daily Spend Trajectory + Day-of-Week Intensity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 border border-zinc-800/90 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-300">
                Daily Personal Spend (Last 14 Active Days)
              </h3>
              <p className="text-[11px] text-zinc-500">
                Excludes friends' split shares · Tap any bar to inspect date
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
                      onDrillDown({ date });
                      notify(`Date: ${date}`, `Personal spend ₹${fmt(sum)}`, 'info');
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
              Personal Ticket Size Distribution
            </div>
            {deepAnalytics.tiers.map((tier) => (
              <div key={tier.label} className="flex justify-between items-center text-xs">
                <span className="text-zinc-300">
                  {tier.label} <span className="text-zinc-500 font-mono">({tier.count}x)</span>
                </span>
                <span className="font-mono text-zinc-200">₹{fmt(tier.sum)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Habit Frequency Inspector */}
      <div className="border border-zinc-800/90 rounded-lg overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-zinc-800/80 flex justify-between items-center">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-200">
              Campus Habit Frequency Inspector (True Personal Share)
            </h3>
            <p className="text-[11px] text-zinc-500">
              Tracks your real personal consumption across campus spots
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
                <th className="py-2.5 px-3 text-right">Your Avg Ticket</th>
                <th className="py-2.5 px-3 text-right">Share</th>
                <th className="py-2.5 px-3 text-right">Your True Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {deepAnalytics.habits.map((h) => (
                <tr key={h.id} className="hover:bg-zinc-900/30">
                  <td className="py-2.5 px-3 font-medium text-zinc-200">{h.name}</td>
                  <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">{h.spot}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-zinc-300">{h.count}x</td>
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

      {/* 3-Column Drilldown Breakdowns */}
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
              const total =
                periodDebits.reduce((s, t) => s + getEffectiveSpend(t), 0) || 1;
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
                  onClick={() => {
                    triggerHaptic('light');
                    onDrillDown({ place });
                    notify(`Filtered by ${place}`, 'Showing matching ledger entries', 'info');
                  }}
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
                  onClick={() => {
                    triggerHaptic('light');
                    onDrillDown({ category: cat });
                    notify(`Filtered by ${cat}`, 'Showing matching ledger entries', 'info');
                  }}
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
  );
}