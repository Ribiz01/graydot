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
import { TrendingDown, TrendingUp, Users, Star, FileText } from "lucide-react";
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

const monthlyConfig = {
  revenue: { label: "Revenue", color: "hsl(var(--chart-2))" },
  washes: { label: "Completed washes", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function monthWindows(key: string) {
  const [year, month] = key.split("-").map(Number);
  const now = new Date();
  const isCurrentMonth = key === monthKey(now);
  const start = new Date(year, month - 1, 1);
  const end = isCurrentMonth ? now : new Date(year, month, 0, 23, 59, 59, 999);
  const comparisonStart = new Date(year, month - 2, 1);
  const comparisonEnd = isCurrentMonth
    ? new Date(
        comparisonStart.getFullYear(),
        comparisonStart.getMonth(),
        Math.min(now.getDate(), new Date(comparisonStart.getFullYear(), comparisonStart.getMonth() + 1, 0).getDate()),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds(),
      )
    : new Date(year, month - 1, 0, 23, 59, 59, 999);
  const trendStart = new Date(year, month - 12, 1);

  return { start, end, comparisonStart, comparisonEnd, trendStart };
}

function changeLabel(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "New vs previous month" : "No change vs previous month";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}% vs previous month`;
}

function changeClass(current: number, previous: number, lowerIsBetter = false) {
  if (current === previous) return "text-muted-foreground";
  const movedInPreferredDirection = lowerIsBetter ? current < previous : current > previous;
  return movedInPreferredDirection ? "text-emerald-600" : "text-destructive";
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
<h1>Graydot Carwash & Auto Detailing — Revenue Report</h1>
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

<div class="footer">Generated ${new Date().toLocaleString()} — Graydot Carwash & Auto Detailing</div>
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
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()));
  const maxMonth = monthKey(new Date());
  const reportWindow = useMemo(() => monthWindows(selectedMonth), [selectedMonth]);

  // ── Transactions for the selected month and the 12-month trend ───────────────
  const txQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, "transactions"),
      where("timestamp", ">=", reportWindow.trendStart.toISOString()),
      where("timestamp", "<=", reportWindow.end.toISOString()),
      orderBy("timestamp", "desc")
    );
  }, [firestore, reportWindow]);
  const { data: reportTransactions, isLoading: txLoading } = useCollection<Transaction>(txQuery);

  const transactions = useMemo(
    () => (reportTransactions ?? []).filter(transaction => {
      const timestamp = new Date(transaction.timestamp).getTime();
      return timestamp >= reportWindow.start.getTime() && timestamp <= reportWindow.end.getTime();
    }),
    [reportTransactions, reportWindow]
  );

  const previousTransactions = useMemo(
    () => (reportTransactions ?? []).filter(transaction => {
      const timestamp = new Date(transaction.timestamp).getTime();
      return timestamp >= reportWindow.comparisonStart.getTime() && timestamp <= reportWindow.comparisonEnd.getTime();
    }),
    [reportTransactions, reportWindow]
  );

  // ── Customers ────────────────────────────────────────────────────────────────
  const custQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, "customers"), orderBy("totalVisits", "desc")) : null),
    [firestore]
  );
  const { data: customers, isLoading: custLoading } = useCollection<Customer>(custQuery);

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const completed = useMemo(() => transactions.filter(t => t.status === "Completed"), [transactions]);
  const previousCompleted = useMemo(
    () => previousTransactions.filter(t => t.status === "Completed"),
    [previousTransactions]
  );

  const totalRevenue  = useMemo(() => completed.reduce((a, t) => a + t.totalAmount, 0), [completed]);
  const previousRevenue = useMemo(() => previousCompleted.reduce((a, t) => a + t.totalAmount, 0), [previousCompleted]);
  const cashTotal     = useMemo(() => completed.filter(t => t.payment.method === "Cash").reduce((a, t) => a + t.totalAmount, 0), [completed]);
  const momoTotal     = useMemo(() => completed.filter(t => t.payment.method === "Mobile Money").reduce((a, t) => a + t.totalAmount, 0), [completed]);
  const corpTotal     = useMemo(() => completed.filter(t => t.payment.method === "Corporate Account").reduce((a, t) => a + t.totalAmount, 0), [completed]);
  const previousCashTotal = useMemo(() => previousCompleted.filter(t => t.payment.method === "Cash").reduce((a, t) => a + t.totalAmount, 0), [previousCompleted]);
  const previousMomoTotal = useMemo(() => previousCompleted.filter(t => t.payment.method === "Mobile Money").reduce((a, t) => a + t.totalAmount, 0), [previousCompleted]);
  const previousCorpTotal = useMemo(() => previousCompleted.filter(t => t.payment.method === "Corporate Account").reduce((a, t) => a + t.totalAmount, 0), [previousCompleted]);

  const monthlyStats = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(reportWindow.start.getFullYear(), reportWindow.start.getMonth() - 11 + index, 1);
      return { key: monthKey(date), label: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), revenue: 0, washes: 0 };
    });
    const monthByKey = new Map(months.map(month => [month.key, month]));
    for (const transaction of reportTransactions ?? []) {
      const month = monthByKey.get(monthKey(new Date(transaction.timestamp)));
      if (!month || transaction.status !== "Completed") continue;
      month.revenue += transaction.totalAmount;
      month.washes += 1;
    }
    return months;
  }, [reportTransactions, reportWindow]);

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
  const uniqueVehicles = useMemo(
    () => new Set(completed.map(transaction => transaction.licensePlate.trim().toUpperCase()).filter(Boolean)).size,
    [completed]
  );
  const completionRate = transactions.length > 0 ? completed.length / transactions.length * 100 : 0;
  const previousCompletionRate = previousTransactions.length > 0 ? previousCompleted.length / previousTransactions.length * 100 : 0;
  const averageTicket = completed.length > 0 ? totalRevenue / completed.length : 0;
  const previousAverageTicket = previousCompleted.length > 0 ? previousRevenue / previousCompleted.length : 0;
  const pendingCount = transactions.filter(transaction => transaction.status === "Pending Payment").length;
  const previousPendingCount = previousTransactions.filter(transaction => transaction.status === "Pending Payment").length;
  const voidedCount = transactions.filter(transaction => transaction.status === "Voided").length;
  const previousVoidedCount = previousTransactions.filter(transaction => transaction.status === "Voided").length;
  const comparisonData = [
    { label: "Revenue", value: totalRevenue, previous: previousRevenue, formatter: formatCurrency },
    { label: "Completed washes", value: completed.length, previous: previousCompleted.length, formatter: (value: number) => value.toLocaleString() },
    { label: "Average ticket", value: averageTicket, previous: previousAverageTicket, formatter: formatCurrency },
    { label: "Completion rate", value: completionRate, previous: previousCompletionRate, formatter: (value: number) => `${value.toFixed(1)}%` },
    { label: "Transactions recorded", value: transactions.length, previous: previousTransactions.length, formatter: (value: number) => value.toLocaleString() },
    { label: "Pending payment", value: pendingCount, previous: previousPendingCount, formatter: (value: number) => value.toLocaleString(), lowerIsBetter: true },
    { label: "Voided transactions", value: voidedCount, previous: previousVoidedCount, formatter: (value: number) => value.toLocaleString(), lowerIsBetter: true },
  ];
  const reportStartDate = localDateString(reportWindow.start);
  const reportEndDate = localDateString(reportWindow.end);

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Reports</h1>
          <p className="text-sm text-muted-foreground">Performance, month-over-month movement, and business KPIs.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="report-month" className="text-sm text-muted-foreground">Report month</label>
          <Input
            id="report-month"
            type="month"
            value={selectedMonth}
            max={maxMonth}
            onChange={event => setSelectedMonth(event.target.value)}
            className="w-[170px]"
          />
          <Button
            size="sm"
            variant="default"
            onClick={() => exportPdf(reportStartDate, reportEndDate, serviceStats, totalRevenue, cashTotal, momoTotal, corpTotal, completed.length)}
          >
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3 max-w-xl">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Business Overview
          </TabsTrigger>
          <TabsTrigger value="services" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Service Analysis
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Customer Insights
          </TabsTrigger>
        </TabsList>

        {/* ── BUSINESS OVERVIEW ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{monthLabel(selectedMonth)} at a glance</CardTitle>
              <p className="text-sm text-muted-foreground">
                {selectedMonth === maxMonth
                  ? "Month-to-date compared with the same dates last month."
                  : "Full month compared with the previous full month."}
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {comparisonData.map(metric => (
                <div key={metric.label} className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
                  {txLoading ? <Skeleton className="mt-2 h-8 w-32" /> : (
                    <p className="mt-2 text-2xl font-bold">{metric.formatter(metric.value)}</p>
                  )}
                  <p className={`mt-1 flex items-center gap-1 text-xs ${changeClass(metric.value, metric.previous, metric.lowerIsBetter)}`}>
                    {!txLoading && (metric.value >= metric.previous
                      ? <TrendingUp className="h-3.5 w-3.5" />
                      : <TrendingDown className="h-3.5 w-3.5" />)}
                    {metric.label === "Completion rate"
                      ? `${(metric.value - metric.previous) > 0 ? "+" : ""}${(metric.value - metric.previous).toFixed(1)} percentage points vs previous month`
                      : changeLabel(metric.value, metric.previous)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Unique vehicles", value: uniqueVehicles.toLocaleString(), sub: "Vehicles served this month" },
              { label: "Transactions recorded", value: transactions.length.toLocaleString(), sub: "Completed, pending, and voided" },
              { label: "Pending payment", value: pendingCount.toLocaleString(), sub: "Awaiting payment" },
              { label: "Voided transactions", value: voidedCount.toLocaleString(), sub: "Excluded from revenue" },
              { label: "Cash revenue", value: formatCurrency(cashTotal), sub: totalRevenue > 0 ? `${(cashTotal / totalRevenue * 100).toFixed(1)}% of revenue` : "No completed revenue" },
              { label: "Mobile money revenue", value: formatCurrency(momoTotal), sub: totalRevenue > 0 ? `${(momoTotal / totalRevenue * 100).toFixed(1)}% of revenue` : "No completed revenue" },
              { label: "Corporate revenue", value: formatCurrency(corpTotal), sub: totalRevenue > 0 ? `${(corpTotal / totalRevenue * 100).toFixed(1)}% of revenue` : "No completed revenue" },
            ].map(metric => (
              <Card key={metric.label}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {txLoading ? <Skeleton className="h-8 w-28" /> : <p className="text-2xl font-bold">{metric.value}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{metric.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>12-month business trend</CardTitle>
              <p className="text-sm text-muted-foreground">Completed-wash revenue and volume by month.</p>
            </CardHeader>
            <CardContent>
              {txLoading ? <Skeleton className="h-[300px] w-full" /> : (
                <ChartContainer config={monthlyConfig} className="min-h-[300px] w-full">
                  <BarChart accessibilityLayer data={monthlyStats}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} tickMargin={8} axisLine={false} />
                    <YAxis yAxisId="revenue" tickFormatter={value => formatCurrency(Number(value))} />
                    <YAxis yAxisId="washes" orientation="right" allowDecimals={false} />
                    <ChartTooltip
                      content={<ChartTooltipContent formatter={(value, name) => [
                        name === "revenue" ? formatCurrency(Number(value)) : Number(value).toLocaleString(),
                        name === "revenue" ? "Revenue" : "Completed washes",
                      ]} />}
                    />
                    <Bar yAxisId="revenue" dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                    <Bar yAxisId="washes" dataKey="washes" fill="var(--color-washes)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Month-over-month comparison</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead className="text-right">{selectedMonth === maxMonth ? "Month to date" : monthLabel(selectedMonth)}</TableHead>
                    <TableHead className="text-right">{selectedMonth === maxMonth ? "Previous month to date" : monthLabel(monthKey(reportWindow.comparisonStart))}</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.map(metric => (
                    <TableRow key={metric.label}>
                      <TableCell className="font-medium">{metric.label}</TableCell>
                      <TableCell className="text-right">{metric.formatter(metric.value)}</TableCell>
                      <TableCell className="text-right">{metric.formatter(metric.previous)}</TableCell>
                      <TableCell className={`text-right font-semibold ${changeClass(metric.value, metric.previous, metric.lowerIsBetter)}`}>
                        {metric.label === "Completion rate"
                          ? `${(metric.value - metric.previous) > 0 ? "+" : ""}${(metric.value - metric.previous).toFixed(1)} pp`
                          : changeLabel(metric.value, metric.previous)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Unique vehicles</TableCell>
                    <TableCell className="text-right">{uniqueVehicles}</TableCell>
                    <TableCell className="text-right">
                      {new Set(previousCompleted.map(transaction => transaction.licensePlate.trim().toUpperCase()).filter(Boolean)).size}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Cash / Mobile money / Corporate</TableCell>
                    <TableCell className="text-right">{formatCurrency(cashTotal)} / {formatCurrency(momoTotal)} / {formatCurrency(corpTotal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(previousCashTotal)} / {formatCurrency(previousMomoTotal)} / {formatCurrency(previousCorpTotal)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">See payment mix above</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SERVICE ANALYSIS ───────────────────────────────────────────────── */}
        <TabsContent value="services" className="space-y-6 mt-4">
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
