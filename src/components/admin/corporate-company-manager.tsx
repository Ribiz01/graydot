"use client";

import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Building2, Loader2, Pencil, PlusCircle, Power } from "lucide-react";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useToast } from "@/hooks/use-toast";
import type { CorporateCompany } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const companySchema = z.object({
  name: z.string().trim().min(2, "Enter the company name."),
  contactPerson: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  contactEmail: z.string().trim().email("Enter a valid email address.").or(z.literal("")),
});

type CompanyFormValues = z.infer<typeof companySchema>;

export function CorporateCompanyManager() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CorporateCompany | null>(null);

  const companiesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, "corporate_companies") : null),
    [firestore]
  );
  const { data: companies, isLoading, error: companiesError } = useCollection<CorporateCompany>(companiesQuery);

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: "", contactPerson: "", contactPhone: "", contactEmail: "" },
  });

  const openDialog = (company?: CorporateCompany) => {
    setEditingCompany(company ?? null);
    form.reset({
      name: company?.name ?? "",
      contactPerson: company?.contactPerson ?? "",
      contactPhone: company?.contactPhone ?? "",
      contactEmail: company?.contactEmail ?? "",
    });
    setDialogOpen(true);
  };

  const saveCompany = async (values: CompanyFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);
    try {
      const companyData = {
        name: values.name,
        contactPerson: values.contactPerson || "",
        contactPhone: values.contactPhone || "",
        contactEmail: values.contactEmail || "",
        updatedAt: serverTimestamp(),
      };

      if (editingCompany) {
        await updateDoc(doc(firestore, "corporate_companies", editingCompany.id), companyData);
        toast({ title: "Company updated", description: `${values.name} has been updated.` });
      } else {
        await addDoc(collection(firestore, "corporate_companies"), {
          ...companyData,
          active: true,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Company added", description: `${values.name} is ready to use for corporate washes.` });
      }

      setDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save this company.";
      toast({
        title: "Could not save company",
        description: `${message} Confirm you are signed in as an admin and that the latest firestore.rules are deployed.`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleCompany = async (company: CorporateCompany) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, "corporate_companies", company.id), {
        active: !company.active,
        updatedAt: serverTimestamp(),
      });
      toast({
        title: company.active ? "Company deactivated" : "Company activated",
        description: company.active
          ? "It will no longer appear when billing a new wash."
          : "It can now be selected for new corporate washes.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update this company.";
      toast({ title: "Could not update company", description: message, variant: "destructive" });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Corporate Companies
          </CardTitle>
          <Button className="w-full sm:w-auto" onClick={() => openDialog()}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Company
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone / Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : companiesError ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-destructive">
                    Could not load companies. Check your admin access and deployed Firestore rules.
                  </TableCell>
                </TableRow>
              ) : companies?.length ? (
                companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell>{company.contactPerson || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>{company.contactPhone || "—"}</div>
                      {company.contactEmail && <div>{company.contactEmail}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={company.active ? "secondary" : "outline"}>
                        {company.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${company.name}`} onClick={() => openDialog(company)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${company.active ? "Deactivate" : "Activate"} ${company.name}`}
                        onClick={() => toggleCompany(company)}
                      >
                        <Power className={company.active ? "h-4 w-4" : "h-4 w-4 text-muted-foreground"} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No companies yet. Add a company to bill its washes to an account.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Edit company" : "Add corporate company"}</DialogTitle>
            <DialogDescription>
              Add the company and optional billing contact details. Active companies can be selected at checkout.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(saveCompany)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company name</FormLabel>
                    <FormControl><Input placeholder="e.g. Acme Limited" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing contact (optional)</FormLabel>
                    <FormControl><Input placeholder="Contact name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl><Input type="tel" placeholder="Contact phone" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (optional)</FormLabel>
                      <FormControl><Input type="email" placeholder="billing@company.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingCompany ? "Save changes" : "Add company"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
