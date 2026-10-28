"use client";

import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { Banknote, Car, Info, Wallet } from "lucide-react";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { useUser } from "@/firebase/auth/use-user";
import { useCollection } from "@/firebase/firestore/use-collection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Transaction } from "@/lib/types";
import { formatCurrency, getAmountReceived, isWashServed } from "@/lib/utils";

type Preset = "today" | "yesterday" | "last7" | "month" | "custom";

const presetLabels: Record<Exclude<Preset, "custom">, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  month: "This month",
};

/** Local-timezone YYYY-MM-DD, the format the native date input expects. */
function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses YYYY-MM-DD as local midnight (new Date(str) would treat it as UTC). */
function startOfDay(dateStr: string): number | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endOfDay(dateStr: string): number | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function rangeForPreset(preset: Exclude<Preset, "custom">) {
  const today = new Date();
  switch (preset) {
    case "today":
      return { start: toDateInput(today), end: toDateInput(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: toDateInput(y), end: toDateInput(y) };
    }
    case "last7": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { start: toDateInput(from), end: toDateInput(today) };
    }
    case "month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toDateInput(from), end: toDateInput(today) };
    }
  }
}

export function AttendantSummary() {
  const [preset, setPreset] = useState<Preset>("today");
  const [startDate, setStartDate] = useState(() => rangeForPreset("today").start);
  const [endDate, setEndDate] = useState(() => rangeForPreset("today").end);

  const firestore = useFirestore();
  const { user, isLoading: isUserLoading } = useUser();

  // Only this attendant's own transactions. A single equality filter keeps the
  // query on the automatic single-field index — adding the date range here would
  // need a composite index, so the period is applied client-side below.
  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "transactions"), where("userId", "==", user.uid));
  }, [firestore, user]);

  const { data: myTransactions, isLoading: areTransactionsLoading } =
    useCollection<Transaction>(transactionsQuery);
  const isLoading = isUserLoading || areTransactionsLoading;

  const applyPreset = (value: Preset) => {
    setPreset(value);
    if (value === "custom") return;
    const range = rangeForPreset(value);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const inPeriod = useMemo(() => {
    if (!myTransactions) return [];
    const from = startOfDay(startDate);
    const to = endOfDay(endDate);
    return myTransactions
      .filter((t) => {
        const ts = new Date(t.timestamp).getTime();
        if (Number.isNaN(ts)) return false;
        if (from !== null && ts < from) return false;
        if (to !== null && ts > to) return false;
        return true;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [myTransactions, startDate, endDate]);

  // A voided wash never happened as far as the drawer or the car count go.
  const washes = useMemo(() => inPeriod.filter(isWashServed), [inPeriod]);

  // Cash only. Mobile Money and Corporate Account amounts are deliberately never
  // surfaced in the attendant view — those are reconciled by an admin.
  const cashWashes = useMemo(
    () => washes.filter((t) => t.payment.method === "Cash" && t.status === "Completed"),
    [washes]
  );

  const cashAtHand = useMemo(
    () => cashWashes.reduce((total, transaction) => total + getAmountReceived(transaction), 0),
    [cashWashes]
  );

  const nonCashCount = washes.length - cashWashes.length;

  const periodLabel =
    startDate === endDate
      ? new Date(startOfDay(startDate) ?? Date.now()).toLocaleDateString()
      : `${new Date(startOfDay(startDate) ?? Date.now()).toLocaleDateString()} – ${new Date(
          endOfDay(endDate) ?? Date.now()
        ).toLocaleDateString()}`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full max-w-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="pt-6"><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-24 mt-2" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-8 w-16" /><Skeleton className="h-4 w-24 mt-2" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-8 w-16" /><Skeleton className="h-4 w-24 mt-2" /></CardContent></Card>
        </div>
        <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase text-primary">Attendant</p>
          <h1 className="mt-1 text-2xl font-bold">My Shift</h1>
          <p className="mt-1 text-sm text-muted-foreground">Washes and cash recorded for your shift.</p>
        </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
          <SelectTrigger className="col-span-2 w-full bg-card sm:col-span-1 sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(presetLabels) as Array<keyof typeof presetLabels>).map((key) => (
              <SelectItem key={key} value={key}>{presetLabels[key]}</SelectItem>
            ))}
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={startDate}
          max={endDate}
          onChange={(e) => { setStartDate(e.target.value); setPreset("custom"); }}
          className="w-full bg-card sm:w-[145px]"
        />
        <Input
          aria-label="End date"
          type="date"
          value={endDate}
          min={startDate}
          onChange={(e) => { setEndDate(e.target.value); setPreset("custom"); }}
          className="w-full bg-card sm:w-[145px]"
        />
      </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash at Hand</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(cashAtHand)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              from {cashWashes.length} cash wash{cashWashes.length !== 1 ? "es" : ""} · {periodLabel}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cars Washed</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{washes.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              recorded by you in this period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Non-Cash Washes</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{nonCashCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              no cash collected — settled by the office
            </p>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Cash only</AlertTitle>
        <AlertDescription>
          This panel shows the cash you should be holding. Mobile money amounts and
          references are not shown here — an admin reconciles those.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="cash">
            <TabsList className="mb-4">
              <TabsTrigger value="cash">
                Cash Collected
                {cashWashes.length > 0 && (
                  <span className="ml-2 rounded-full bg-muted text-xs px-2">{cashWashes.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="washes">
                All Washes
                {washes.length > 0 && (
                  <span className="ml-2 rounded-full bg-muted text-xs px-2">{washes.length}</span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cash">
              {cashWashes.length === 0 ? (
                <Alert>
                  <Wallet className="h-4 w-4" />
                  <AlertTitle>No cash collected</AlertTitle>
                  <AlertDescription>Nothing was paid in cash during this period.</AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>License Plate</TableHead>
                      <TableHead>Services</TableHead>
                      <TableHead className="text-right">Cash In</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashWashes.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(t.timestamp).toLocaleString([], {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="font-medium">{t.licensePlate}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.services.map((s) => s.name).join(", ")}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(getAmountReceived(t))}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} className="font-semibold">Total cash at hand</TableCell>
                      <TableCell className="text-right text-lg font-bold">
                        {formatCurrency(cashAtHand)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="washes">
              {washes.length === 0 ? (
                <Alert>
                  <Car className="h-4 w-4" />
                  <AlertTitle>No washes</AlertTitle>
                  <AlertDescription>You have not recorded any washes in this period.</AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>License Plate</TableHead>
                      <TableHead>Services</TableHead>
                      <TableHead>Washers</TableHead>
                      <TableHead className="text-right">Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {washes.map((t) => {
                      const isCash = t.payment.method === "Cash";
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {new Date(t.timestamp).toLocaleString([], {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="font-medium">{t.licensePlate}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {t.services.map((s) => s.name).join(", ")}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {t.assignedWashers?.map((w) => w.name).join(", ") || t.washerName || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCash ? (
                              <span className="font-semibold">{formatCurrency(t.totalAmount)}</span>
                            ) : (
                              <Badge variant="outline">Non-cash</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
