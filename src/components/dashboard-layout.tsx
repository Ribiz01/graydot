"use client";

import React, { useEffect } from "react";
import { useUser } from "@/firebase/auth/use-user";
import { usePathname, useRouter } from "next/navigation";
import {
  Car,
  Home,
  Loader2,
  LogOut,
  MapPin,
  BarChart2,
  Trophy,
  Users,
  Wrench,
  HardHat,
  Briefcase,
  Wallet,
  ReceiptText,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Logo } from "./icons/logo";

const adminNav = [
  { href: "/admin", icon: Home, label: "Dashboard" },
  { href: "/admin/reports", icon: BarChart2, label: "Reports" },
  { href: "/admin/banking", icon: ReceiptText, label: "Banking & Expenses" },
  { href: "/admin/customers", icon: Trophy, label: "Customers" },
  { href: "/admin/corporate", icon: Briefcase, label: "Corporate" },
  { href: "/admin/locations", icon: MapPin, label: "Locations" },
  { href: "/admin/services", icon: Wrench, label: "Services" },
  { href: "/admin/users", icon: Users, label: "Users" },
  { href: "/admin/washers", icon: Users, label: "Washers" },
  { href: "/dashboard", icon: HardHat, label: "Attendant View" },
];

const attendantNav = [
  { href: "/dashboard", icon: Car, label: "New Wash" },
  { href: "/dashboard/summary", icon: Wallet, label: "My Shift" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useUser();
  const router = useRouter();
  // usePathname (not window.location) so the active item updates on client-side navigation.
  const currentPath = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const navItems = user.profile?.role === 'Admin' ? adminNav : attendantNav;
  const fallbackInitial = (user.profile?.name || user.email || 'U').charAt(0).toUpperCase();
  
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border px-5 py-5">
            <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <Car className="size-5" />
                </span>
                <Logo className="h-auto min-w-0" />
            </div>
        </SidebarHeader>
        <SidebarContent className="px-3 py-5">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase text-sidebar-foreground/50">Workspace</p>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  onClick={() => router.push(item.href)}
                  isActive={currentPath === item.href}
                  size="lg"
                  className="h-10 px-3 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-sm"
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border px-4 py-4">
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent/70 p-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{fallbackInitial}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium truncate">{user.profile?.name || user.email}</span>
                <span className="text-xs text-sidebar-foreground/70 truncate">
                  {user.profile?.role || 'User'}
                  {user.profile?.locationName ? ` · ${user.profile.locationName}` : ''}
                </span>
            </div>
          </div>
          <SidebarMenuButton onClick={logout} >
            <LogOut />
            <span>Logout</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border/80 bg-background/95 px-3 backdrop-blur sm:px-5 lg:px-8">
            <SidebarTrigger className="size-10 shrink-0 rounded-md border border-border bg-card text-foreground md:hidden" />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase text-muted-foreground">Graydot / {user.profile?.role || "Workspace"}</p>
              <p className="truncate text-sm font-semibold sm:text-base">{navItems.find(item => item.href === currentPath)?.label || "Operations"}</p>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-2 text-xs text-muted-foreground sm:gap-3 sm:text-sm">
              <MapPin className="size-4 shrink-0 text-primary" />
              <span className="max-w-36 truncate sm:max-w-none">{user.profile?.locationName || "All locations"}</span>
            </div>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 overflow-y-auto px-3 py-5 sm:px-5 sm:py-6 lg:px-8">
            {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
