import { AttendantSummary } from "@/components/dashboard/attendant-summary";

export default function AttendantSummaryPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">My Shift</h1>
      <p className="text-muted-foreground mb-4">
        Cash you have collected and the cars you have washed.
      </p>
      <AttendantSummary />
    </div>
  );
}
