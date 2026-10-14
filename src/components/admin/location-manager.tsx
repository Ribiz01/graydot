"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useFirestore, useMemoFirebase } from "@/firebase";
import { useCollection } from "@/firebase/firestore/use-collection";
import type { Location } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, PlusCircle, Trash2, Loader2, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const locationSchema = z.object({
  name: z.string().min(2, "Location name is required."),
  address: z.string().optional(),
  active: z.boolean(),
});

export function LocationManager() {
  const firestore = useFirestore();
  const locationsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, "locations") : null),
    [firestore]
  );
  const { data: locations, isLoading } = useCollection<Location>(locationsQuery);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof locationSchema>>({
    resolver: zodResolver(locationSchema),
    defaultValues: { name: "", address: "", active: true },
  });

  const handleDialogOpen = (location: Location | null) => {
    setEditingLocation(location);
    form.reset(
      location
        ? { name: location.name, address: location.address ?? "", active: location.active }
        : { name: "", address: "", active: true }
    );
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: z.infer<typeof locationSchema>) => {
    if (!firestore) return;
    setIsSubmitting(true);
    try {
      if (editingLocation) {
        await updateDoc(doc(firestore, "locations", editingLocation.id), {
          name: data.name,
          address: data.address ?? "",
          active: data.active,
        });
        toast({ title: "Location Updated", description: `${data.name} has been updated.` });
      } else {
        await addDoc(collection(firestore, "locations"), {
          name: data.name,
          address: data.address ?? "",
          active: data.active,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Location Added", description: `${data.name} has been added.` });
      }
      setIsDialogOpen(false);
    } catch {
      toast({ title: "Error", description: "Could not save location.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (locationId: string, name: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, "locations", locationId));
      toast({ title: "Location Deleted", description: `${name} removed.`, variant: "destructive" });
    } catch {
      toast({ title: "Error", description: "Could not delete location.", variant: "destructive" });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Locations</CardTitle>
          <Button onClick={() => handleDialogOpen(null)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Location
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : locations && locations.length > 0 ? (
                locations.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {loc.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{loc.address || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={loc.active ? "secondary" : "outline"}>
                        {loc.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDialogOpen(loc)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(loc.id, loc.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No locations yet. Add your first branch.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Edit Location" : "Add New Location"}</DialogTitle>
            <DialogDescription>
              {editingLocation ? "Update this branch's details." : "Add a new car wash branch."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Graydot Woodlands" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Plot 12, Woodlands, Lusaka" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="mb-0">Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingLocation ? "Save Changes" : "Add Location"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
