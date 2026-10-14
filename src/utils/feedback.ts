import type { Transaction } from '../types/expense';

export type HapticStyle = 'light' | 'medium' | 'success' | 'warning' | 'error';

export function triggerHaptic(style: HapticStyle = 'light') {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return;
  try {
    switch (style) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(22);
        break;
      case 'success':
        navigator.vibrate([14, 45, 24]);
        break;
      case 'warning':
        navigator.vibrate([30, 50, 30]);
        break;
      case 'error':
        navigator.vibrate([50, 40, 50, 40, 60]);
        break;
    }
  } catch {
    // Ignore on browsers that block vibration without user gesture
  }
}

export function exportTransactionsToCSV(transactions: Transaction[]) {
  triggerHaptic('success');
  const headers = [
    'Date',
    'Type',
    'Description',
    'Amount_INR',
    'Payment_Mode',
    'Campus_Spot_or_Source',
    'Category',
    'Individuality',
    'Note',
  ];

  const rows = transactions.map((t) => [
    `"${t.date}"`,
    `"${t.txType}"`,
    `"${(t.name || '').replace(/"/g, '""')}"`,
    t.price.toFixed(2),
    `"${t.mode}"`,
    `"${t.txType === 'CREDIT' ? t.inflowCat || 'Inflow' : t.place}"`,
    `"${t.cat}"`,
    `"${t.indiv || 'Solo'}"`,
    `"${(t.note || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bits_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}