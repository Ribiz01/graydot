"use client";

import { useState, useMemo } from "react";
import { collection, query, where, orderBy } from "firebase/firestore";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { useCollection } from "@/firebase/firestore/use-collection";
import type { Transaction, Customer, Expense } from "@/lib/types";
import { formatCurrency, getAmountReceived, getOutstandingBalance, isWashServed, localDateKey } from "@/lib/utils";
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

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function localDateString(date: Date) {
  return localDateKey(date);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function transactionDuration(transaction: Transaction) {
  const duration = transaction.washDurationSeconds ?? (
    transaction.startedAt && transaction.completedAt
      ? Math.max(0, Math.floor((Date.parse(transaction.completedAt) - Date.parse(transaction.startedAt)) / 1000))
      : null
  );
  if (duration === null) return "—";
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function transactionTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
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
  airtelTotal: number,
  otherMobileTotal: number,
  otherPaymentTotal: number,
  bankTransferTotal: number,
  expenseTotal: number,
  cashAvailable: number,
  outstandingTotal: number,
  detailedTransactions: Transaction[],
  expenseBreakdown: { source: string; amount: number }[],
) {
  const fmt = (n: number) => `ZMW ${(n / 100).toFixed(2)}`;
  const pct = (n: number) => totalRevenue > 0 ? `${((n / totalRevenue) * 100).toFixed(1)}%` : "—";
  const dateLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

  const serviceRows = serviceStats.map(s => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td class="num">${s.count}</td>
      <td class="num">${fmt(s.revenue)}</td>
      <td class="num">${totalRevenue > 0 ? ((s.revenue / totalRevenue) * 100).toFixed(1) + "%" : "—"}</td>
    </tr>`).join("");

  const transactionRows = detailedTransactions.map(transaction => {
    const photo = /^data:image\/(?:jpeg|png|webp);base64,/i.test(transaction.vehiclePhotoDataUri || "")
      ? `<img src="${transaction.vehiclePhotoDataUri}" alt="Vehicle ${escapeHtml(transaction.licensePlate)}" style="width:64px;height:44px;object-fit:cover"/>`
      : "—";
    const services = transaction.services.map(service => escapeHtml(service.name)).join(", ");
    const attendants = (transaction.assignedWashers || []).map(washer => escapeHtml(washer.name)).join(", ") || escapeHtml(transaction.washerName || "—");
    const outstanding = getOutstandingBalance(transaction);
    return `<tr>
      <td>${photo}</td>
      <td>${escapeHtml(transaction.licensePlate)}<br/>${escapeHtml([transaction.vehicleMake, transaction.vehicleModel].filter(Boolean).join(" ") || "—")}</td>
      <td>${services}</td><td>${attendants}</td>
      <td>${escapeHtml(transactionTime(transaction.startedAt || transaction.timestamp))} / ${escapeHtml(transactionTime(transaction.completedAt))}</td>
      <td>${escapeHtml(transactionDuration(transaction))}</td>
      <td class="num">${fmt(transaction.totalAmount)}</td>
      <td>${escapeHtml(transaction.payment.method)}<br/>${escapeHtml(transaction.status)}</td>
      <td class="num">${fmt(outstanding)}</td>
    </tr>`;
  }).join("");
  const expenseRows = expenseBreakdown.map(expense => `<tr><td>${escapeHtml(expense.source)}</td><td class="num">${fmt(expense.amount)}</td></tr>`).join("");

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
  .details { font-size: 9px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 8px; }
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
    <div class="stat-label">Airtel Money</div>
    <div class="stat-value">${fmt(airtelTotal)}</div>
    <div class="stat-label">${pct(airtelTotal)}</div>
  </div>
  <div class="stat">
    <div class="stat-label">Expenses</div>
    <div class="stat-value">${fmt(expenseTotal)}</div>
  </div>
</div>

<h2>Payment Method Breakdown</h2>
<table>
  <thead><tr><th>Method</th><th class="num">Revenue</th><th class="num">Share</th></tr></thead>
  <tbody>
    <tr><td>Cash</td><td class="num">${fmt(cashTotal)}</td><td class="num">${pct(cashTotal)}</td></tr>
    <tr><td>Airtel Money</td><td class="num">${fmt(airtelTotal)}</td><td class="num">${pct(airtelTotal)}</td></tr>
    <tr><td>Mobile Money</td><td class="num">${fmt(momoTotal)}</td><td class="num">${pct(momoTotal)}</td></tr>
    <tr><td>Corporate Account (collected)</td><td class="num">${fmt(corpTotal)}</td><td class="num">${pct(corpTotal)}</td></tr>
    <tr><td>Bank Transfer</td><td class="num">${fmt(bankTransferTotal)}</td><td class="num">${pct(bankTransferTotal)}</td></tr>
    <tr><td>Other</td><td class="num">${fmt(otherPaymentTotal)}</td><td class="num">${pct(otherPaymentTotal)}</td></tr>
    <tr class="total-row"><td>Total</td><td class="num">${fmt(totalRevenue)}</td><td class="num">100%</td></tr>
  </tbody>
</table>

<h2>Banking and Receivables</h2>
<table>
  <tbody>
    <tr><td>Cash available for banking (cash received less cash expenses)</td><td class="num">${fmt(cashAvailable)}</td></tr>
    <tr><td>Other mobile money receipts</td><td class="num">${fmt(otherMobileTotal)}</td></tr>
    <tr><td>Total expenses</td><td class="num">${fmt(expenseTotal)}</td></tr>
    <tr><td>Outstanding payments</td><td class="num">${fmt(outstandingTotal)}</td></tr>
  </tbody>
</table>

<h2>Expenses by Payment Source</h2>
<table>
  <thead><tr><th>Payment source</th><th class="num">Amount</th></tr></thead>
  <tbody>${expenseRows || '<tr><td colspan="2" style="color:#999">No expenses in this period.</td></tr>'}</tbody>
</table>

<h2>Services Used</h2>
<table>
  <thead><tr><th>Service</th><th class="num">Washes</th><th class="num">Revenue</th><th class="num">% of Revenue</th></tr></thead>
  <tbody>
    ${serviceRows || '<tr><td colspan="4" style="color:#999">No completed services in this period.</td></tr>'}
  </tbody>
</table>

<h2>Transaction Details</h2>
<table class="details">
  <thead><tr><th>Image</th><th>Registration / Make &amp; Model</th><th>Services</th><th>Attendant(s)</th><th>Start / Complete</th><th>Duration</th><th class="num">Charged</th><th>Payment / Status</th><th class="num">Outstanding</th></tr></thead>
  <tbody>${transactionRows || '<tr><td colspan="9" style="color:#999">No transactions in this period.</td></tr>'}</tbody>
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
  const [selectedDay, setSelectedDay] = useState<string>(() => localDateString(new Date()));
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

  const expenseQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, "expenses"),
      where("date", ">=", localDateString(reportWindow.trendStart)),
      where("date", "<=", localDateString(reportWindow.end)),
      orderBy("date", "desc")
    );
  }, [firestore, reportWindow]);
  const { data: reportExpenses, isLoading: expensesLoading } = useCollection<Expense>(expenseQuery);
  const monthlyExpenses = useMemo(() => (reportExpenses ?? []).filter(expense => expense.date >= localDateString(reportWindow.start) && expense.date <= localDateString(reportWindow.end)), [reportExpenses, reportWindow]);
  const dayTransactions = useMemo(
    () => transactions.filter(transaction => localDateString(new Date(transaction.timestamp)) === selectedDay),
    [transactions, selectedDay]
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
  const served = useMemo(() => transactions.filter(isWashServed), [transactions]);
  const previousCompleted = useMemo(
    () => previousTransactions.filter(t => t.status === "Completed"),
    [previousTransactions]
  );
  const previousServed = useMemo(
    () => previousTransactions.filter(isWashServed),
    [previousTransactions]
  );

  const totalRevenue  = useMemo(() => completed.reduce((total, transaction) => total + getAmountReceived(transaction), 0), [completed]);
  const previousRevenue = useMemo(() => previousCompleted.reduce((total, transaction) => total + getAmountReceived(transaction), 0), [previousCompleted]);
  const receivedByMethod = (method: Transaction["payment"]["method"]) => completed.filter(transaction => transaction.payment.method === method).reduce((total, transaction) => total + getAmountReceived(transaction), 0);
  const airtelTotal = useMemo(() => receivedByMethod("Airtel Money"), [completed]);
  const cashTotal = useMemo(() => receivedByMethod("Cash"), [completed]);
  const momoTotal = useMemo(() => receivedByMethod("Mobile Money"), [completed]);
  const corpTotal = useMemo(() => receivedByMethod("Corporate Account"), [completed]);
  const otherMobileTotal = momoTotal;
  const otherPaymentTotal = useMemo(() => receivedByMethod("Other"), [completed]);
  const bankTransferTotal = useMemo(() => receivedByMethod("Bank Transfer"), [completed]);
  const expenseTotal = useMemo(() => monthlyExpenses.reduce((total, expense) => total + expense.amount, 0), [monthlyExpenses]);
  const cashExpenses = useMemo(() => monthlyExpenses.filter(expense => expense.paymentSource === "Cash").reduce((total, expense) => total + expense.amount, 0), [monthlyExpenses]);
  const outstandingTotal = useMemo(() => transactions.filter(transaction => transaction.status === "Pending Payment" && transaction.washStatus !== "In Progress").reduce((total, transaction) => total + getOutstandingBalance(transaction), 0), [transactions]);
  const cashAvailableForBanking = cashTotal - cashExpenses;
  const previousCashTotal = useMemo(() => previousCompleted.filter(t => t.payment.method === "Cash").reduce((total, transaction) => total + getAmountReceived(transaction), 0), [previousCompleted]);
  const previousMomoTotal = useMemo(() => previousCompleted.filter(t => t.payment.method === "Mobile Money").reduce((total, transaction) => total + getAmountReceived(transaction), 0), [previousCompleted]);
  const previousCorpTotal = useMemo(() => previousCompleted.filter(t => t.payment.method === "Corporate Account").reduce((total, transaction) => total + getAmountReceived(transaction), 0), [previousCompleted]);

  const monthlyStats = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(reportWindow.start.getFullYear(), reportWindow.start.getMonth() - 11 + index, 1);
      return { key: monthKey(date), label: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), revenue: 0, washes: 0 };
    });
    const monthByKey = new Map(months.map(month => [month.key, month]));
    for (const transaction of reportTransactions ?? []) {
      const month = monthByKey.get(monthKey(new Date(transaction.timestamp)));
      if (!month || !isWashServed(transaction)) continue;
      month.revenue += getAmountReceived(transaction);
      month.washes += 1;
    }
    return months;
  }, [reportTransactions, reportWindow]);

  const serviceStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const tx of served) {
      const paidAmount = getAmountReceived(tx);
      const paidShare = tx.totalAmount > 0 ? Math.min(1, paidAmount / tx.totalAmount) : 0;
      for (const s of tx.services) {
        if (!map[s.name]) map[s.name] = { count: 0, revenue: 0 };
        map[s.name].count++;
        map[s.name].revenue += s.price * paidShare;
      }
    }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
  }, [served]);

  const totalServiceRevenue = useMemo(() => serviceStats.reduce((a, s) => a + s.revenue, 0), [serviceStats]);
  const pieData = useMemo(() => serviceStats.map(s => ({ name: s.name, value: s.count })), [serviceStats]);

  const paymentPieData = useMemo(() => [
    { name: "Cash", value: cashTotal },
    { name: "Airtel Money", value: airtelTotal },
    { name: "Mobile Money", value: momoTotal },
    { name: "Corporate", value: corpTotal },
    { name: "Bank Transfer", value: bankTransferTotal },
    { name: "Other", value: otherPaymentTotal },
  ].filter(d => d.value > 0), [cashTotal, airtelTotal, momoTotal, corpTotal, bankTransferTotal, otherPaymentTotal]);

  const topByVisits = useMemo(() => (customers ?? []).slice(0, 10), [customers]);
  const topBySpend  = useMemo(() => [...(customers ?? [])].sort((a, b) => (b.totalSpendNgwe ?? 0) - (a.totalSpendNgwe ?? 0)).slice(0, 10), [customers]);
  const uniqueVehicles = useMemo(
    () => new Set(served.map(transaction => transaction.licensePlate.trim().toUpperCase()).filter(Boolean)).size,
    [served]
  );
  const completionRate = transactions.length > 0 ? served.length / transactions.length * 100 : 0;
  const previousCompletionRate = previousTransactions.length > 0 ? previousServed.length / previousTransactions.length * 100 : 0;
  const averageTicket = completed.length > 0 ? totalRevenue / completed.length : 0;
  const previousAverageTicket = previousCompleted.length > 0 ? previousRevenue / previousCompleted.length : 0;
  const pendingCount = transactions.filter(transaction => transaction.status === "Pending Payment").length;
  const previousPendingCount = previousTransactions.filter(transaction => transaction.status === "Pending Payment").length;
  const voidedCount = transactions.filter(transaction => transaction.status === "Voided").length;
  const previousVoidedCount = previousTransactions.filter(transaction => transaction.status === "Voided").length;
  const comparisonData = [
    { label: "Revenue", value: totalRevenue, previous: previousRevenue, formatter: formatCurrency },
    { label: "Completed washes", value: served.length, previous: previousServed.length, formatter: (value: number) => value.toLocaleString() },
    { label: "Average ticket", value: averageTicket, previous: previousAverageTicket, formatter: formatCurrency },
    { label: "Completion rate", value: completionRate, previous: previousCompletionRate, formatter: (value: number) => `${value.toFixed(1)}%` },
    { label: "Transactions recorded", value: transactions.length, previous: previousTransactions.length, formatter: (value: number) => value.toLocaleString() },
    { label: "Pending payment", value: pendingCount, previous: previousPendingCount, formatter: (value: number) => value.toLocaleString(), lowerIsBetter: true },
    { label: "Voided transactions", value: voidedCount, previous: previousVoidedCount, formatter: (value: number) => value.toLocaleString(), lowerIsBetter: true },
  ];
  const reportStartDate = localDateString(reportWindow.start);
  const reportEndDate = localDateString(reportWindow.end);

  return (
    <div className="space-y-7">
      {/* Header + controls */}
      <div className="flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-primary">Insights</p>
          <h1 className="mt-1 text-2xl font-bold">Business Reports</h1>
          <p className="text-sm text-muted-foreground">Performance, month-over-month movement, and business KPIs.</p>
        </div>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto">
          <label htmlFor="report-month" className="col-span-2 text-xs font-medium text-muted-foreground sm:col-span-1">Report month</label>
          <Input
            id="report-month"
            type="month"
            value={selectedMonth}
            max={maxMonth}
            onChange={event => {
              setSelectedMonth(event.target.value);
              setSelectedDay(`${event.target.value}-01`);
            }}
            className="w-full bg-card sm:w-[170px]"
          />
          <Button
            size="sm"
            variant="default"
            className="col-span-2 w-full sm:col-span-1 sm:w-auto"
            onClick={() => exportPdf(reportStartDate, reportEndDate, serviceStats, totalRevenue, cashTotal, momoTotal, corpTotal, served.length, airtelTotal, otherMobileTotal, otherPaymentTotal, bankTransferTotal, expenseTotal, cashAvailableForBanking, outstandingTotal, transactions, Object.entries(monthlyExpenses.reduce<Record<string, number>>((totals, expense) => {
              totals[expense.paymentSource] = (totals[expense.paymentSource] || 0) + expense.amount;
              return totals;
            }, {})).map(([source, amount]) => ({ source, amount })))}
          >
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1 sm:w-fit sm:max-w-full">
          <TabsTrigger value="overview" className="min-h-9 shrink-0 gap-2 px-3">
            <TrendingUp className="h-4 w-4" /> Business Overview
          </TabsTrigger>
          <TabsTrigger value="services" className="min-h-9 shrink-0 gap-2 px-3">
            <TrendingUp className="h-4 w-4" /> Service Analysis
          </TabsTrigger>
          <TabsTrigger value="customers" className="min-h-9 shrink-0 gap-2 px-3">
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
              { label: "Airtel Money", value: formatCurrency(airtelTotal), sub: "Receipts for the selected month" },
              { label: "Other mobile money revenue", value: formatCurrency(momoTotal), sub: totalRevenue > 0 ? `${(momoTotal / totalRevenue * 100).toFixed(1)}% of revenue` : "No completed revenue" },
              { label: "Corporate revenue", value: formatCurrency(corpTotal), sub: totalRevenue > 0 ? `${(corpTotal / totalRevenue * 100).toFixed(1)}% of revenue` : "No completed revenue" },
              { label: "Other payment revenue", value: formatCurrency(otherPaymentTotal), sub: "Other payment methods" },
              { label: "Expenses", value: formatCurrency(expenseTotal), sub: `${formatCurrency(cashExpenses)} paid from cash` },
              { label: "Cash available for banking", value: formatCurrency(cashAvailableForBanking), sub: "Cash received less cash expenses" },
              { label: "Outstanding payments", value: formatCurrency(outstandingTotal), sub: "Unpaid transaction balances" },
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

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div><CardTitle>Daily Transaction and Service History</CardTitle><p className="text-sm text-muted-foreground">Full transaction details for the selected day.</p></div>
              <Input type="date" value={selectedDay} min={reportStartDate} max={reportEndDate} onChange={event => setSelectedDay(event.target.value)} className="w-[170px]" />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Vehicle</TableHead><TableHead>Registration</TableHead><TableHead>Services</TableHead><TableHead>Attendant(s)</TableHead><TableHead>Start / Complete</TableHead><TableHead>Duration</TableHead><TableHead className="text-right">Charged</TableHead><TableHead>Payment / Status</TableHead><TableHead className="text-right">Outstanding</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {txLoading && <TableRow><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>}
                    {!txLoading && dayTransactions.map(transaction => (
                      <TableRow key={transaction.id}>
                        <TableCell>{transaction.vehiclePhotoDataUri ? <img src={transaction.vehiclePhotoDataUri} alt={`Vehicle ${transaction.licensePlate}`} className="h-12 w-16 rounded object-cover" /> : <span className="text-xs text-muted-foreground">No image</span>}</TableCell>
                        <TableCell><div className="font-semibold">{transaction.licensePlate}</div><div className="text-xs text-muted-foreground">{[transaction.vehicleMake, transaction.vehicleModel].filter(Boolean).join(" ") || "Make/model not recorded"}</div></TableCell>
                        <TableCell className="min-w-36">{transaction.services.map(service => service.name).join(", ")}</TableCell>
                        <TableCell className="min-w-32">{transaction.assignedWashers?.map(washer => washer.name).join(", ") || transaction.washerName || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{transactionTime(transaction.startedAt || transaction.timestamp)} / {transactionTime(transaction.completedAt)}</TableCell>
                        <TableCell>{transactionDuration(transaction)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(transaction.totalAmount)}</TableCell>
                        <TableCell><div>{transaction.payment.method}</div><Badge variant={transaction.status === "Completed" ? "secondary" : transaction.status === "Voided" ? "destructive" : "outline"}>{transaction.status}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(getOutstandingBalance(transaction))}</TableCell>
                      </TableRow>
                    ))}
                    {!txLoading && dayTransactions.length === 0 && <TableRow><TableCell colSpan={9} className="h-20 text-center text-muted-foreground">No transactions recorded on this date.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{monthLabel(selectedMonth)} Expense History</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Payment source</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {expensesLoading && <TableRow><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>}
                  {!expensesLoading && monthlyExpenses.map(expense => <TableRow key={expense.id}><TableCell>{expense.date}</TableCell><TableCell className="font-medium">{expense.description}</TableCell><TableCell>{expense.paymentSource}</TableCell><TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell></TableRow>)}
                  {!expensesLoading && monthlyExpenses.length === 0 && <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">No expenses recorded for this month.</TableCell></TableRow>}
                  <TableRow><TableCell colSpan={3} className="font-semibold">Total expenses</TableCell><TableCell className="text-right font-bold">{formatCurrency(expenseTotal)}</TableCell></TableRow>
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
