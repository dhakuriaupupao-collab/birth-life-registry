import { useApp } from "@/lib/store";
import { formatUnionFullName } from "@/lib/union-label";

export function AssignedUnionHeader({
  stationId: stationIdProp,
  upazilaId: upazilaIdProp,
}: {
  stationId?: string | undefined;
  upazilaId?: string | undefined;
}) {
  const { L, user, state } = useApp();
  const stationId = stationIdProp ?? user?.stationId ?? user?.unionId;
  const upazila =
    (upazilaIdProp ? state.upazilas.find((item) => item.id === upazilaIdProp) : undefined) ??
    state.upazilas.find(
      (item) => item.id === user?.upazilaId && item.unions.some((union) => union.id === stationId),
    ) ??
    state.upazilas.find((item) => item.unions.some((union) => union.id === stationId));
  const union = upazila?.unions.find((item) => item.id === stationId);
  if (!upazila || !union) return null;

  const label = L(
    formatUnionFullName(union, upazila.unions, upazila, "bn"),
    formatUnionFullName(union, upazila.unions, upazila, "en"),
  );

  return (
    <p className="mb-3 max-w-3xl rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-center text-base font-bold leading-snug text-white shadow-md sm:px-6 sm:py-4 sm:text-xl">
      {label}
    </p>
  );
}
