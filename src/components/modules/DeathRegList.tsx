import { AdministrativeRegistrationList } from "./AdministrativeRegistrationList";
import type { RegCase } from "@/lib/types";

export function DeathRegList({ cases, onHome }: { cases?: RegCase[] | null; onHome?: () => void }) {
  return (
    <AdministrativeRegistrationList
      type="death"
      {...(cases !== undefined ? { cases } : {})}
      {...(onHome ? { onHome } : {})}
    />
  );
}
