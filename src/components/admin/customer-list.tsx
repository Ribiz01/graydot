"use client";

import { useMemo, useState } from "react";
import { collection, orderBy, query } from "firebase/firestore";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { useCollection } from "@/firebase/firestore/use-collection";
import type { Customer } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Users, Star } from "lucide-react";

const tierColors: Record<string, string> = {
  Platinum: "border-purple-400 text-purple-600",
  Gold:     "border-amber-400 text-amber-600",
  Silver:   "border-slate-400 text-slate-600",
  Bronze:   "border-orange-300 text-orange-700",
};

export function CustomerList() {
  const firestore = useFirestore();
  const [search, setSearch] = useState("");

  const customersQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, "customers"), orderBy("totalPoints", "desc")) : null),
    [firestore]
  );
  const { data: customers, isLoading } = useCollection<Customer>(customersQuery);

  const filtered = useMemo(() => {
    if (!customers) return [];
    if (!search.trim()) return customers;
    const lower = search.toLowerCase();
    return customers.filter(
      (c) => c.name?.toLowerCase().includes(lower) || c.phoneNumber?.includes(lower)
    );
  }, [customers, search]);

  const tierCounts = useMemo(() => {
    const counts = { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0 };
    for (const c of customers ?? []) {
      counts[c.tier as keyof typeof counts] = (counts[c.tier as keyof typeof counts] ?? 0) + 1;
    }
    return counts;
  }, [customers]);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-4">
        {(["Platinum", "Gold", "Silver", "Bronze"] as const).map((tier) => (
          <Card key={tier}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{tier}</CardTitle>
              <Trophy className={`h-4 w-4 ${tierColors[tier].split(" ")[1]}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tierCounts[tier]}</div>
              <p className="text-xs text-muted-foreground">members</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> All Customers
          </CardTitle>
          <Input
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-[220px]"
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {search ? "No customers match your search." : "No customers yet. They appear here after their first completed wash."}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                filtered.map((c, idx) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phoneNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={tierColors[c.tier]}>
                        <Star className="mr-1 h-3 w-3" />
                        {c.tier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{c.totalPoints}</TableCell>
                    <TableCell className="text-right">{c.totalVisits}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.totalSpendNgwe ?? 0)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
