'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calculator, Receipt, Percent, BookOpen, AlertTriangle } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Payslip Generator', href: '/payslips', icon: Receipt },
    { name: 'Hours Calculator', href: '/hours', icon: Calculator },
    { name: 'Rates Manager', href: '/rates', icon: Percent },
    { name: 'Training Tracker', href: '/training', icon: BookOpen },
    { name: 'Exceptions', href: '/exceptions', icon: AlertTriangle },
  ];

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <div className="flex items-center gap-2.5 font-bold text-primary">
          <div className="h-7 w-7 rounded-lg bg-teal-600 text-white flex items-center justify-center text-sm font-bold shadow-xs">
            P
          </div>
          <span className="tracking-tight text-base">Payslip Rigg</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-1.5 px-3">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));

            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-teal-600 text-white font-semibold shadow-xs shadow-teal-600/25'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-foreground'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{link.name}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground text-center">Payslip Bot v2.0</p>
      </div>
    </div>
  );
}

