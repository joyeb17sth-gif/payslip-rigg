import Link from 'next/link';
import { Home, Calculator, Receipt, Percent, BookOpen, AlertTriangle } from 'lucide-react';

export default function Sidebar() {
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
        <div className="flex items-center gap-2 font-semibold text-primary">
          <div className="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">P</div>
          <span>Payslip Rigg</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-1 px-2">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.name}
                href={link.href}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground text-sidebar-foreground"
              >
                <Icon className="h-4 w-4" />
                {link.name}
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
