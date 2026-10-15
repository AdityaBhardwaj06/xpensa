import { LayoutDashboard, Zap, Upload, ReceiptText, Smartphone, User } from 'lucide-react';
import type { TabId } from '../constants/taxonomy';

interface MobileBottomNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

export function MobileBottomNav({ activeTab, onSelectTab }: MobileBottomNavProps) {
  const navItems: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'log', label: 'Quick Log', icon: Zap },
    { id: 'ledger', label: 'Ledger', icon: ReceiptText },
    { id: 'import', label: 'Import', icon: Upload },
    { id: 'auto', label: 'Auto', icon: Smartphone },
    { id: 'profile', label: 'My Tab', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 border-t border-zinc-800 backdrop-blur px-1 py-1.5 flex justify-around items-center">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-md transition ${
              activeTab === item.id ? 'text-zinc-100' : 'text-zinc-500'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}