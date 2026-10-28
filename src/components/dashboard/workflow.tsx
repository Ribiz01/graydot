
"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { collection, addDoc, doc, setDoc, updateDoc, query, where, getDocs, serverTimestamp, increment } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, FirestorePermissionError, errorEmitter } from '@/firebase';
import { useUser } from "@/firebase/auth/use-user";
import { useCollection } from "@/firebase/firestore/use-collection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { Service, Vehicle, Transaction, Washer, Customer, CorporateCompany } from "@/lib/types";
import { calcPointsEarned, calcTier } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ChevronLeft, ChevronRight, Loader2, Sparkles, Wind, Droplets, Car, Camera, Image as ImageIcon, Disc, Star, Share2, Ban, Trophy } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { VehicleCamera } from "./vehicle-camera";

const vehicleSchema = z.object({
  licensePlate: z.string().min(3, "License plate is required").toUpperCase(),
});

const newVehicleSchema = z.object({
  licensePlate: z.string().min(3).toUpperCase(),
  make: z.string().min(1, "Vehicle make is required"),
  model: z.string().min(1, "Vehicle model is required"),
  type: z.enum(["Sedan", "SUV", "Truck", "Minibus"]),
  ownerName: z.string().optional(),
  phoneNumber: z.string().min(7, "Enter a customer phone number for receipt delivery."),
  whatsappReceiptConsent: z.boolean().refine(value => value, "Customer consent is required for WhatsApp receipt delivery."),
});

const servicesSchema = z.object({
  selectedServices: z.array(z.string()).min(1, "Please select at least one service."),
  assignedWashers: z.array(z.string()).min(1, "Please select at least one washer."),
  bayNumber: z.string().min(1, "Bay number is required."),
});

const paymentSchema = z.object({
    paymentMethod: z.enum(["Cash", "Airtel Money", "Mobile Money", "Bank Transfer", "Other", "Corporate Account"]),
    reference: z.string().optional(),
    corporateCompanyId: z.string().optional(),
}).refine((data) => {
    if (data.paymentMethod === 'Airtel Money' || data.paymentMethod === 'Mobile Money' || data.paymentMethod === 'Bank Transfer' || data.paymentMethod === 'Corporate Account') {
        return (data.reference ?? '').trim().length > 0;
    }
    return true;
}, {
    message: "A reference number is required",
    path: ["reference"],
}).refine((data) => {
    return data.paymentMethod !== "Corporate Account" || Boolean(data.corporateCompanyId);
}, {
    message: "Select the company to bill.",
    path: ["corporateCompanyId"],
});


type Step = "vehicle" | "new-vehicle" | "services" | "washing" | "payment" | "receipt";

const serviceIcons: { [key: string]: React.ReactNode } = {
    'Exterior Wash': <Droplets className="h-6 w-6 text-primary" />,
    'Interior Vacuum': <Wind className="h-6 w-6 text-primary" />,
    'Wax & Polish': <Sparkles className="h-6 w-6 text-primary" />,
    'Engine Wash': <Car className="h-6 w-6 text-primary" />,
    'Tire Shine': <Disc className="h-6 w-6 text-primary" />,
    'Full Detail': <Star className="h-6 w-6 text-primary" />,
};

const suggestionsPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "Not configured";

