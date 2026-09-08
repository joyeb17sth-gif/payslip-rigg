import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, Calculator, BookOpen, Percent, AlertTriangle } from "lucide-react";
import Link from "next/link";
import PayCycleCalendar from "@/components/PayCycleCalendar";

export default function Home() {
  const tools = [
    { name: 'Payslip Generator', desc: 'Calculate payslips from timesheets.', href: '/payslips', icon: Receipt, color: 'text-teal-600' },
    { name: 'Rates Manager', desc: 'Edit contractor rates and codes.', href: '/rates', icon: Percent, color: 'text-indigo-600' },
    { name: 'Hours Calculator', desc: 'Calculate duration from Start/End times.', href: '/hours', icon: Calculator, color: 'text-blue-600' },
    { name: 'Training Tracker', desc: 'Track 3-week training completions.', href: '/training', icon: BookOpen, color: 'text-orange-600' },
    { name: 'Exceptions', desc: 'Manage shortfalls and exceeds.', href: '/exceptions', icon: AlertTriangle, color: 'text-rose-600' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to the Payslip Rigg platform.</p>
      </div>

      {/* Unified Pay Cycle Calendar */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <PayCycleCalendar />
        </CardContent>
      </Card>

      {/* Navigation Tools */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tools</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.name} href={tool.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{tool.name}</CardTitle>
                    <Icon className={`h-4 w-4 ${tool.color}`} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{tool.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
