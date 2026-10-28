"use client";

import { useMemo, useState } from "react";
import { addDoc, collection, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useUser } from "@/firebase/auth/use-user";
import type { Expense, ExpensePaymentSource, Transaction } from "@/lib/types";
import { formatCurrency, getAmountReceived, localDateKey } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const paymentSources: ExpensePaymentSource[] = ["Cash", "Airtel Money", "Mobile Money", "Bank Transfer", "Other"];

export function ExpensesBanking() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const today = localDateKey(new Date());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentSource, setPaymentSource] = useState<ExpensePaymentSource>("Cash");
  const [expenseDate, setExpenseDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const expensesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "expenses"), where("date", ">=", startDate), where("date", "<=", endDate), orderBy("date", "desc"));
  }, [firestore, user, startDate, endDate]);
  const { data: expenses, isLoading: expensesLoading } = useCollection<Expense>(expensesQuery);

  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    const start = new Date(`${startDate}T00:00:00`).toISOString();
    const end = new Date(`${endDate}T23:59:59.999`).toISOString();
    return query(collection(firestore, "transactions"), where("timestamp", ">=", start), where("timestamp", "<=", end), orderBy("timestamp", "desc"));
  }, [firestore, user, startDate, endDate]);
  const { data: transactions, isLoading: transactionsLoading } = useCollection<Transaction>(transactionsQuery);

  const expenseTotals = useMemo(() => (expenses || []).reduce<Record<string, number>>((totals, expense) => {
    totals[expense.paymentSource] = (totals[expense.paymentSource] || 0) + expense.amount;
    return totals;
  }, {}), [expenses]);
  const revenueTotals = useMemo(() => (transactions || []).reduce<Record<string, number>>((totals, transaction) => {
    const paid = getAmountReceived(transaction);
    totals[transaction.payment.method] = (totals[transaction.payment.method] || 0) + paid;
    return totals;
  }, {}), [transactions]);
  const cashForBanking = (revenueTotals.Cash || 0) - (expenseTotals.Cash || 0);

  const saveExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firestore || !user) return;
    const amountNgwe = Math.round(Number(amount) * 100);
    if (!description.trim() || !Number.isFinite(amountNgwe) || amountNgwe <= 0) {
      toast({ title: "Check expense details", description: "Enter a description and a positive amount.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(firestore, "expenses"), {
        date: expenseDate,
        description: description.trim(),
        amount: amountNgwe,
        paymentSource,
        userId: user.uid,
        ...(user.profile?.locationId && { locationId: user.profile.locationId, locationName: user.profile.locationName || "" }),
        createdAt: serverTimestamp(),
      });
      setDescription("");
      setAmount("");
      toast({ title: "Expense recorded", description: "The banking totals have been updated." });
    } catch {
      toast({ title: "Expense not saved", description: "Check your admin access and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-primary">Cash control</p><h1 className="mt-1 text-2xl font-bold">Expenses &amp; Banking</h1><p className="mt-1 text-sm text-muted-foreground">Record expenses and reconcile amounts available by payment source.</p></div>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto">
          <Label htmlFor="banking-start" className="text-xs text-muted-foreground">From</Label>
          <Label htmlFor="banking-end" className="text-xs text-muted-foreground">To</Label>
          <Input id="banking-start" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="w-full bg-card sm:w-[150px]" />
          <Input id="banking-end" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="w-full bg-card sm:w-[150px]" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Cash available for banking", value: cashForBanking },
          { label: "Airtel Money received", value: revenueTotals["Airtel Money"] || 0 },
          { label: "Other mobile money received", value: revenueTotals["Mobile Money"] || 0 },
          { label: "Total expenses", value: Object.values(expenseTotals).reduce((total, current) => total + current, 0) },
        ].map(metric => <Card key={metric.label}><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(metric.value)}</p></CardContent></Card>)}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader><CardTitle>Record Expense</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveExpense} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="expense-date">Date</Label><Input id="expense-date" type="date" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="expense-description">Description</Label><Input id="expense-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="Cleaning supplies" required /></div>
              <div className="space-y-2"><Label htmlFor="expense-amount">Amount (ZMW)</Label><Input id="expense-amount" type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required /></div>
              <div className="space-y-2"><Label>Payment source</Label><Select value={paymentSource} onValueChange={value => setPaymentSource(value as ExpensePaymentSource)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paymentSources.map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent></Select></div>
              <Button type="submit" disabled={saving}>{saving ? "Recording..." : "Record Expense"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Banking Reconciliation</CardTitle></CardHeader>
          <CardContent>
            {transactionsLoading || expensesLoading ? <Skeleton className="h-40 w-full" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Payment source</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Expenses</TableHead><TableHead className="text-right">Available</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paymentSources.map(source => {
                    const received = revenueTotals[source] || 0;
                    const spent = expenseTotals[source] || 0;
                    return <TableRow key={source}><TableCell className="font-medium">{source}</TableCell><TableCell className="text-right">{formatCurrency(received)}</TableCell><TableCell className="text-right">{formatCurrency(spent)}</TableCell><TableCell className="text-right font-semibold">{formatCurrency(received - spent)}</TableCell></TableRow>;
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Expense History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Payment source</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {expensesLoading && <TableRow><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>}
              {!expensesLoading && (expenses || []).map(expense => <TableRow key={expense.id}><TableCell>{expense.date}</TableCell><TableCell className="font-medium">{expense.description}</TableCell><TableCell>{expense.paymentSource}</TableCell><TableCell>{expense.locationName || "—"}</TableCell><TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell></TableRow>)}
              {!expensesLoading && !expenses?.length && <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No expenses for this period.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}