import { toast } from "sonner";
import { Home, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { scopedCases, useApp } from "@/lib/store";
import { PageTitle, useCaseHelpers } from "../shared";
import { UnifiedStationDashboardTop } from "./UnifiedStationDashboardTop";
import { AssignedUnionHeader } from "./AssignedUnionHeader";

export function PoliceDashboard() {
  const { L, n, user, state, patchCase, demoMode, activeUnionId } = useApp();
  const { address } = useCaseHelpers();
  const tasks = scopedCases(state, user);
  const open = tasks.filter((c) => !c.police!.collected);
  const stationId = user
    ? demoMode
      ? activeUnionId ?? user.stationId ?? user.unionId
      : user.stationId ?? user.unionId
    : undefined;

  return (
    <>
      <div className="mx-auto mb-6 max-w-6xl">
        {stationId && user && <AssignedUnionHeader stationId={stationId} upazilaId={user.upazilaId} />}
        <UnifiedStationDashboardTop showAssignedUnionHeader={false} />
      </div>
      <div className="mx-auto max-w-xl">
        <PageTitle title={L("আমার বাড়ির তালিকা", "My Assigned Houses")} sub={L(`ওয়ার্ড ${n(user!.ward ?? 1)} · বাকি ${n(open.length)}টি`, `Ward ${user!.ward} · ${open.length} remaining`)} />
        <div className="space-y-3">
          {tasks.map((c) => {
            const p = c.police!;
            const toggle = (k: "epiCard" | "parentNid") => void patchCase(c.id, { police: { ...p, [k]: !p[k] } });
            return (
              <div key={c.id} className={`rounded-2xl border p-4 ${p.collected ? "border-success/50 bg-success/10" : "border-border bg-card"}`}>
                <div className="flex items-start gap-3">
                  <Home className="mt-1 h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <div className="text-lg font-semibold">{L(c.father.bn, c.father.en)}{L("-এর বাড়ি", "'s house")}</div>
                    <div className="text-sm text-muted-foreground">{address(c)}</div>
                    <div className="text-sm">{c.type === "birth" ? L("শিশু", "Child") : L("মৃত", "Deceased")}: {L(c.name.bn, c.name.en)}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {([["epiCard", L("ইপিআই কার্ড", "EPI Card")], ["parentNid", L("পিতা/মাতার NID", "Parent NID")]] as const).map(([k, lbl]) => (
                    <label key={k} className="flex items-center gap-3 rounded-lg border border-border p-3 text-base">
                      <Checkbox checked={p[k]} disabled={p.collected} onCheckedChange={() => toggle(k)} className="h-6 w-6" />{lbl}
                    </label>
                  ))}
                </div>
                {p.collected ? (
                  <div className="mt-3 flex items-center gap-2 font-medium text-success"><CheckCircle2 className="h-5 w-5" />{L("সংগ্রহ সম্পন্ন", "Documents collected")}</div>
                ) : (
                  <Button size="lg" className="mt-3 h-14 w-full text-base" disabled={!p.epiCard || !p.parentNid}
                    onClick={async () => { if (!(await patchCase(c.id, { police: { ...p, collected: true, collectedAt: Date.now() } }))) return; toast.success(L("প্রশাসনিক কর্মকর্তাকে জানানো হয়েছে", "Admin notified")); }}>
                    {L("কাগজ সংগ্রহ সম্পন্ন", "Documents Collected")}
                  </Button>
                )}
              </div>
            );
          })}
          {!tasks.length && <p className="text-muted-foreground">{L("কোনো কাজ নির্ধারিত নেই", "No tasks assigned")}</p>}
        </div>
      </div>
    </>
  );
}
