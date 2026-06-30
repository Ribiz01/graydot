"use client";

import { useState, useMemo } from "react";
import { collection, query, where, orderBy } from "firebase/firestore";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { useCollection } from "@/firebase/firestore/use-collection";
import type { Transaction, Customer } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Star, FileText } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
} from "recharts";

const tierColors: Record<string, string> = {
  Platinum: "border-purple-400 text-purple-600",
  Gold:     "border-amber-400 text-amber-600",
  Silver:   "border-slate-400 text-slate-600",
  Bronze:   "border-orange-300 text-orange-700",
};

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const barConfig = {
  count:   { label: "Washes",  color: "hsl(var(--primary))" },
  revenue: { label: "Revenue", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function periodRange(period: "day" | "week" | "month"): { start: string; end: string } {
  const today = new Date();
  if (period === "day") {
    return { start: isoDate(today), end: isoDate(today) };
  }
  if (period === "week") {
    const mon = new Date(today);
    mon.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    return { start: isoDate(mon), end: isoDate(today) };
  }
  // month
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: isoDate(first), end: isoDate(today) };
}

function exportPdf(
  startDate: string,
  endDate: string,
  serviceStats: { name: string; count: number; revenue: number }[],
  totalRevenue: number,
  cashTotal: number,
  momoTotal: number,
  corpTotal: number,
  txCount: number,
) {
  const fmt = (n: number) => `ZMW ${(n / 100).toFixed(2)}`;
  const pct = (n: number) => totalRevenue > 0 ? `${((n / totalRevenue) * 100).toFixed(1)}%` : "—";
  const dateLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

  const serviceRows = serviceStats.map(s => `
    <tr>
      <td>${s.name}</td>
      <td class="num">${s.count}</td>
      <td class="num">${fmt(s.revenue)}</td>
      <td class="num">${totalRevenue > 0 ? ((s.revenue / totalRevenue) * 100).toFixed(1) + "%" : "—"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Revenue Report — ${dateLabel}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; padding: 32px; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #666; margin: 0 0 24px; font-size: 13px; }
  h2 { font-size: 15px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 24px 0 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #f0f0f0; text-align: left; padding: 6px 8px; font-size: 12px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  .num { text-align: right; }
  .total-row td { font-weight: bold; background: #f9f9f9; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 8px; }
  .stat { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; }
  .stat-label { font-size: 11px; color: #666; margin-bottom: 4px; }
  .stat-value { font-size: 20px; font-weight: bold; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<h1>Tee-Dot Car Care Express — Revenue Report</h1>
<p class="sub">Period: ${dateLabel} &nbsp;|&nbsp; ${txCount} completed transaction${txCount !== 1 ? "s" : ""}</p>

<h2>Revenue Summary</h2>
<div class="grid">
  <div class="stat">
    <div class="stat-label">Total Revenue</div>
    <div class="stat-value">${fmt(totalRevenue)}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Cash</div>
    <div class="stat-value">${fmt(cashTotal)}</div>
    <div class="stat-label">${pct(cashTotal)}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Mobile Money</div>
    <div class="stat-value">${fmt(momoTotal)}</div>
    <div class="stat-label">${pct(momoTotal)}</div>
  </div>
</div>

<h2>Payment Method Breakdown</h2>
<table>
  <thead><tr><th>Method</th><th class="num">Revenue</th><th class="num">Share</th></tr></thead>
  <tbody>
    <tr><td>Cash</td><td class="num">${fmt(cashTotal)}</td><td class="num">${pct(cashTotal)}</td></tr>
    <tr><td>Mobile Money</td><td class="num">${fmt(momoTotal)}</td><td class="num">${pct(momoTotal)}</td></tr>
    <tr><td>Corporate Account (collected)</td><td class="num">${fmt(corpTotal)}</td><td class="num">${pct(corpTotal)}</td></tr>
    <tr class="total-row"><td>Total</td><td class="num">${fmt(totalRevenue)}</td><td class="num">100%</td></tr>
  </tbody>
</table>

<h2>Services Used</h2>
<table>
  <thead><tr><th>Service</th><th class="num">Washes</th><th class="num">Revenue</th><th class="num">% of Revenue</th></tr></thead>
  <tbody>
    ${serviceRows || '<tr><td colspan="4" style="color:#999">No completed services in this period.</td></tr>'}
  </tbody>
</table>

<div class="footer">Generated ${new Date().toLocaleString()} — Tee-Dot Car Care Express</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export function ReportsDashboard() {
  const firestore = useFirestore();
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date(); d.setDate(1);
    return isoDate(d);
  });
  const [endDate, setEndDate] = useState<string>(() => isoDate(new Date()));

  const setQuickPeriod = (p: "day" | "week" | "month") => {
    const { start, end } = periodRange(p);
    setStartDate(start);
    setEndDate(end);
  };

  // ── Transactions ─────────────────────────────────────────────────────────────
  const txQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end   = new Date(endDate);   end.setHours(23, 59, 59, 999);
    return query(
      collection(firestore, "transactions"),
      where("timestamp", ">=", start.toISOString()),
      where("timestamp", "<=", end.toISOString()),
      orderBy("timestamp", "desc")
    );
  }, [firestore, startDate, endDate]);
  const { data: transactions, isLoading: txLoading } = useCollection<Transaction>(txQuery);

  // ── Customers ────────────────────────────────────────────────────────────────
  const custQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, "customers"), orderBy("totalVisits", "desc")) : null),
    [firestore]
  );
  const { data: customers, isLoading: custLoading } = useCollection<Customer>(custQuery);

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const completed = useMemo(() => (transactions ?? []).filter(t => t.status === "Completed"), [transactions]);

  const totalRevenue  = useMemo(() => completed.reduce((a, t) => a + t.totalAmount, 0), [completed]);
  const cashTotal     = useMemo(() => completed.filter(t => t.payment.method === "Cash").reduce((a, t) => a + t.totalAmount, 0), [completed]);
  const momoTotal     = useMemo(() => completed.filter(t => t.payment.method === "Mobile Money").reduce((a, t) => a + t.totalAmount, 0), [completed]);
  const corpTotal     = useMemo(() => completed.filter(t => t.payment.method === "Corporate Account").reduce((a, t) => a + t.totalAmount, 0), [completed]);

  const serviceStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const tx of completed) {
      for (const s of tx.services) {
        if (!map[s.name]) map[s.name] = { count: 0, revenue: 0 };
        map[s.name].count++;
        map[s.name].revenue += s.price;
      }
    }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
  }, [completed]);

  const totalServiceRevenue = useMemo(() => serviceStats.reduce((a, s) => a + s.revenue, 0), [serviceStats]);
  const pieData = useMemo(() => serviceStats.map(s => ({ name: s.name, value: s.count })), [serviceStats]);

  const paymentPieData = useMemo(() => [
    { name: "Cash", value: cashTotal },
    { name: "Mobile Money", value: momoTotal },
    { name: "Corporate", value: corpTotal },
  ].filter(d => d.value > 0), [cashTotal, momoTotal, corpTotal]);

  const topByVisits = useMemo(() => (customers ?? []).slice(0, 10), [customers]);
  const topBySpend  = useMemo(() => [...(customers ?? [])].sort((a, b) => (b.totalSpendNgwe ?? 0) - (a.totalSpendNgwe ?? 0)).slice(0, 10), [customers]);

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setQuickPeriod("day")}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => setQuickPeriod("week")}>This Week</Button>
          <Button size="sm" variant="outline" onClick={() => setQuickPeriod("month")}>This Month</Button>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-[140px]" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-[140px]" />
          <Button
            size="sm"
            variant="default"
            onClick={() => exportPdf(startDate, endDate, serviceStats, totalRevenue, cashTotal, momoTotal, corpTotal, completed.length)}
          >
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="services">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="services" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Service Analysis
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Customer Insights
          </TabsTrigger>
        </TabsList>

        {/* ── SERVICE ANALYSIS ───────────────────────────────────────────────── */}
        <TabsContent value="services" className="space-y-6 mt-4">

          {/* Revenue summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total Revenue", value: totalRevenue, sub: `${completed.length} transactions` },
              { label: "Cash", value: cashTotal, sub: totalRevenue > 0 ? `${((cashTotal / totalRevenue) * 100).toFixed(1)}% of total` : "—" },
              { label: "Mobile Money", value: momoTotal, sub: totalRevenue > 0 ? `${((momoTotal / totalRevenue) * 100).toFixed(1)}% of total` : "—" },
              { label: "Corporate (Collected)", value: corpTotal, sub: totalRevenue > 0 ? `${((corpTotal / totalRevenue) * 100).toFixed(1)}% of total` : "—" },
            ].map(card => (
              <Card key={card.label}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {txLoading
                    ? <Skeleton className="h-8 w-28" />
                    : <div className="text-2xl font-bold">{formatCurrency(card.value)}</div>}
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Washes by Service</CardTitle></CardHeader>
              <CardContent>
                {txLoading ? <Skeleton className="h-[220px] w-full" /> : serviceStats.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No data for this period.</p>
                ) : (
                  <ChartContainer config={barConfig} className="min-h-[220px] w-full">
                    <BarChart accessibilityLayer data={serviceStats}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="name" tickLine={false} tickMargin={8} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Revenue Share by Payment Method</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center">
                {txLoading ? <Skeleton className="h-[220px] w-full" /> : paymentPieData.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">No data for this period.</p>
                ) : (
                  <PieChart width={280} height={220}>
                    <Pie
                      data={paymentPieData}
                      cx="50%" cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {paymentPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Services breakdown table */}
          <Card>
            <CardHeader><CardTitle>Service Breakdown</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Washes</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">% of Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txLoading && Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))}
                  {!txLoading && serviceStats.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No completed transactions in this period.</TableCell></TableRow>
                  )}
                  {!txLoading && serviceStats.map(s => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{s.count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(s.revenue)}</TableCell>
                      <TableCell className="text-right">
                        {totalServiceRevenue > 0 ? `${((s.revenue / totalServiceRevenue) * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CUSTOMER INSIGHTS ──────────────────────────────────────────────── */}
        <TabsContent value="customers" className="space-y-6 mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Most Frequent Customers</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {custLoading && Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 3 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))}
                    {!custLoading && topByVisits.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No customers yet.</TableCell></TableRow>
                    )}
                    {!custLoading && topByVisits.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.phoneNumber}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={tierColors[c.tier]}>
                            <Star className="mr-1 h-3 w-3" />{c.tier}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{c.totalVisits}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top Spenders</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Total Spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {custLoading && Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 3 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))}
                    {!custLoading && topBySpend.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No customers yet.</TableCell></TableRow>
                    )}
                    {!custLoading && topBySpend.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.phoneNumber}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={tierColors[c.tier]}>
                            <Star className="mr-1 h-3 w-3" />{c.tier}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(c.totalSpendNgwe ?? 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Visits — Top 10 Customers</CardTitle></CardHeader>
            <CardContent>
              {custLoading ? <Skeleton className="h-[220px] w-full" /> : topByVisits.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No customers yet.</p>
              ) : (
                <ChartContainer config={{ visits: { label: "Visits", color: "hsl(var(--primary))" } }} className="min-h-[220px] w-full">
                  <BarChart accessibilityLayer data={topByVisits.map(c => ({ name: c.name, visits: c.totalVisits }))}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} tickMargin={8} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="visits" fill="hsl(var(--primary))" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
