"use client";

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection } from '@/firebase/firestore/use-collection';
import { formatCurrency } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import type { Transaction } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Briefcase, Check, Loader2, MessageCircle, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

export function CorporateWashes() {
  const firestore = useFirestore();
  const { user, isLoading: isUserLoading } = useUser();
  const { toast } = useToast();
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    // No orderBy here — combining where+orderBy on different fields needs a composite
    // Firestore index. We sort client-side to avoid that requirement.
    return query(
      collection(firestore, 'transactions'),
      where('payment.method', '==', 'Corporate Account'),
    );
  }, [firestore, user]);

  const { data: rawTransactions, isLoading: areTransactionsLoading } = useCollection<Transaction>(transactionsQuery);
  const isLoading = isUserLoading || areTransactionsLoading;

  // Sort newest-first in the browser
  const transactions = useMemo(
    () => rawTransactions ? [...rawTransactions].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) : null,
    [rawTransactions]
  );

  const pending = useMemo(() => transactions?.filter(t => t.status === 'Pending Payment') ?? [], [transactions]);
  const completed = useMemo(() => transactions?.filter(t => t.status === 'Completed') ?? [], [transactions]);
  const voided = useMemo(() => transactions?.filter(t => t.status === 'Voided') ?? [], [transactions]);

  const outstandingTotal = useMemo(() => pending.reduce((acc, t) => acc + t.totalAmount, 0), [pending]);
  const paidTotal = useMemo(() => completed.reduce((acc, t) => acc + t.totalAmount, 0), [completed]);

  const handleMarkPaid = async (t: Transaction) => {
    if (!firestore) return;
    setMarkingPaid(t.id);
    try {
      await updateDoc(doc(firestore, 'transactions', t.id), { status: 'Completed' });
      toast({ title: "Marked as Paid", description: `${t.licensePlate} — ${formatCurrency(t.totalAmount)}` });
    } catch {
      toast({ title: "Error", description: "Could not update the transaction.", variant: "destructive" });
    } finally {
      setMarkingPaid(null);
    }
  };

  const TransactionTable = ({ rows, showAction }: { rows: Transaction[]; showAction?: boolean }) => {
    if (rows.length === 0) {
      return (
        <Alert>
          <Briefcase className="h-4 w-4" />
          <AlertTitle>No transactions</AlertTitle>
          <AlertDescription>Nothing to show here yet.</AlertDescription>
        </Alert>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>License Plate</TableHead>
            <TableHead>Services</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            {showAction && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(t => {
            const waPhone = t.customerPhone?.replace(/[+\s]/g, '');
            const waLink = waPhone
              ? `https://wa.me/${waPhone.startsWith('0') ? '260' + waPhone.slice(1) : waPhone}?text=${encodeURIComponent(`Hi ${t.customerName ?? ''}, this is a reminder that your car wash payment of ${formatCurrency(t.totalAmount)} (Ref: ${t.payment.reference ?? 'N/A'}) is outstanding. Please settle at your earliest convenience. — Tee-Dot Car Care`)}`
              : null;

            return (
              <TableRow key={t.id}>
                <TableCell className="text-sm whitespace-nowrap">
                  {new Date(t.timestamp).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {t.customerName
                    ? <div className="font-medium">{t.customerName}</div>
                    : <span className="text-muted-foreground text-sm">—</span>}
                  {t.customerPhone && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t.customerPhone}</span>
                    </div>
                  )}
                  {waLink && showAction && (
                    <a href={waLink} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline mt-0.5">
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                  )}
                </TableCell>
                <TableCell className="font-medium">{t.licensePlate}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.services.map(s => s.name).join(', ')}
                </TableCell>
                <TableCell className="font-mono text-xs">{t.payment.reference ?? '—'}</TableCell>
                <TableCell className="font-semibold">{formatCurrency(t.totalAmount)}</TableCell>
                <TableCell>
                  <Badge variant={t.status === 'Completed' ? 'secondary' : t.status === 'Voided' ? 'destructive' : 'outline'}>
                    {t.status}
                  </Badge>
                </TableCell>
                {showAction && (
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markingPaid === t.id}
                      onClick={() => handleMarkPaid(t)}
                    >
                      {markingPaid === t.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <><Check className="h-3 w-3 mr-1" />Mark Paid</>
                      }
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardContent className="pt-6"><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-24 mt-1" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-24 mt-1" /></CardContent></Card>
        </div>
        <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{formatCurrency(outstandingTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{pending.length} unpaid ride{pending.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(paidTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{completed.length} paid ride{completed.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="pending">
            <TabsList className="mb-4">
              <TabsTrigger value="pending">
                Unpaid{pending.length > 0 && <span className="ml-2 rounded-full bg-amber-100 text-amber-700 text-xs px-2">{pending.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
              {voided.length > 0 && <TabsTrigger value="voided">Voided</TabsTrigger>}
            </TabsList>
            <TabsContent value="pending">
              <TransactionTable rows={pending} showAction />
            </TabsContent>
            <TabsContent value="paid">
              <TransactionTable rows={completed} />
            </TabsContent>
            {voided.length > 0 && (
              <TabsContent value="voided">
                <TransactionTable rows={voided} />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
