"use client";

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Car, Clock, CheckCircle2 } from 'lucide-react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { formatCurrency, getAmountReceived, getOutstandingBalance, isWashServed, localDateKey } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { collection, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import type { Transaction, Location, Expense } from '@/lib/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useToast } from '@/hooks/use-toast';

const ServicePerformanceChart = dynamic(
  () => import('./service-performance-chart').then((mod) => mod.ServicePerformanceChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[200px] w-full" />,
  }
);

export function AdminDashboard() {
  const [startDate, setStartDate] = useState<string>(() => {
    return localDateKey(new Date());
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return localDateKey(new Date());
  });
  const [locationFilter, setLocationFilter] = useState<string>('__all__');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const firestore = useFirestore();
  const { user, isLoading: isUserLoading } = useUser();
  const { toast } = useToast();

  const locationsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'locations') : null),
    [firestore]
  );
  const { data: locations } = useCollection<Location>(locationsQuery);
  
  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;

    const constraints: Parameters<typeof query>[1][] = [];

    if (locationFilter && locationFilter !== '__all__') {
      constraints.push(where('locationId', '==', locationFilter));
    }
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      constraints.push(where('timestamp', '>=', start.toISOString()));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      constraints.push(where('timestamp', '<=', end.toISOString()));
    }
    constraints.push(orderBy('timestamp', 'desc'));

    return query(collection(firestore, 'transactions'), ...constraints);
  }, [firestore, startDate, endDate, locationFilter, user]);

  const { data, isLoading: areTransactionsLoading } = useCollection<Transaction>(transactionsQuery);
  const activeTransactionsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'transactions'),
      where('washStatus', 'in', ['In Progress', 'Awaiting Collection'])
    );
  }, [firestore, user]);
  const { data: activeTransactions, isLoading: areActiveTransactionsLoading } = useCollection<Transaction>(activeTransactionsQuery);

  const expensesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'expenses'),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );
  }, [firestore, user, startDate, endDate]);
  const { data: expenses, isLoading: areExpensesLoading } = useCollection<Expense>(expensesQuery);
  const isLoading = isUserLoading || areTransactionsLoading || areActiveTransactionsLoading || areExpensesLoading;

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredTransactions = data || [];

  const completedTransactions = filteredTransactions.filter(t => t.status === 'Completed');
  const servedTransactions = filteredTransactions.filter(isWashServed);

  const totalRevenue = completedTransactions.reduce((total, transaction) => total + getAmountReceived(transaction), 0);
  const totalVehicles = servedTransactions.length;
  const paymentTotals = completedTransactions.reduce<Record<string, number>>((totals, transaction) => {
    totals[transaction.payment.method] = (totals[transaction.payment.method] || 0) + getAmountReceived(transaction);
    return totals;
  }, {});
  const expenseTotals = (expenses || []).reduce<Record<string, number>>((totals, expense) => {
    if (locationFilter === '__all__' || expense.locationId === locationFilter) {
      totals[expense.paymentSource] = (totals[expense.paymentSource] || 0) + expense.amount;
    }
    return totals;
  }, {});
  const cashTotal = paymentTotals.Cash || 0;
  const airtelTotal = paymentTotals['Airtel Money'] || 0;
  const mobileMoneyTotal = paymentTotals['Mobile Money'] || 0;
  const cashAvailable = cashTotal - (expenseTotals.Cash || 0);
  const outstandingTotal = filteredTransactions
    .filter(transaction => transaction.status === 'Pending Payment' && transaction.washStatus !== 'In Progress')
    .reduce((total, transaction) => total + getOutstandingBalance(transaction), 0);
  const activeForLocation = (activeTransactions || [])
    .filter(transaction => locationFilter === '__all__' || transaction.locationId === locationFilter)
    .sort((first, second) => second.timestamp.localeCompare(first.timestamp));
  const washingVehicles = activeForLocation.filter(transaction => transaction.washStatus === 'In Progress');
  const awaitingVehicles = activeForLocation.filter(transaction => transaction.washStatus === 'Awaiting Collection');

  const markCollected = async (transaction: Transaction) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'transactions', transaction.id), {
        washStatus: 'Collected',
        collectedAt: new Date().toISOString(),
      });
      toast({ title: 'Vehicle collected', description: `${transaction.licensePlate} moved to transaction history.` });
    } catch {
      toast({ title: 'Could not update vehicle', description: 'Collection status was not saved.', variant: 'destructive' });
    }
  };

  const elapsedLabel = (transaction: Transaction) => {
    const seconds = transaction.washStatus === 'In Progress'
      ? Math.max(0, Math.floor((currentTime - Date.parse(transaction.startedAt || transaction.timestamp)) / 1000))
      : transaction.washDurationSeconds || 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const servicePerformance = useMemo(() => {
    const serviceCount: { [key: string]: number } = {};
    for (const transaction of servedTransactions) {
      for (const service of transaction.services) {
        serviceCount[service.name] = (serviceCount[service.name] || 0) + 1;
      }
    }
    return Object.entries(serviceCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [servedTransactions]);

  const washerPerformance = useMemo(() => {
    const points: { [key: string]: number } = {};
    for (const transaction of servedTransactions) {
      if (transaction.assignedWashers && transaction.assignedWashers.length > 0) {
        const pointShare = 1 / transaction.assignedWashers.length;
        for (const washer of transaction.assignedWashers) {
          points[washer.name] = (points[washer.name] || 0) + pointShare;
        }
      } else if (transaction.washerName) {
        // Fallback for legacy transactions
        points[transaction.washerName] = (points[transaction.washerName] || 0) + 1;
      }
    }
    return Object.entries(points)
      .map(([name, points]) => ({ name, points: Number(points.toFixed(2)) }))
      .sort((a, b) => b.points - a.points);
  }, [servedTransactions]);

  if (isLoading) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-10 w-[180px]" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-8 w-24" /><Skeleton className="h-4 w-40 mt-1" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-8 w-12" /><Skeleton className="h-4 w-32 mt-1" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-8 w-24" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><Skeleton className="h-8 w-24" /></CardContent></Card>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <Card><CardHeader><Skeleton className="h-6 w-48" /></CardHeader><CardContent><Skeleton className="h-[200px] w-full" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-6 w-48" /></CardHeader><CardContent><Skeleton className="h-[200px] w-full" /></CardContent></Card>
            </div>
        </div>
    )
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 border-b border-border/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-primary">Operations</p>
          <h1 className="mt-1 text-2xl font-bold">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live bays, collections and payment overview.</p>
        </div>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="col-span-2 w-full bg-card sm:col-span-1 sm:w-[180px]">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Locations</SelectItem>
              {locations?.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input aria-label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-card sm:w-[145px]" />
          <Input aria-label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-card sm:w-[145px]" />
        </div>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">from {completedTransactions.length} completed transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vehicles Washed</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVehicles}</div>
            <p className="text-xs text-muted-foreground">in the selected period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Cash Drawer</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(cashAvailable)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(cashTotal)} received less {formatCurrency(expenseTotals.Cash || 0)} cash expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Airtel Money Receipts</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(airtelTotal)}</div>
            <p className="text-xs text-muted-foreground">Expenses: {formatCurrency(expenseTotals['Airtel Money'] || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Other Mobile Money</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(mobileMoneyTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Corporate Account</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(paymentTotals['Corporate Account'] || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bank Transfer</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(paymentTotals['Bank Transfer'] || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Other Payments</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(paymentTotals.Other || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Payments</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(outstandingTotal)}</div></CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-primary">Live floor</p>
            <h2 className="mt-1 text-xl font-bold">Vehicles on Premises</h2>
            <p className="text-sm text-muted-foreground">{washingVehicles.length} being washed · {awaitingVehicles.length} awaiting collection</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Live bay status</div>
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {[
            { title: 'Being Washed', items: washingVehicles, awaitingCollection: false },
            { title: 'Awaiting Collection', items: awaitingVehicles, awaitingCollection: true },
          ].map(group => (
            <Card key={group.title}>
              <CardHeader className="border-b border-border/60 pb-3"><CardTitle className="text-base">{group.title} <span className="ml-1 text-muted-foreground">{group.items.length}</span></CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader><TableRow>
                    <TableHead>Registration / Make</TableHead><TableHead>Bay</TableHead><TableHead>Service</TableHead><TableHead>Attendant</TableHead><TableHead>Time</TableHead>
                    {group.awaitingCollection && <TableHead className="text-right">Action</TableHead>}
                  </TableRow></TableHeader>
                  <TableBody>
                    {group.items.map(transaction => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div className="font-semibold">{transaction.licensePlate}</div>
                          <div className="text-xs text-muted-foreground">{[transaction.vehicleMake, transaction.vehicleModel].filter(Boolean).join(' ') || 'Make/model not recorded'}</div>
                        </TableCell>
                        <TableCell>{transaction.bayNumber || '—'}</TableCell>
                        <TableCell className="min-w-32">{transaction.services.map(service => service.name).join(', ')}</TableCell>
                        <TableCell>{transaction.assignedWashers?.map(washer => washer.name).join(', ') || transaction.washerName || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{elapsedLabel(transaction)}</TableCell>
                        {group.awaitingCollection && <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => void markCollected(transaction)}>
                            <CheckCircle2 className="mr-1 h-4 w-4" /> Collected
                          </Button>
                        </TableCell>}
                      </TableRow>
                    ))}
                    {group.items.length === 0 && <TableRow><TableCell colSpan={group.awaitingCollection ? 6 : 5} className="h-20 text-center text-muted-foreground">No vehicles in this state.</TableCell></TableRow>}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Service Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ServicePerformanceChart data={servicePerformance} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[650px]">
              <TableHeader>
                <TableRow>
                  <TableHead>License Plate</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.slice(0, 5).map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.licensePlate}</TableCell>
                    <TableCell>{formatCurrency(t.totalAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={t.payment.method === 'Cash' ? 'secondary' : (t.payment.method === 'Corporate Account' ? 'outline' : 'default')}>
                        {t.payment.method}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === 'Completed' ? 'secondary' : t.status === 'Voided' ? 'destructive' : 'outline'}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.locationName || <span className="italic">—</span>}</TableCell>
                    <TableCell>{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
                  </TableRow>
                ))}
                 {filteredTransactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No transactions for this period.
                    </TableCell>
                  </TableRow>
                 )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Washer Performance (Points)</CardTitle>
          </CardHeader>
          <CardContent>
             <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Washer Name</TableHead>
                  <TableHead className="text-right">Points / Washes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {washerPerformance.map(w => (
                  <TableRow key={w.name}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-right">{w.points}</TableCell>
                  </TableRow>
                ))}
                 {washerPerformance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No washer points for this period.
                    </TableCell>
                  </TableRow>
                 )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
