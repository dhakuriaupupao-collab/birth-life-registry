import { useMemo } from "react";
import { MonthlyProgressCard, type MonthlyProgressCounts } from "@/components/dashboards/MonthlyProgressCard";
import { useAssignedRegistrationTarget } from "@/lib/use-assigned-registration-target";
import { useApp } from "@/lib/store";
import type { RegCase } from "@/lib/types";

const EMPTY_COUNTS: MonthlyProgressCounts = {
  birth: { pending: 0, progress: 0, completed: 0, total: 0 },
  death: { pending: 0, progress: 0, completed: 0, total: 0 },
};

export function AssignedUnionProgressCard() {
  const { L, user, state, demoMode } = useApp();
  const metrics = useAssignedRegistrationTarget();
  const stationId = user?.stationId ?? user?.unionId;
  const reportCases = useMemo(
    () =>
      user && stationId
        ? state.cases.filter(
            (item) =>
              item.upazilaId === user.upazilaId &&
              (item.stationId ?? item.unionId) === stationId,
          )
        : ([] as RegCase[]),
    [state.cases, stationId, user],
  );
  const counts = metrics?.counts ?? EMPTY_COUNTS;
  const targets = metrics?.target
    ? { birth: metrics.target.birth, death: metrics.target.death }
    : { birth: 0, death: 0 };
  const received = (counts.birth.total ?? 0) + (counts.death.total ?? 0);
  const warning =
    demoMode
      ? L("ডেমোতে অফিসিয়াল স্টেশন পরিসংখ্যান দেখানো হয় না", "Official station metrics are unavailable in demo mode")
      : !metrics
        ? L("অফিসিয়াল স্টেশন পরিসংখ্যান লোড হচ্ছে বা অনুপলব্ধ", "Official station metrics are loading or unavailable")
      : !metrics.target
        ? L(
          "এই মাসের জন্য UNO-এর জমা দেওয়া লক্ষ্যমাত্রা পাওয়া যায়নি",
          "No submitted UNO target was found for this month",
        )
        : undefined;

  return (
    <MonthlyProgressCard
      counts={counts}
      received={received}
      targets={targets}
      reportCases={reportCases}
      reportsEnabled
      featured
      {...(warning ? { warning } : {})}
    />
  );
}
