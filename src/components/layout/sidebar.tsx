'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Calculator, 
  Receipt, 
  Percent, 
  BookOpen, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('payslip_sidebar_collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('payslip_sidebar_collapsed', String(next));
      return next;
    });
  };

  const links = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Payslip Generator', href: '/payslips', icon: Receipt },
    { name: 'Hours Calculator', href: '/hours', icon: Calculator },
    { name: 'Rates Manager', href: '/rates', icon: Percent },
    { name: 'Training Tracker', href: '/training', icon: BookOpen },
    { name: 'Exceptions', href: '/exceptions', icon: AlertTriangle },
  ];

  return (
    <aside 
      className={`flex h-screen flex-col border-r bg-sidebar transition-all duration-300 ease-in-out shrink-0 select-none ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className={`flex h-14 items-center border-b px-3 transition-all ${
        isCollapsed ? 'justify-center' : 'justify-between'
      }`}>
        {isCollapsed ? (
          <button
            onClick={toggleCollapsed}
            className="group relative h-8 w-8 rounded-lg bg-teal-600 text-white flex items-center justify-center text-sm font-bold shadow-xs hover:bg-teal-700 transition-all cursor-pointer"
            title="Click to expand menu"
            aria-label="Expand sidebar"
          >
            <span className="group-hover:hidden">P</span>
            <ChevronRight className="h-4 w-4 hidden group-hover:block" />
            <div className="absolute left-full ml-3 z-50 hidden group-hover:flex items-center px-2.5 py-1 text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md shadow-lg whitespace-nowrap pointer-events-none">
              Expand menu
            </div>
          </button>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2.5 font-bold text-primary group">
              <div className="h-7 w-7 rounded-lg bg-teal-600 text-white flex items-center justify-center text-sm font-bold shadow-xs group-hover:bg-teal-700 transition-colors">
                P
              </div>
              <span className="tracking-tight text-base truncate">Payslip Rigg</span>
            </Link>
            <button
              onClick={toggleCollapsed}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
              title="Collapse menu"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Nav Links */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        <nav className={`grid gap-1.5 ${isCollapsed ? 'px-2' : 'px-3'}`}>
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));

            if (isCollapsed) {
              return (
                <div key={link.name} className="relative group flex justify-center">
                  <Link
                    href={link.href}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                      isActive
                        ? 'bg-teal-600 text-white shadow-xs shadow-teal-600/25 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-foreground'
                    }`}
                    aria-label={link.name}
                  >
                    <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                    {isActive && (
                      <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    )}
                  </Link>
                  {/* Floating tooltip */}
                  <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 hidden group-hover:flex items-center px-2.5 py-1 text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md shadow-lg whitespace-nowrap pointer-events-none">
                    {link.name}
                  </div>
                </div>
              );
            }

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
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                <span className="truncate">{link.name}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div className={`border-t transition-all ${isCollapsed ? 'p-2 flex flex-col items-center' : 'p-3 flex items-center justify-between'}`}>
        {isCollapsed ? (
          <button
            onClick={toggleCollapsed}
            className="group relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Expand menu"
            aria-label="Expand menu"
          >
            <ChevronRight className="h-4 w-4" />
            <div className="absolute left-full ml-3 z-50 hidden group-hover:flex items-center px-2.5 py-1 text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md shadow-lg whitespace-nowrap pointer-events-none">
              Expand menu
            </div>
          </button>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">v2.0</p>
            <button
              onClick={toggleCollapsed}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Collapse menu"
              aria-label="Collapse menu"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Collapse</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
}


