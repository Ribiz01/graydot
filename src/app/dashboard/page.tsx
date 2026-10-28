import { Workflow } from "@/components/dashboard/workflow";

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <div className="border-b border-border/80 pb-4">
        <p className="text-[10px] font-bold uppercase text-primary">Attendant / Intake</p>
        <h1 className="mt-1 text-2xl font-bold">New Car Wash</h1>
      </div>
      <Workflow />
    </div>
  );
}