export function Workflow() {
  const [step, setStep] = useState<Step>("vehicle");
  const [currentVehicle, setCurrentVehicle] = useState<Vehicle | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'scan' | 'capture'>('capture');
  const [vehiclePhotoUri, setVehiclePhotoUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFindingVehicle, setIsFindingVehicle] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNewVehicleSaved, setIsNewVehicleSaved] = useState(false);
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<Customer | null>(null);

  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const servicesQuery = useMemoFirebase(() => firestore ? collection(firestore, 'services') : null, [firestore]);
  const { data: allServices, isLoading: isLoadingServices } = useCollection<Service>(servicesQuery);

  const washersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'washers') : null, [firestore]);
  const { data: allWashers, isLoading: isLoadingWashers } = useCollection<Washer>(washersQuery);

  const corporateCompaniesQuery = useMemoFirebase(
    () => firestore ? collection(firestore, "corporate_companies") : null,
    [firestore]
  );
  const {
    data: corporateCompanies,
    isLoading: isLoadingCorporateCompanies,
    error: corporateCompaniesError,
  } = useCollection<CorporateCompany>(corporateCompaniesQuery);
  const activeCorporateCompanies = corporateCompanies?.filter(company => company.active) ?? [];

  const vehicleForm = useForm<z.infer<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { licensePlate: "" },
  });

  const newVehicleForm = useForm<z.infer<typeof newVehicleSchema>>({
    resolver: zodResolver(newVehicleSchema),
    defaultValues: {
      licensePlate: "",
      make: "",
      model: "",
      type: "Sedan",
      ownerName: "",
      phoneNumber: "",
      whatsappReceiptConsent: false,
    },
  });

  const servicesForm = useForm<z.infer<typeof servicesSchema>>({
    resolver: zodResolver(servicesSchema),
    defaultValues: { selectedServices: [], assignedWashers: [], bayNumber: "" },
  });

  const paymentForm = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paymentMethod: "Cash", reference: "", corporateCompanyId: "" },
  });


  const handleVehicleSubmit = async (data: z.infer<typeof vehicleSchema>) => {
    if (!firestore) return;
    setIsFindingVehicle(true);
    try {
      const vehiclesRef = collection(firestore, 'vehicles');
      const q = query(vehiclesRef, where("licensePlate", "==", data.licensePlate));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const found = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as Vehicle;
        setCurrentVehicle(found);
        if (!found.make || !found.model || !found.phoneNumber || !found.whatsappReceiptConsent || !found.photoDataUri) {
          newVehicleForm.reset({
            licensePlate: found.licensePlate,
            make: found.make || "",
            model: found.model || "",
            type: found.type || "Sedan",
            ownerName: found.ownerName || "",
            phoneNumber: found.phoneNumber || "",
            whatsappReceiptConsent: found.whatsappReceiptConsent || false,
          });
          setVehiclePhotoUri(found.photoDataUri || null);
          setIsNewVehicleSaved(false);
          setStep("new-vehicle");
          return;
        }
        // Look up loyalty profile by phone number
        if (found.phoneNumber) {
          const custQ = query(collection(firestore, 'customers'), where('phoneNumber', '==', found.phoneNumber));
          const custSnap = await getDocs(custQ);
          if (!custSnap.empty) {
            setCustomerInfo({ id: custSnap.docs[0].id, ...custSnap.docs[0].data() } as Customer);
          } else {
            setCustomerInfo(null);
          }
        } else {
          setCustomerInfo(null);
        }
        setStep("services");
      } else {
        newVehicleForm.setValue("licensePlate", data.licensePlate);
        setIsNewVehicleSaved(false);
        setStep("new-vehicle");
      }
    } catch (error) {
        toast({ title: "Error", description: "Could not find vehicle.", variant: "destructive" });
    } finally {
        setIsFindingVehicle(false);
    }
  };

  const handleNewVehicleSubmit = async (data: z.infer<typeof newVehicleSchema>) => {
    if (!firestore) return;
    if (!vehiclePhotoUri && !currentVehicle?.photoDataUri) {
      toast({ title: "Vehicle photo required", description: "Capture a vehicle photo before continuing.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    const newVehicle: Omit<Vehicle, 'id'> = {
      ...data,
      ...((vehiclePhotoUri || currentVehicle?.photoDataUri) && { photoDataUri: vehiclePhotoUri || currentVehicle?.photoDataUri }),
    };
    try {
        const vehicleRef = doc(firestore, 'vehicles', data.licensePlate);
        if (currentVehicle) {
          await updateDoc(vehicleRef, {
            make: data.make,
            model: data.model,
            phoneNumber: data.phoneNumber,
            whatsappReceiptConsent: data.whatsappReceiptConsent,
            ...((vehiclePhotoUri || currentVehicle.photoDataUri) && { photoDataUri: vehiclePhotoUri || currentVehicle.photoDataUri }),
          });
        } else {
          await setDoc(vehicleRef, newVehicle);
        }
        const savedVehicle = { ...currentVehicle, id: data.licensePlate, ...newVehicle };
        setCurrentVehicle(savedVehicle);
        toast({ title: "Vehicle Registered", description: `${data.licensePlate} has been saved.` });
        setIsNewVehicleSaved(true);
    } catch (error: any) {
        toast({ title: "Error", description: error.message || "Could not add vehicle.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleServicesSubmit = async (data: z.infer<typeof servicesSchema>) => {
    if (!currentVehicle || !user || !firestore || !allServices) return;
    setIsSubmitting(true);
    const startedAt = new Date().toISOString();
    const selectedServices = allServices.filter(service => data.selectedServices.includes(service.id));
    const totalAmount = selectedServices.reduce((total, service) => total + service.price, 0);
    const assignedWashers = allWashers
      ?.filter(washer => data.assignedWashers.includes(washer.id))
      .map(washer => ({ id: washer.id, name: washer.name })) || [];
    const activeTransaction: Omit<Transaction, "id"> = {
      timestamp: startedAt,
      createdAt: serverTimestamp(),
      startedAt,
      washStatus: "In Progress",
      bayNumber: data.bayNumber.trim(),
      licensePlate: currentVehicle.licensePlate,
      ...(currentVehicle.make && { vehicleMake: currentVehicle.make }),
      ...(currentVehicle.model && { vehicleModel: currentVehicle.model }),
      ...((currentVehicle.photoDataUri || vehiclePhotoUri) && { vehiclePhotoDataUri: currentVehicle.photoDataUri || vehiclePhotoUri || "" }),
      services: selectedServices.map(service => ({ id: service.id, name: service.name, price: service.price })),
      totalAmount,
      amountPaid: 0,
      outstandingBalance: totalAmount,
      payment: { method: "Cash", amount: 0 },
      userId: user.uid,
      ...(user.profile?.locationId && {
        locationId: user.profile.locationId,
        locationName: user.profile.locationName ?? "",
      }),
      assignedWashers,
      status: "Pending Payment",
      ...(currentVehicle.ownerName && { customerName: currentVehicle.ownerName }),
      ...(currentVehicle.phoneNumber && { customerPhone: currentVehicle.phoneNumber }),
      whatsappReceiptConsent: currentVehicle.whatsappReceiptConsent === true,
    };

    try {
      const docRef = await addDoc(collection(firestore, "transactions"), activeTransaction);
      setTransaction({ id: docRef.id, ...activeTransaction });
      setStep("washing");
    } catch (error: any) {
      toast({ title: "Could not start wash", description: error.message || "The active wash was not saved.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (data: z.infer<typeof paymentSchema>) => {
    if (!currentVehicle || !user || !firestore || !transaction) return;
    const corporateCompany = data.corporateCompanyId
      ? activeCorporateCompanies.find(company => company.id === data.corporateCompanyId)
      : undefined;
    if (data.paymentMethod === "Corporate Account" && !corporateCompany) {
      toast({
        title: "Select a corporate company",
        description: "Choose an active company to bill before completing this wash.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    const completedAt = new Date().toISOString();
    const amountPaid = data.paymentMethod === "Corporate Account" ? 0 : transaction.totalAmount;
    const { id: transactionId, createdAt: _createdAt, ...transactionFields } = transaction;
    const newTransactionData: Omit<Transaction, "id"> = {
      ...transactionFields,
      payment: { method: data.paymentMethod, reference: data.reference, amount: amountPaid },
      amountPaid,
      outstandingBalance: transaction.totalAmount - amountPaid,
      status: data.paymentMethod === "Corporate Account" ? "Pending Payment" : "Completed",
      washStatus: "Awaiting Collection",
      completedAt,
      washDurationSeconds: Math.max(0, Math.floor((Date.parse(completedAt) - Date.parse(transaction.startedAt || transaction.timestamp)) / 1000)),
      receiptDeliveryStatus: currentVehicle.phoneNumber && currentVehicle.whatsappReceiptConsent ? "Pending" : "Failed",
      ...(!currentVehicle.phoneNumber && { receiptDeliveryError: "Customer phone number is missing." }),
      ...(currentVehicle.phoneNumber && !currentVehicle.whatsappReceiptConsent && { receiptDeliveryError: "Customer WhatsApp consent was not recorded." }),
      ...(data.paymentMethod === "Corporate Account" && corporateCompany && {
        corporateCompanyId: corporateCompany.id,
        corporateCompanyName: corporateCompany.name,
      }),
    };

    try {
        await updateDoc(doc(firestore, "transactions", transaction.id), newTransactionData);
        const finalTransaction: Transaction = { ...newTransactionData, id: transaction.id };

        // Write a durable receipt record (B7)
        await setDoc(doc(firestore, 'receipts', transactionId), {
          transactionId: transaction.id,
          licensePlate: currentVehicle.licensePlate,
          vehicleMake: currentVehicle.make || "",
          vehicleModel: currentVehicle.model || "",
          services: newTransactionData.services,
          totalAmount: newTransactionData.totalAmount,
          paymentMethod: data.paymentMethod,
          status: newTransactionData.status,
          userId: user.uid,
          customerPhone: currentVehicle.phoneNumber || "",
          ...(finalTransaction.corporateCompanyId && {
            corporateCompanyId: finalTransaction.corporateCompanyId,
            corporateCompanyName: finalTransaction.corporateCompanyName || "",
          }),
          deliveryStatus: finalTransaction.receiptDeliveryStatus,
          createdAt: serverTimestamp(),
        });

        // Update customer loyalty points (only for Completed, cash or MoMo)
        if (newTransactionData.status === 'Completed' && currentVehicle.phoneNumber && currentVehicle.ownerName) {
          const pointsEarned = calcPointsEarned(finalTransaction.totalAmount);
          const custQ = query(collection(firestore, 'customers'), where('phoneNumber', '==', currentVehicle.phoneNumber));
          const custSnap = await getDocs(custQ);
          if (custSnap.empty) {
            // Create new customer record
            const newPoints = pointsEarned;
            await addDoc(collection(firestore, 'customers'), {
              name: currentVehicle.ownerName,
              phoneNumber: currentVehicle.phoneNumber,
              totalPoints: newPoints,
              totalVisits: 1,
              totalSpendNgwe: finalTransaction.totalAmount,
              tier: calcTier(newPoints),
              createdAt: serverTimestamp(),
              lastVisitAt: serverTimestamp(),
            });
          } else {
            // Increment existing customer
            const custRef = doc(firestore, 'customers', custSnap.docs[0].id);
            const prevPoints = (custSnap.docs[0].data().totalPoints ?? 0) + pointsEarned;
            await updateDoc(custRef, {
              totalPoints: increment(pointsEarned),
              totalVisits: increment(1),
              totalSpendNgwe: increment(finalTransaction.totalAmount),
              tier: calcTier(prevPoints),
              lastVisitAt: serverTimestamp(),
            });
          }
        }

        setTransaction(finalTransaction);
        setStep("receipt");

        if (currentVehicle.phoneNumber && currentVehicle.whatsappReceiptConsent) {
          try {
            const response = await fetch("/api/send-receipt", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
              body: JSON.stringify({ transactionId: finalTransaction.id }),
            });
            const result = await response.json();
            const deliveryStatus = response.ok ? "Sent" : "Failed";
            const deliveryError = response.ok ? "" : (result.error || "Receipt delivery failed.");
            await updateDoc(doc(firestore, "transactions", transactionId), {
              receiptDeliveryStatus: deliveryStatus,
              receiptDeliveryError: deliveryError,
            });
            await updateDoc(doc(firestore, "receipts", transactionId), {
              deliveryStatus,
              deliveryError,
              sentAt: response.ok ? serverTimestamp() : null,
            });
            setTransaction({ ...finalTransaction, receiptDeliveryStatus: deliveryStatus, receiptDeliveryError: deliveryError || undefined });
          } catch (deliveryError) {
            const message = deliveryError instanceof Error ? deliveryError.message : "Receipt delivery failed.";
            try {
              await updateDoc(doc(firestore, "transactions", transactionId), { receiptDeliveryStatus: "Failed", receiptDeliveryError: message });
              await updateDoc(doc(firestore, "receipts", transactionId), { deliveryStatus: "Failed", deliveryError: message });
            } catch {
              // Keep the receipt screen usable if its status update is temporarily unavailable.
            }
            setTransaction({ ...finalTransaction, receiptDeliveryStatus: "Failed", receiptDeliveryError: message });
          }
        }

        toast({
            title: "Transaction Complete!",
            description: `Wash for ${finalTransaction.licensePlate} has been recorded.`,
        });

    } catch (error: any) {
        // Create and emit a detailed, contextual error for the dev overlay
        const permissionError = new FirestorePermissionError({
          path: 'transactions', // This is the collection path
          operation: 'create',
          requestResourceData: newTransactionData,
        });
        errorEmitter.emit('permission-error', permissionError);

        // Show a user-friendly toast. The dev overlay will have the details.
        toast({ 
            title: "Transaction Failed", 
            description: "Could not save the transaction. Check the console for details.", 
            variant: "destructive" 
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handlePhotoCaptured = async (imageDataUri: string) => {
    setIsCameraOpen(false);
    if (cameraMode === 'capture') {
        setVehiclePhotoUri(imageDataUri);
        toast({ title: "Photo captured!" });
    } else if (cameraMode === 'scan') {
        setIsScanning(true);
        toast({ title: "Scanning License Plate...", description: "This might take a moment." });
        try {
            const res = await fetch('/api/scan-plate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photoDataUri: imageDataUri }),
            });
            const result = res.ok ? await res.json() : null;
            if (result && result.licensePlate) {
                vehicleForm.setValue('licensePlate', result.licensePlate);
                toast({
                    title: "Scan Successful!",
                    description: `License plate set to ${result.licensePlate}.`,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Scan Failed",
                    description: "Could not read the license plate. Please try again or enter it manually.",
                });
            }
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Scan Error",
                description: "An unexpected error occurred during the scan.",
            });
        } finally {
            setIsScanning(false);
        }
    }
};

const handleShareReceipt = async () => {
    if (!transaction || !currentVehicle?.phoneNumber) return;

    // 1. Generate the receipt text using WhatsApp formatting
    const servicesText = transaction.services.map(service => `- ${service.name}: ${formatCurrency(service.price)}`).join("\n");
    const receiptText = `Graydot Carwash & Auto Detailing\nOFFICIAL RECEIPT\nReceipt ID: ${transaction.id}\nDate: ${new Date(transaction.timestamp).toLocaleString()}\nVehicle: ${transaction.vehicleMake || ""} ${transaction.vehicleModel || ""} (${transaction.licensePlate})\nServices:\n${servicesText}\nTotal: ${formatCurrency(transaction.totalAmount)}\nPaid: ${formatCurrency(transaction.amountPaid || 0)}\nOutstanding: ${formatCurrency(transaction.outstandingBalance || 0)}\nPayment: ${transaction.payment.method}\nSuggestions and complaints: ${suggestionsPhone}`;

    // 2. URL-encode the text
    const encodedText = encodeURIComponent(receiptText);

    // 3. Create the WhatsApp URL
    const phoneNumber = currentVehicle.phoneNumber.replace(/[+\s]/g, '');
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedText}`;
    
    // 4. Open the URL in a new tab
    window.open(whatsappUrl, '_blank');

    toast({ title: "Receipt opened", description: "WhatsApp opened with the receipt. Confirm sending in WhatsApp." });
  };

  const handleResendReceipt = async () => {
    if (!transaction || !currentVehicle?.phoneNumber || !currentVehicle.whatsappReceiptConsent || !firestore || !user) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ transactionId: transaction.id }),
      });
      const result = await response.json();
      const deliveryStatus = response.ok ? "Sent" : "Failed";
      const deliveryError = response.ok ? "" : (result.error || "Receipt delivery failed.");
      await updateDoc(doc(firestore, "transactions", transaction.id), {
        receiptDeliveryStatus: deliveryStatus,
        receiptDeliveryError: deliveryError,
      });
      await updateDoc(doc(firestore, "receipts", transaction.id), {
        deliveryStatus,
        deliveryError,
        sentAt: response.ok ? serverTimestamp() : null,
      });
      setTransaction({ ...transaction, receiptDeliveryStatus: deliveryStatus, receiptDeliveryError: deliveryError || undefined });
      toast({ title: response.ok ? "Receipt sent" : "Receipt not sent", description: response.ok ? "WhatsApp accepted the receipt message." : deliveryError, variant: response.ok ? "default" : "destructive" });
    } catch (error) {
      const deliveryError = error instanceof Error ? error.message : "Receipt delivery failed.";
      try {
        await updateDoc(doc(firestore, "transactions", transaction.id), { receiptDeliveryStatus: "Failed", receiptDeliveryError: deliveryError });
        await updateDoc(doc(firestore, "receipts", transaction.id), { deliveryStatus: "Failed", deliveryError });
      } catch {
        // Keep the resend result visible if persistence is temporarily unavailable.
      }
      setTransaction({ ...transaction, receiptDeliveryStatus: "Failed", receiptDeliveryError: deliveryError });
      toast({ title: "Receipt not sent", description: deliveryError, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoidTransaction = async () => {
    if (!transaction || !firestore || !user) return;
    setIsVoiding(true);
    try {
      const transactionRef = doc(firestore, 'transactions', transaction.id);
      await updateDoc(transactionRef, {
        status: 'Voided',
        voidedAt: serverTimestamp(),
        voidedBy: user.uid,
      });
      setTransaction({ ...transaction, status: 'Voided' });
      toast({ title: "Transaction Voided", description: `Transaction ${transaction.id} has been voided.`, variant: "destructive" });
    } catch (error: any) {
      toast({ title: "Error", description: "Could not void the transaction.", variant: "destructive" });
    } finally {
      setIsVoiding(false);
      setIsVoidDialogOpen(false);
    }
  };


  const startNew = () => {
    vehicleForm.reset({ licensePlate: "" });
    newVehicleForm.reset({ licensePlate: "", make: "", model: "", type: "Sedan", ownerName: "", phoneNumber: "", whatsappReceiptConsent: false });
    servicesForm.reset({ selectedServices: [], assignedWashers: [], bayNumber: "" });
    paymentForm.reset({ paymentMethod: "Cash", reference: "", corporateCompanyId: "" });
    setCurrentVehicle(null);
    setTransaction(null);
    setVehiclePhotoUri(null);
    setIsNewVehicleSaved(false);
    setIsVoidDialogOpen(false);
    setCustomerInfo(null);
    setStep("vehicle");
  };
  
  const motionProps = {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
    transition: { duration: 0.3 }
  };

  const renderStep = () => {
    switch (step) {
      case "vehicle":
        return (
          <motion.div {...motionProps}>
          <Card>
            <CardHeader>
              <CardTitle>1. Vehicle Identification</CardTitle>
              <CardDescription>Enter the vehicle's license plate or scan it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...vehicleForm}>
                <form onSubmit={vehicleForm.handleSubmit(handleVehicleSubmit)} className="space-y-4">
                  <FormField
                    control={vehicleForm.control}
                    name="licensePlate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>License Plate</FormLabel>
                        <div className="relative">
                            <FormControl>
                            <Input placeholder="e.g., ABC 1234" {...field} />
                            </FormControl>
                            <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1 h-8 w-8"
                            onClick={() => {
                                setCameraMode('scan');
                                setIsCameraOpen(true);
                            }}
                            disabled={isScanning}
                            >
                            {isScanning ? <Loader2 className="animate-spin" /> : <Camera className="size-5" />}
                            <span className="sr-only">Scan License Plate</span>
                            </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isScanning || isFindingVehicle || isLoadingServices}>
                    {isFindingVehicle && <Loader2 className="animate-spin mr-2" />}
                    {isFindingVehicle ? 'Finding...' : 'Find Vehicle'}
                     <ChevronRight className="ml-2" />
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
          </motion.div>
        );
      case "new-vehicle":
        return (
            <motion.div {...motionProps}>
            <Card>
            <CardHeader>
              <CardTitle>{currentVehicle ? "Complete Vehicle Details" : "Register New Vehicle"}</CardTitle>
              <CardDescription>{currentVehicle ? "Add the missing make and model before continuing." : "This license plate is not in our system. Please add the vehicle details."}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...newVehicleForm}>
                <form onSubmit={newVehicleForm.handleSubmit(handleNewVehicleSubmit)} className="space-y-4">
                   <div className="space-y-2">
                      <FormLabel>Vehicle Photo</FormLabel>
                      <Card>
                          <CardContent className="p-2">
                              <div className="aspect-video w-full bg-muted rounded-md flex items-center justify-center overflow-hidden">
                                  {vehiclePhotoUri ? (
                                      <img src={vehiclePhotoUri} alt="Vehicle" className="h-full w-full object-cover rounded-md" />
                                  ) : (
                                      <ImageIcon className="size-12 text-muted-foreground" />
                                  )}
                              </div>
                          </CardContent>
                          <CardFooter className="p-2 pt-0">
                              <Button type="button" variant="outline" className="w-full" onClick={() => {
                                  setCameraMode('capture');
                                  setIsCameraOpen(true);
                              }}
                              disabled={isSubmitting || isNewVehicleSaved}>
                                  <Camera className="mr-2" /> {vehiclePhotoUri ? 'Retake' : 'Capture'} Photo
                              </Button>
                          </CardFooter>
                      </Card>
                  </div>

                  <FormField control={newVehicleForm.control} name="licensePlate" render={({ field }) => (
                    <FormItem><FormLabel>License Plate</FormLabel><FormControl><Input {...field} disabled /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField control={newVehicleForm.control} name="make" render={({ field }) => (
                      <FormItem><FormLabel>Make</FormLabel><FormControl><Input placeholder="Toyota" {...field} disabled={isSubmitting || isNewVehicleSaved} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={newVehicleForm.control} name="model" render={({ field }) => (
                      <FormItem><FormLabel>Model</FormLabel><FormControl><Input placeholder="Corolla" {...field} disabled={isSubmitting || isNewVehicleSaved} /></FormControl><FormMessage /></FormItem>
                    )}/>
                  </div>
                  <FormField control={newVehicleForm.control} name="type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting || isNewVehicleSaved}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select vehicle type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Sedan">Sedan</SelectItem>
                          <SelectItem value="SUV">SUV</SelectItem>
                          <SelectItem value="Truck">Truck</SelectItem>
                          <SelectItem value="Minibus">Minibus</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}/>
                  <FormField control={newVehicleForm.control} name="ownerName" render={({ field }) => (
                    <FormItem><FormLabel>Owner Name (Optional)</FormLabel><FormControl><Input placeholder="John Doe" {...field} disabled={isSubmitting || isNewVehicleSaved}/></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={newVehicleForm.control} name="phoneNumber" render={({ field }) => (
                    <FormItem><FormLabel>Customer Phone Number</FormLabel><FormControl><Input placeholder="260977123456" {...field} disabled={isSubmitting || isNewVehicleSaved} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={newVehicleForm.control} name="whatsappReceiptConsent" render={({ field }) => (
                    <FormItem className="flex flex-row items-start gap-3 space-y-0">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting || isNewVehicleSaved} /></FormControl>
                      <FormLabel className="font-normal">Customer agrees to receive receipts by WhatsApp.</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}/>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setStep("vehicle")} disabled={isSubmitting || isNewVehicleSaved}>
                      <ChevronLeft className="mr-2" />Back
                    </Button>
                    {!isNewVehicleSaved ? (
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 animate-spin" />}
                            Register Vehicle
                        </Button>
                    ) : (
                        <Button onClick={() => setStep("services")}>
                            Continue to Services <ChevronRight className="ml-2" />
                        </Button>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
          </motion.div>
        );
      case "services":
        const selectedIds = servicesForm.watch("selectedServices");
        const selected = allServices?.filter(s => selectedIds.includes(s.id)) || [];
        const total = selected.reduce((acc, s) => acc + s.price, 0);

        return (
            <motion.div {...motionProps} className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>2. Select Services</CardTitle>
                            <CardDescription>Choose the services for {currentVehicle?.licensePlate}.</CardDescription>
                        </CardHeader>
                        <CardContent>
                        <Form {...servicesForm}>
                            <form onSubmit={servicesForm.handleSubmit(handleServicesSubmit)}>
                                <FormField control={servicesForm.control} name="bayNumber" render={({ field }) => (
                                  <FormItem className="mb-6 max-w-xs">
                                    <FormLabel>Wash Bay</FormLabel>
                                    <FormControl><Input placeholder="e.g. Bay 1" {...field} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )} />
                                <FormField control={servicesForm.control} name="assignedWashers" render={({ field }) => (
                                    <FormItem className="mb-6">
                                        <FormLabel>Assigned Washers (Points are split equally)</FormLabel>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                                            {allWashers?.map(w => (
                                                 <FormField key={w.id} control={servicesForm.control} name="assignedWashers" render={({ field: subField }) => {
                                                    return (
                                                        <FormItem key={w.id} className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 shadow-sm cursor-pointer hover:border-primary transition-colors">
                                                            <FormControl>
                                                                <Checkbox 
                                                                    checked={subField.value?.includes(w.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        return checked
                                                                            ? subField.onChange([...subField.value, w.id])
                                                                            : subField.onChange(subField.value?.filter((value) => value !== w.id))
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="font-medium cursor-pointer w-full text-sm">
                                                                {w.name}
                                                            </FormLabel>
                                                        </FormItem>
                                                    )
                                                 }} />
                                            ))}
                                            {allWashers?.length === 0 && <p className="text-muted-foreground text-sm col-span-full">No washers available</p>}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={servicesForm.control} name="selectedServices" render={({ field }) => (
                                    <FormItem className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {isLoadingServices && <>
                                          <Skeleton className="h-24 w-full" />
                                          <Skeleton className="h-24 w-full" />
                                        </>}
                                        {allServices?.map((service) => (
                                        <FormField key={service.id} control={servicesForm.control} name="selectedServices" render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                            <Card className={`w-full cursor-pointer hover:border-primary transition-colors ${field.value?.includes(service.id) ? "border-primary border-2" : ""}`}>
                                                <CardContent className="p-4">
                                                    <FormControl>
                                                        <Checkbox className="hidden" checked={field.value?.includes(service.id)} onCheckedChange={(checked) => {
                                                            return checked ? field.onChange([...field.value, service.id]) : field.onChange(field.value?.filter((value) => value !== service.id));
                                                        }} />
                                                    </FormControl>
                                                    <FormLabel className="font-normal w-full flex items-center justify-between cursor-pointer">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            {serviceIcons[service.name] || <Car className="h-6 w-6 text-primary" />}
                                                            <span className="min-w-0 break-words text-base font-medium sm:text-lg">{service.name}</span>
                                                        </div>
                                                        <span className="shrink-0 whitespace-nowrap text-base font-bold sm:text-lg">{formatCurrency(service.price)}</span>
                                                    </FormLabel>
                                                </CardContent>
                                            </Card>
                                            </FormItem>
                                        )} />
                                    ))}
                                    <FormMessage className="col-span-full" />
                                </FormItem>
                                )}/>
                            </form>
                        </Form>
                        </CardContent>
                    </Card>
                </div>
                <div className="md:col-span-1">
                    <Card className="sticky top-20">
                        <CardHeader>
                          <CardTitle>Order Summary</CardTitle>
                          {customerInfo && (
                            <div className="flex items-center gap-2 mt-1">
                              <Trophy className="h-4 w-4 text-amber-500" />
                              <span className="text-sm font-medium">{customerInfo.name}</span>
                              <Badge variant="outline" className={
                                customerInfo.tier === 'Platinum' ? 'border-purple-400 text-purple-600' :
                                customerInfo.tier === 'Gold' ? 'border-amber-400 text-amber-600' :
                                customerInfo.tier === 'Silver' ? 'border-slate-400 text-slate-600' :
                                'border-orange-300 text-orange-700'
                              }>
                                {customerInfo.tier} · {customerInfo.totalPoints} pts
                              </Badge>
                            </div>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {selected.length > 0 ? selected.map(s => (
                                <div key={s.id} className="flex justify-between"><span>{s.name}</span><span className="font-medium">{formatCurrency(s.price)}</span></div>
                            )) : <p className="text-muted-foreground">No services selected.</p>}
                            <Separator />
                            <div className="flex justify-between text-xl font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            <Button className="w-full" onClick={servicesForm.handleSubmit(handleServicesSubmit)} disabled={selected.length === 0 || isSubmitting}>
                              {isSubmitting && <Loader2 className="mr-2 animate-spin" />}
                              Start Wash <ChevronRight className="ml-2" />
                            </Button>
                            <Button className="w-full" variant="outline" onClick={() => setStep("vehicle")}><ChevronLeft className="mr-2" />Change Vehicle</Button>
                        </CardFooter>
                    </Card>
                </div>
            </motion.div>
        );
      case "washing":
        return (
          <motion.div {...motionProps}>
            <Card className="max-w-xl">
              <CardHeader>
                <CardTitle>Wash in Progress</CardTitle>
                <CardDescription>{transaction?.licensePlate} · {transaction?.vehicleMake || "Vehicle"} {transaction?.vehicleModel || ""} · {transaction?.bayNumber}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p><span className="font-medium">Services:</span> {transaction?.services.map(service => service.name).join(", ")}</p>
                <p><span className="font-medium">Attendant(s):</span> {transaction?.assignedWashers?.map(washer => washer.name).join(", ") || "—"}</p>
                <p><span className="font-medium">Started:</span> {transaction?.startedAt ? new Date(transaction.startedAt).toLocaleString() : "—"}</p>
                <p className="text-sm text-muted-foreground">This vehicle is now visible on the live bay board.</p>
              </CardContent>
              <CardFooter className="gap-2">
                <Button variant="outline" onClick={() => setStep("services")}>Back to Services</Button>
                <Button onClick={() => setStep("payment")}>Complete Wash <ChevronRight className="ml-2" /></Button>
              </CardFooter>
            </Card>
          </motion.div>
        );
      case "payment":
        const paymentTotal = allServices?.filter(s => servicesForm.getValues("selectedServices").includes(s.id)).reduce((acc, s) => acc + s.price, 0) || 0;
        const watchPaymentMethod = paymentForm.watch("paymentMethod");
        return (
            <motion.div {...motionProps}>
            <Card>
                <CardHeader>
                    <CardTitle>3. Payment</CardTitle>
                    <CardDescription>Total amount: <span className="font-bold text-lg text-primary">{formatCurrency(paymentTotal)}</span></CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...paymentForm}>
                        <form onSubmit={paymentForm.handleSubmit(handlePaymentSubmit)} className="space-y-6">
                            <FormField control={paymentForm.control} name="paymentMethod" render={({ field }) => (
                                <FormItem className="space-y-3"><FormLabel>Payment Method</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Cash" /></FormControl><FormLabel className="font-normal">Cash</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Airtel Money" /></FormControl><FormLabel className="font-normal">Airtel Money</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Mobile Money" /></FormControl><FormLabel className="font-normal">Other Mobile Money</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Bank Transfer" /></FormControl><FormLabel className="font-normal">Bank Transfer</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Other" /></FormControl><FormLabel className="font-normal">Other</FormLabel></FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="Corporate Account" /></FormControl><FormLabel className="font-normal">Corporate Account (Bill Later)</FormLabel></FormItem>
                                    </RadioGroup>
                                </FormControl><FormMessage />
                                </FormItem>
                            )}/>

                            {watchPaymentMethod === "Corporate Account" && (
                                <FormField
                                    control={paymentForm.control}
                                    name="corporateCompanyId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Company to bill</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                value={field.value || undefined}
                                                disabled={isLoadingCorporateCompanies || Boolean(corporateCompaniesError) || activeCorporateCompanies.length === 0}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select a corporate company" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {activeCorporateCompanies.length > 0
                                                        ? activeCorporateCompanies.map(company => (
                                                            <SelectItem key={company.id} value={company.id}>
                                                                {company.name}
                                                            </SelectItem>
                                                        ))
                                                        : <SelectItem value="no-companies" disabled>No active companies available</SelectItem>}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription>
                                                {activeCorporateCompanies.length > 0
                                                    ? "This wash will be added to the selected company's outstanding balance."
                                                    : isLoadingCorporateCompanies
                                                        ? "Loading available companies..."
                                                        : corporateCompaniesError
                                                            ? "The company list could not be loaded. Check Firestore access and try again."
                                                            : "Ask an admin to add a company under Admin > Corporate before billing this wash."}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            {(watchPaymentMethod === "Airtel Money" || watchPaymentMethod === "Mobile Money" || watchPaymentMethod === "Bank Transfer" || watchPaymentMethod === "Corporate Account") && (
                                <FormField control={paymentForm.control} name="reference" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {watchPaymentMethod === "Corporate Account" ? "Invoice / PO Reference" : `${watchPaymentMethod} Transaction Reference`}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={watchPaymentMethod === "Corporate Account" ? "e.g. INV-001" : "e.g. 1234567890"}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {watchPaymentMethod === "Corporate Account" ? "Reference for billing purposes." : "Enter the transaction reference from the customer's mobile money confirmation."}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            )}

                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => setStep("services")}><ChevronLeft className="mr-2" />Back to Services</Button>
                                <Button type="submit" disabled={isSubmitting}>
                                  {isSubmitting && <Loader2 className="animate-spin mr-2" />}
                                  Complete Transaction
                                  <Check className="ml-2" />
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
            </motion.div>
        );
      case "receipt": {
        const isVoided = transaction?.status === "Voided";
        const isPendingPayment = transaction?.status === "Pending Payment";
        return (
            <motion.div {...motionProps}>
            <Card className="max-w-md mx-auto">
                <CardHeader className="text-center">
                    <div className={`mx-auto rounded-full h-16 w-16 flex items-center justify-center ${isVoided ? 'bg-destructive/10' : isPendingPayment ? 'bg-amber-100' : 'bg-accent'}`}>
                        {isVoided
                          ? <Ban className="h-10 w-10 text-destructive" />
                          : isPendingPayment
                            ? <Loader2 className="h-10 w-10 text-amber-600" />
                            : <Check className="h-10 w-10 text-accent-foreground" />}
                    </div>
                    <CardTitle className="mt-4">
                        {isVoided ? 'Transaction Voided' : isPendingPayment ? 'Billed to Account' : 'Transaction Complete'}
                    </CardTitle>
                    <CardDescription>Receipt ID: {transaction?.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                   {currentVehicle?.photoDataUri && (
                     <div className="rounded-md overflow-hidden border">
                        <img src={currentVehicle.photoDataUri} alt="Vehicle" className="aspect-video w-full object-cover" />
                     </div>
                   )}
                    <div className="space-y-2 rounded-md border p-4">
                        <div className="flex justify-between"><span className="text-muted-foreground">License Plate</span><span className="font-medium">{transaction?.licensePlate}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Make / Model</span><span className="font-medium">{[transaction?.vehicleMake, transaction?.vehicleModel].filter(Boolean).join(" ") || "—"}</span></div>
                        {transaction?.corporateCompanyName && <div className="flex justify-between"><span className="text-muted-foreground">Billed to</span><span className="font-medium">{transaction.corporateCompanyName}</span></div>}
                        <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{transaction ? new Date(transaction.timestamp).toLocaleString() : ''}</span></div>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-medium">Services Rendered</h4>
                        {transaction?.services.map(s => (
                            <div key={s.id} className="flex justify-between"><span>{s.name}</span><span>{formatCurrency(s.price)}</span></div>
                        ))}
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{formatCurrency(transaction?.totalAmount || 0)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid</span><span>{formatCurrency(transaction?.amountPaid || 0)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Outstanding</span><span>{formatCurrency(transaction?.outstandingBalance || 0)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payment Method</span><span>{transaction?.payment.method}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Status</span><span className={isVoided ? 'text-destructive font-medium' : isPendingPayment ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>{transaction?.status}</span></div>
                    <p className="border-t pt-3 text-center text-xs text-muted-foreground">Suggestions and complaints: {suggestionsPhone}</p>
                    {transaction?.payment.reference && (
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Reference</span>
                            <span className="font-mono text-xs">{transaction.payment.reference}</span>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                    {transaction && transaction.status !== 'Voided' && (
                        <div className="w-full text-center text-sm">
                          <p className={transaction.receiptDeliveryStatus === "Sent" ? "text-green-700" : "text-amber-700"}>
                            Receipt delivery: {transaction.receiptDeliveryStatus || "Not sent"}
                          </p>
                          {transaction.receiptDeliveryError && <p className="text-xs text-muted-foreground">{transaction.receiptDeliveryError}</p>}
                        </div>
                    )}
                    {transaction && transaction.status !== 'Voided' && (
                        <Button className="w-full" variant="outline" onClick={handleResendReceipt} disabled={!currentVehicle?.phoneNumber || !currentVehicle.whatsappReceiptConsent || isSubmitting}>
                            Resend Receipt
                        </Button>
                    )}
                    {transaction && transaction.status !== 'Voided' && (
                        <Button
                            className="w-full"
                            variant="outline"
                            onClick={handleShareReceipt}
                            disabled={!currentVehicle?.phoneNumber || !currentVehicle.whatsappReceiptConsent}
                        >
                            <Share2 className="mr-2" /> Open WhatsApp Receipt
                        </Button>
                    )}
                    {!currentVehicle?.phoneNumber && transaction && transaction.status !== 'Voided' && (
                        <p className="text-xs text-muted-foreground text-center px-4">
                            Add a phone number to the vehicle to enable WhatsApp sharing.
                        </p>
                    )}
                    {transaction && transaction.status !== 'Voided' && user?.profile?.role === 'Admin' && (
                        <Button
                            className="w-full"
                            variant="destructive"
                            onClick={() => setIsVoidDialogOpen(true)}
                            disabled={isVoiding}
                        >
                            <Ban className="mr-2" /> Void Transaction
                        </Button>
                    )}
                    <Button className="w-full" onClick={startNew}>Start New Wash <ChevronRight className="ml-2" /></Button>
                </CardFooter>
            </Card>
            </motion.div>
        );
      }
    }
  };
  
  return (
    <>
      <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
      <AnimatePresence>
      {isCameraOpen && (
        <VehicleCamera
          onCapture={handlePhotoCaptured}
          onClose={() => setIsCameraOpen(false)}
        />
      )}
      </AnimatePresence>

      <AlertDialog open={isVoidDialogOpen} onOpenChange={setIsVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark transaction {transaction?.id} as Voided and exclude it from revenue reports. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVoiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoidTransaction}
              disabled={isVoiding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isVoiding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Void Transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

    

    



    

    