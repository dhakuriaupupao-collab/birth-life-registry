import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertTriangle, Download, FileText, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { readUnionVillageMaster, saveUnionVillageDraft, scopedCases, useApp } from "@/lib/store";
import { downloadCSV, printPDF } from "@/lib/report";
import { type Status, type Upazila, type Union, type Village } from "@/lib/types";
import { PageTitle, Stat, redFlags, useCaseHelpers } from "../shared";
import { CaseReview } from "./CaseReview";
import { UnionStatisticsPanel } from "./UnionStatisticsPanel";
import { useAssignedRegistrationTarget } from "@/lib/use-assigned-registration-target";
import { AssignedUnionProgressCard } from "./AssignedUnionProgressCard";
import { AssignedUnionHeader } from "./AssignedUnionHeader";

export function VillageManager({ upazila, union }: { upazila: Upazila; union: Union }) {
  const { L, saveUnionVillages } = useApp();
  const [villages, setVillages] = useState<Village[]>(() => readUnionVillageMaster(union.id) ?? union.villages);
  const [newVillage, setNewVillage] = useState({ bn: "", en: "", ward: "1", poBn: "", poEn: "" });
  const [saving, setSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(true);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVillages(readUnionVillageMaster(union.id) ?? union.villages);
    setDraftSaved(true);
  }, [union.id, union.villages]);

  useEffect(() => {
    setDraftSaved(false);
    const timer = window.setTimeout(() => {
      if (saveUnionVillageDraft(union.id, villages)) setDraftSaved(true);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [union.id, villages]);

  const updateVillage = (id: string, patch: Partial<Village>) => {
    setVillages((current) =>
      current.map((village) => village.id === id ? { ...village, ...patch } : village),
    );
  };

  const addVillage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ward = Number(newVillage.ward);
    if (
      !newVillage.bn.trim() ||
      !newVillage.en.trim() ||
      !newVillage.poBn.trim() ||
      !newVillage.poEn.trim() ||
      !Number.isInteger(ward) ||
      ward < 1 ||
      ward > 99
    ) {
      toast.error(L("গ্রামের নাম, ডাকঘর এবং ১–৯৯-এর মধ্যে ওয়ার্ড দিন", "Enter village names, post office names, and a ward from 1 to 99"));
      return;
    }
    setVillages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        bn: newVillage.bn.trim(),
        en: newVillage.en.trim(),
        ward,
        poBn: newVillage.poBn.trim(),
        poEn: newVillage.poEn.trim(),
      },
    ]);
    setNewVillage({ bn: "", en: "", ward: "1", poBn: "", poEn: "" });
  };

  const exportBackup = () => {
    const backup = {
      version: 1,
      unionId: union.id,
      unionBn: union.bn,
      unionEn: union.en,
      upazilaBn: upazila.bn,
      upazilaEn: upazila.en,
      districtBn: upazila.districtBn,
      districtEn: upazila.districtEn,
      exportedAt: new Date().toISOString(),
      villages,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `village-ward-${union.id}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(L("ব্যাকআপ ফাইল তৈরি হয়েছে", "Backup file downloaded"));
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        unionId?: string;
        villages?: unknown;
      };
      if (!Array.isArray(parsed.villages)) throw new Error("Invalid village backup");
      const imported = parsed.villages.filter((item): item is Village => {
        if (!item || typeof item !== "object") return false;
        const value = item as Partial<Village>;
        return typeof value.id === "string" && typeof value.bn === "string" && typeof value.en === "string" && typeof value.ward === "number" && typeof value.poBn === "string" && typeof value.poEn === "string";
      });
      if (imported.length !== parsed.villages.length) throw new Error("Incomplete village backup");
      setVillages(imported);
      if (!saveUnionVillageDraft(union.id, imported)) throw new Error("Local draft save failed");
      setDraftSaved(true);
      toast.success(L("ব্যাকআপ থেকে গ্রাম তালিকা পুনরুদ্ধার হয়েছে", "Village list restored from backup"));
    } catch (cause) {
      console.error("Could not import village backup", cause);
      toast.error(L("বৈধ village backup JSON নির্বাচন করুন", "Select a valid village backup JSON file"));
    }
  };

  const save = async () => {
    if (villages.some((village) => !village.bn.trim() || !village.en.trim() || !village.poBn.trim() || !village.poEn.trim())) {
      toast.error(L("প্রতিটি গ্রামের নাম ও ডাকঘরের বাংলা/ইংরেজি তথ্য দিন", "Enter village and post office names in both Bangla and English for every village"));
      return;
    }
    setSaving(true);
    try {
      if (await saveUnionVillages(villages, union.id)) {
        toast.success(L("গ্রাম ও ওয়ার্ডের তথ্য সংরক্ষিত হয়েছে", "Village and ward details saved"));
      }
    } catch (cause) {
      console.error("Could not save union village setup", cause);
      toast.error(L("গ্রাম ও ওয়ার্ডের তথ্য সংরক্ষণ করা যায়নি", "Could not save village and ward details"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-emerald-200 bg-card p-4">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-emerald-950">{L("গ্রাম ও ওয়ার্ড ব্যবস্থাপনা", "Village & Ward Manager")}</h2>
        <p className="text-sm text-muted-foreground">
          {L(`${union.bn} · ${upazila.bn} উপজেলা · ${upazila.districtBn} জেলা`, `${union.en} · ${upazila.en} Upazila · ${upazila.districtEn} District`)}
        </p>
      </div>

      <form onSubmit={addVillage} className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_8rem_auto]">
        <Input required value={newVillage.bn} maxLength={160} placeholder={L("গ্রামের নাম (বাংলা)", "Village name (Bangla)")} onChange={(event) => setNewVillage((current) => ({ ...current, bn: event.target.value }))} />
        <Input required value={newVillage.en} maxLength={160} placeholder={L("Village name (English)", "Village name (English)")} onChange={(event) => setNewVillage((current) => ({ ...current, en: event.target.value }))} />
        <Input required value={newVillage.poBn} maxLength={160} placeholder={L("ডাকঘরের নাম (বাংলা)", "Post office (Bangla)")} onChange={(event) => setNewVillage((current) => ({ ...current, poBn: event.target.value }))} />
        <Input required value={newVillage.poEn} maxLength={160} placeholder={L("Post office (English)", "Post office (English)")} onChange={(event) => setNewVillage((current) => ({ ...current, poEn: event.target.value }))} />
        <Input required type="number" min={1} max={99} value={newVillage.ward} placeholder={L("ওয়ার্ড নং", "Ward no.")} onChange={(event) => setNewVillage((current) => ({ ...current, ward: event.target.value }))} />
        <Button type="submit" className="w-full lg:w-auto" aria-label={L("গ্রাম যোগ করুন", "Add village")}><Plus className="mr-2 h-4 w-4" />{L("যোগ করুন", "Add")}</Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="hidden min-w-[920px] grid-cols-[1fr_1fr_1fr_1fr_8rem_3rem] gap-2 border-b bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-950 sm:grid">
          <span>{L("গ্রামের নাম বাংলায়", "Village name in Bangla")}</span>
          <span>{L("গ্রামের নাম ইংরেজিতে", "Village name in English")}</span>
          <span>{L("ডাকঘর বাংলায়", "Post office in Bangla")}</span>
          <span>{L("ডাকঘর ইংরেজিতে", "Post office in English")}</span>
          <span>{L("ওয়ার্ড নং", "Ward number")}</span>
          <span className="text-center">{L("মুছুন", "Delete")}</span>
        </div>
        <div className="max-h-80 min-w-0 space-y-2 overflow-y-auto p-2 sm:min-w-[920px]">
        {villages.map((village) => (
          <div key={village.id} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_8rem_auto]">
            <Input aria-label={L("গ্রামের নাম বাংলা", "Village name in Bangla")} value={village.bn} maxLength={160} onChange={(event) => updateVillage(village.id, { bn: event.target.value })} />
            <Input aria-label={L("গ্রামের নাম ইংরেজি", "Village name in English")} value={village.en} maxLength={160} onChange={(event) => updateVillage(village.id, { en: event.target.value })} />
            <Input aria-label={L("ডাকঘর বাংলা", "Post office in Bangla")} value={village.poBn} maxLength={160} onChange={(event) => updateVillage(village.id, { poBn: event.target.value })} />
            <Input aria-label={L("ডাকঘর ইংরেজি", "Post office in English")} value={village.poEn} maxLength={160} onChange={(event) => updateVillage(village.id, { poEn: event.target.value })} />
            <Input aria-label={L("ওয়ার্ড নং", "Ward number")} type="number" min={1} max={99} value={village.ward} onChange={(event) => updateVillage(village.id, { ward: Number(event.target.value) })} />
            <Button type="button" variant="outline" aria-label={L("গ্রাম মুছুন", "Remove village")} onClick={() => setVillages((current) => current.filter((item) => item.id !== village.id))}>
              <Trash2 className="h-4 w-4 text-red-700" />
            </Button>
          </div>
        ))}
        {villages.length === 0 && <p className="text-sm text-muted-foreground">{L("এখনও কোনো গ্রাম যোগ করা হয়নি", "No villages have been added yet")}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground" role="status">
          {draftSaved
            ? L("স্থানীয় স্বয়ংক্রিয় ব্যাকআপ সংরক্ষিত", "Local automatic backup saved")
            : L("স্থানীয় ব্যাকআপে সংরক্ষণ হচ্ছে…", "Saving to local backup…")}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importBackup(event)} />
          <Button type="button" variant="outline" onClick={exportBackup}>
            <Download className="mr-2 h-4 w-4" />{L("ব্যাকআপ ডাউনলোড", "Export backup")}
          </Button>
          <Button type="button" variant="outline" onClick={() => importInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />{L("ব্যাকআপ পুনরুদ্ধার", "Import backup")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />{saving ? L("সংরক্ষণ হচ্ছে…", "Saving…") : L("গ্রাম ও ওয়ার্ড সংরক্ষণ", "Save village setup")}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function AdminDashboard() {
  const { L, n, user, state } = useApp();
  const stationTarget = useAssignedRegistrationTarget();
  const { rows } = useCaseHelpers();
  const [filter, setFilter] = useState<Status | "all">("all");
  const cases = scopedCases(state, user);
  const up = state.upazilas.find((u) => u.id === user!.upazilaId)!;
  const stationId = user!.stationId ?? user!.unionId;
  const un = up.unions.find((u) => u.id === stationId)!;
  const b = stationTarget?.counts.birth.completed ?? 0;
  const d = stationTarget?.counts.death.completed ?? 0;
  const flags = redFlags(state, user!.upazilaId, stationId);
  const shown = cases.filter((c) => filter === "all" || c.status === filter);
  const targets = stationTarget?.target &&
    stationTarget.target.unionId === (user!.stationId ?? user!.unionId)
    ? stationTarget.target
    : { birth: 0, death: 0 };

  return (
    <>
      <div className="mb-6">
        <AssignedUnionHeader />
        <AssignedUnionProgressCard />
      </div>
      <PageTitle title={L(un.bn, un.en)} sub={L(`${up.bn} উপজেলা · প্রশাসনিক কর্মকর্তা`, `${up.en} Upazila · Administrative Officer`)}
        actions={<>
          <Button variant="outline" onClick={() => downloadCSV(rows(cases), "union-report.csv")}><Download className="mr-1 h-4 w-4" />{L("ইউনিয়ন রিপোর্ট", "Union Report")}</Button>
          <Button variant="outline" onClick={() => printPDF(`Union Report — ${un.en}`, rows(cases))}><FileText className="mr-1 h-4 w-4" />PDF</Button>
        </>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {([["birth", b, targets.birth, L("এ মাসে জন্ম নিবন্ধন সম্পন্ন", "Birth registrations completed this month")], ["death", d, targets.death, L("এ মাসে মৃত্যু নিবন্ধন সম্পন্ন", "Death registrations completed this month")]] as const).map(([k, v, t, lbl]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-4">
            <div className="flex justify-between text-sm"><span>{lbl}</span><b>{n(v)} / {n(t)}</b></div>
            <Progress value={t > 0 ? Math.min(100, (v / t) * 100) : 0} className="mt-2 h-3" />
          </div>
        ))}
      </div>
      <VillageManager upazila={up} union={un} />
      <UnionStatisticsPanel
        upazila={up}
        cases={cases}
        unions={[un]}
        selectedUnionId={un.id}
        showUnionFilter={false}
      />
      {flags.length > 0 && (
        <div className="mb-6 rounded-xl border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />{L("১৫ দিন ধরে কোনো এন্ট্রি নেই", "No entries for 15 days")}</div>
          <ul className="mt-1 text-sm">{flags.map((u) => <li key={u.id}>{L(u.name.bn, u.name.en)} · {L("ওয়ার্ড", "Ward")} {n(u.ward ?? 1)}</li>)}</ul>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={L("মোট", "Total")} value={n(cases.length)} />
        <Stat label={L("অপেক্ষমাণ", "Pending")} value={n(cases.filter((c) => c.status === "pending").length)} />
        <Stat label={L("চলমান", "In Progress")} value={n(cases.filter((c) => c.status === "progress").length)} />
        <Stat label={L("সম্পন্ন", "Completed")} value={n(cases.filter((c) => c.status === "completed").length)} />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["all", "pending", "progress", "completed"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {{ all: L("সব", "All"), pending: L("অপেক্ষমাণ", "Pending"), progress: L("চলমান", "In Progress"), completed: L("সম্পন্ন", "Completed") }[f]}
          </Button>
        ))}
      </div>
      <div className="space-y-3">{shown.map((c) => <CaseReview key={c.id} c={c} mode="admin" />)}</div>
    </>
  );
}
