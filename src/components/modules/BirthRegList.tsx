import { AdministrativeRegistrationList } from "./AdministrativeRegistrationList";
import type { RegCase } from "@/lib/types";

export function BirthRegList({ cases, onHome }: { cases?: RegCase[] | null; onHome?: () => void }) {
  return (
    <AdministrativeRegistrationList
      type="birth"
      {...(cases !== undefined ? { cases } : {})}
      {...(onHome ? { onHome } : {})}
    />
  );
}
