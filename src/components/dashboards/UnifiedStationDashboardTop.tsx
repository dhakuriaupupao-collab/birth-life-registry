import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { getDhakaMonthYear, getMonthlyStationCaseCounts } from "@/lib/monthly-targets";
import type { RegCase } from "@/lib/types";
import { MonthlyProgressCard, type MonthlyProgressCounts } from "./MonthlyProgressCard";
import { AssignedUnionProgressCard } from "./AssignedUnionProgressCard";
import { AssignedUnionHeader } from "./AssignedUnionHeader";

export function UnifiedStationDashboardTop({
  stationId: stationIdProp,
  showAssignedUnionHeader = true,
}: {
  stationId?: string | undefined;
  showAssignedUnionHeader?: boolean;
}) {
  const { L, state, user } = useApp();
  const stationId = stationIdProp ?? user?.stationId ?? user?.unionId;
  const location = stationId
    ? state.upazilas
        .map((upazila) => ({
          upazila,
          union: upazila.unions.find((union) => union.id === stationId),
        }))
        .find((item) => item.union)
    : undefined;
  const unifiedCases = useMemo(() => {
    if (!stationId) return [];
    return state.cases.filter((item) =>
      item.upazilaId === location?.upazila.id &&
      (item.stationId ?? item.unionId) === stationId,
    );
  }, [location?.upazila.id, state.cases, stationId]);

  const isAssignedUnionView =
    !stationIdProp &&
    (user?.role === "admin" || user?.role === "worker" || user?.role === "police");
  const counts = useMemo<MonthlyProgressCounts>(
    () =>
      getMonthlyStationCaseCounts(
        unifiedCases,
        location?.upazila.id ?? "",
        stationId ?? "",
        getDhakaMonthYear(),
      ),
    [location?.upazila.id, stationId, unifiedCases],
  );
  const received = (counts.birth.total ?? 0) + (counts.death.total ?? 0);

  return (
    <div className="grid min-h-0 gap-1 sm:gap-2 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-3">
      <div className="flex min-h-0 flex-col justify-center">
        {showAssignedUnionHeader && stationId && location && (
          <AssignedUnionHeader stationId={stationId} upazilaId={location.upazila.id} />
        )}
        <h1 id="e-registration-tracker" className="max-w-3xl scroll-mt-24 font-display text-2xl font-bold leading-tight tracking-tight text-[#102a43] max-[360px]:text-xl sm:text-3xl lg:text-4xl">
          ই-নিবন্ধন ট্র্যাকার
        </h1>
        <p className="mt-1 max-w-3xl text-xs font-semibold leading-snug text-teal-800 max-[360px]:text-[11px] sm:text-sm lg:text-base">
          Birth &amp; Death Registration 365-Day Compliance System
        </p>
        <p className="mt-1 max-w-3xl text-[11px] font-medium leading-snug text-slate-700 sm:text-xs">
          {L(
            "জন্মের ৩৬৫ দিনের মধ্যে জন্ম ও মৃত্যু নিবন্ধন নিশ্চিতকরণ ব্যবস্থা",
            "A system to ensure birth and death registration within 365 days",
          )}
        </p>
      </div>
      {isAssignedUnionView ? (
        <AssignedUnionProgressCard />
      ) : (
        <MonthlyProgressCard
          counts={counts}
          received={received}
          targets={{ birth: 0, death: 0 }}
          reportCases={unifiedCases as RegCase[]}
          reportsEnabled
          featured
        />
      )}
    </div>
  );
}
