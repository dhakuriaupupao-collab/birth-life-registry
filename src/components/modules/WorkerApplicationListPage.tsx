import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCheck, Clock3, Eye, FileText, Filter, Home, Paperclip, Pencil, Printer } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, useCaseHelpers } from "@/components/shared";
import { supabase } from "@/integrations/supabase/client";
import { getDemoAttachmentPreview, scopedCases, useApp } from "@/lib/store";
import { roleLabel } from "@/lib/store";
import type { RegCase } from "@/lib/types";

type StatusFilter = "all" | "pending" | "progress" | "completed" | "issue" | "corrected";
type AttachmentPreview = { url: string; mimeType?: string };
type CaseAuditEntry = {
  id: number;
  action: string;
  at: string;
  client_hint: string | null;
  role: string | null;
  status_from: string | null;
  status_to: string | null;
  user_id: string | null;
};
export type AdministrativeApplicationListOptions = {
  cases: RegCase[];
  actions: (item: RegCase, onReviewPhotos: () => void) => ReactNode;
  onRegister: (item: RegCase) => void;
  onEdit: (item: RegCase) => void;
  onHome: () => void;
  localPreview?: boolean;
};

function normalizeAttachmentUrl(url: string, mimeType?: string, fileName?: string) {
  if (/^(data:|blob:|https?:)/i.test(url)) return url;
  if (url.startsWith("/")) return new URL(url, window.location.origin).href;
  const inferredType =
    mimeType ?? (fileName ? mimeTypeFromFileName(fileName) : undefined) ?? "image/jpeg";
  return `data:${inferredType};base64,${url}`;
}

export function WorkerApplicationListPage({
  type,
  administrative,
}: {
  type: "birth" | "death";
  administrative?: AdministrativeApplicationListOptions;
}) {
  const { L, n, user, state, findVillage, demoMode, lang } = useApp();
  const navigate = useNavigate();
  const { address, date } = useCaseHelpers();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const [selectedApplication, setSelectedApplication] = useState<RegCase | null>(null);
  const [caseAuditHistory, setCaseAuditHistory] = useState<CaseAuditEntry[]>([]);
  const [auditHistoryLoading, setAuditHistoryLoading] = useState(false);
  const [auditHistoryError, setAuditHistoryError] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<RegCase | null>(null);
  const [attachmentPreviews, setAttachmentPreviews] = useState<(AttachmentPreview | undefined)[]>(
    [],
  );
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  useEffect(() => {
    if (!selectedApplication) {
      setCaseAuditHistory([]);
      setAuditHistoryError("");
      return;
    }
    if (demoMode) {
      setCaseAuditHistory([]);
      setAuditHistoryError("");
      return;
    }
    let cancelled = false;
    setAuditHistoryLoading(true);
    setAuditHistoryError("");
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("case_history", {
          p_case_id: selectedApplication.id,
        });
        if (cancelled) return;
        if (error) {
          console.error("Could not load case audit history", error);
          setAuditHistoryError(error.message);
          setCaseAuditHistory([]);
        } else {
          setCaseAuditHistory(data ?? []);
        }
        setAuditHistoryLoading(false);
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        console.error("Could not load case audit history", cause);
        setAuditHistoryError(message);
        setCaseAuditHistory([]);
        setAuditHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demoMode, selectedApplication]);

  useEffect(() => {
    if (!selectedAttachments) {
      setAttachmentPreviews([]);
      setAttachmentsLoading(false);
      return;
    }

    let cancelled = false;
    const generatedUrls: string[] = [];
    const caseFolder = `${selectedAttachments.upazilaId}/${selectedAttachments.unionId}/${selectedAttachments.id}`;
    setAttachmentPreviews(Array(selectedAttachments.files.length).fill(undefined));
    setAttachmentsLoading(selectedAttachments.files.length > 0);

    void (async () => {
      let listedFilesPromise: Promise<{ name: string }[]> | undefined;
      const urls = await Promise.all(
        selectedAttachments.files.map(async (file, index) => {
          try {
            if (file.dataUrl) {
              return {
                url: normalizeAttachmentUrl(file.dataUrl, file.mimeType, file.name),
                ...(file.mimeType ? { mimeType: file.mimeType } : {}),
              };
            }
            if (file.url) {
              return {
                url: normalizeAttachmentUrl(file.url, file.mimeType, file.name),
                ...(file.mimeType ? { mimeType: file.mimeType } : {}),
              };
            }
            let path = file.path;
            if (!path) {
              const demoPreview = getDemoAttachmentPreview(selectedAttachments.id, index);
              if (demoPreview) {
                const mimeType = file.mimeType ?? mimeTypeFromFileName(file.name);
                return {
                  url: demoPreview,
                  ...(mimeType ? { mimeType } : {}),
                };
              }
              if (demoMode || administrative?.localPreview) return undefined;
              if (!selectedAttachments.synced) return undefined;
            }
            if (!path) {
              listedFilesPromise ??= supabase.storage
                .from("case-files")
                .list(caseFolder)
                .then(({ data, error }) => {
                  if (error) throw new Error(error.message);
                  return data ?? [];
                });
              const listedFiles = await listedFilesPromise;
              const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
              const matchingFile = listedFiles.find((entry) => entry.name.endsWith(`-${safeName}`));
              if (!matchingFile) return undefined;
              path = `${caseFolder}/${matchingFile.name}`;
            }

            const { data, error } = await supabase.storage.from("case-files").download(path);
            if (error) throw new Error(error.message);
            const objectUrl = URL.createObjectURL(data);
            if (cancelled) {
              URL.revokeObjectURL(objectUrl);
              return undefined;
            }
            generatedUrls.push(objectUrl);
            const mimeType = data.type || file.mimeType;
            return { url: objectUrl, ...(mimeType ? { mimeType } : {}) };
          } catch (cause) {
            const message =
              cause instanceof Error
                ? cause.message
                : L("সংযুক্তি লোড করা যায়নি", "Could not load attachment");
            toast.error(
              `${L("সংযুক্তি লোড করা যায়নি", "Could not load attachment")}: ${file.name} · ${message}`,
            );
            return undefined;
          }
        }),
      );
      if (!cancelled) {
        setAttachmentPreviews(urls);
        setAttachmentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      generatedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [L, administrative?.localPreview, demoMode, selectedAttachments]);

  const applications = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (administrative
      ? administrative.cases
      : user?.role === "worker" || user?.role === "police"
        ? scopedCases(state, user)
        : []
    )
      .filter((item) => item.type === type)
      .filter((item) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "corrected") return Boolean(item.details?.correctedAt);
        if (statusFilter === "issue") {
          return (
            item.status === "rejected" || item.remarks.some((remark) => remark.role === "admin")
          );
        }
        return item.status === statusFilter;
      })
      .filter(
        (item) =>
          !query ||
          [
            item.id,
            item.name.bn,
            item.name.en,
            item.father.bn,
            item.father.en,
            item.mother.bn,
            item.mother.en,
          ].some((value) => value.toLocaleLowerCase().includes(query)),
      )
      .sort((left, right) => right.createdAt - left.createdAt);
  }, [administrative, search, state, statusFilter, type, user]);

  const pageCount = Math.max(1, Math.ceil(applications.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = applications.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = applications.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = Math.min(currentPage * pageSize, applications.length);

  if (administrative ? user?.role !== "admin" && !administrative.localPreview : user?.role !== "worker" && user?.role !== "police") {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        {L("এই পাতায় প্রবেশের অনুমতি নেই", "You don't have access to this page")}
      </section>
    );
  }

  const title =
    type === "birth"
      ? administrative
        ? L("জন্ম নিবন্ধনের আবেদনের তালিকা", "Birth Registration Application List")
        : L("জন্ম নিবন্ধনের আবেদন তালিকা", "Birth Registration Applications")
      : administrative
        ? L("মৃত্যু নিবন্ধনের আবেদনের তালিকা", "Death Registration Application List")
        : L("মৃত্যু নিবন্ধনের আবেদন তালিকা", "Death Registration Applications");

  return (
    <section className="mx-auto w-full max-w-none px-0 pb-2 pt-0">
      <header className={`mb-4 flex items-center justify-between gap-4 py-3 ${administrative ? "flex-nowrap overflow-x-auto" : "flex-wrap"}`}>
        <div className="shrink-0">
          <h1 className="font-display text-xl font-bold leading-tight text-emerald-950 sm:text-2xl">
            {title}
          </h1>
        </div>
        <div className={`flex items-center gap-2 ${administrative ? "shrink-0 flex-nowrap" : "w-full flex-col sm:w-auto sm:flex-row sm:items-center"}`}>
          {administrative ? (
            <label className="relative block w-40 shrink-0">
              <span className="sr-only">{L("আবেদন ফিল্টার", "Application filter")}</span>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full pl-8" aria-label={L("আবেদন ফিল্টার", "Application filter")}>
                  <Filter className="absolute left-2 h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <SelectValue placeholder={L("সব আবেদন", "All applications")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L("সব আবেদন", "All applications")}</SelectItem>
                  <SelectItem value="pending">{L("অপেক্ষমাণ", "Pending")}</SelectItem>
                  <SelectItem value="progress">{L("প্রক্রিয়াধীন", "In progress")}</SelectItem>
                  <SelectItem value="completed">{L("নিবন্ধন সম্পন্ন", "Registered")}</SelectItem>
                  <SelectItem value="issue">{L("সমস্যাযুক্ত", "Has issue")}</SelectItem>
                  <SelectItem value="corrected">{L("সংশোধিত", "Corrected")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
          ) : (
            <label className="w-full sm:w-40">
              <span className="sr-only">{L("ফিল্টার / অবস্থা", "Filter / status")}</span>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="h-9 w-full text-sm"
                  aria-label={L("ফিল্টার / অবস্থা", "Filter / status")}
                >
                  <Filter className="mr-1 h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <SelectValue placeholder={L("ফিল্টার / অবস্থা", "Filter / status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L("সব আবেদন", "All applications")}</SelectItem>
                  <SelectItem value="pending">{L("অপেক্ষমাণ", "Pending")}</SelectItem>
                  <SelectItem value="progress">{L("প্রক্রিয়াধীন", "In Progress")}</SelectItem>
                  <SelectItem value="completed">
                    {L("নিবন্ধন সম্পন্ন", "Registration complete")}
                  </SelectItem>
                  <SelectItem value="issue">{L("সমস্যাযুক্ত", "Has issue")}</SelectItem>
                  <SelectItem value="corrected">{L("সংশোধিত", "Corrected")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
          <label className={administrative ? "w-64 shrink-0" : "w-full sm:w-56"}>
            <span className="sr-only">{L("নাম বা আবেদন নম্বর দিয়ে খুঁজুন", "Search by name or application number")}</span>
            <Input
              className="h-9 w-full text-sm"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={L("নাম বা আবেদন নম্বর দিয়ে খুঁজুন", "Search by name or application number")}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 whitespace-nowrap border-emerald-200 text-emerald-900 hover:bg-emerald-50"
            onClick={() =>
              administrative
                ? administrative.onHome()
                : void navigate({ to: "/", search: {} })
            }
          >
            <Home className="mr-2 h-4 w-4" aria-hidden="true" />
            {L("হোম পেজে ফিরে যান", "Back to home")}
          </Button>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-emerald-100 bg-white shadow-sm">
        <table className={`w-full ${administrative ? "min-w-[1620px]" : "min-w-[1379px]"} table-fixed border-collapse text-left text-sm`}>
          <colgroup>
            <col className="w-[64px]" />
            <col className="w-[120px]" />
            <col className="w-[165px]" />
            <col className="w-[110px]" />
            <col className="w-[160px]" />
            <col className="w-[160px]" />
            <col className="w-[135px]" />
            <col className="w-[105px]" />
            <col className="w-[115px]" />
            <col className="w-[94px]" />
            <col className="w-[151px]" />
            {administrative && <col className="w-[240px]" />}
          </colgroup>
          <thead className="bg-emerald-50 text-emerald-950">
            <tr>
              {[
                L("ক্রমিক নং", "Serial"),
                L("আবেদন নং", "Application ID"),
                type === "birth" ? L("শিশুর নাম", "Child's name") : L("নাম", "Name"),
                type === "birth" ? L("জন্ম তারিখ", "Date of birth") : L("মৃত্যুর তারিখ", "Date of death"),
                L("পিতার নাম", "Father's name"),
                L("মাতার নাম", "Mother's name"),
                L("গ্রাম / এলাকা", "Village / area"),
                L("সংযুক্তি", "Attachments"),
                L("অবস্থা", "Status"),
                L("কার্যক্রম", "Action"),
                administrative ?                 L("নিবন্ধিত করুন", "Mark registered") : user?.role === "police" ? L("পুলিশি কাজ", "Police task") : L("সংশোধন করুন", "Correction"),
                ...(administrative ? [L("প্রশাসনিক কার্যক্রম", "Administrative actions")] : []),
              ].map((heading, index) => (
                <th
                  key={heading}
                  scope="col"
                  className={`whitespace-nowrap border-b border-emerald-100 py-2.5 font-semibold ${index === 9 ? "px-1" : index === 10 ? "px-1.5 text-center" : "px-2.5"}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((item, index) => (
              <ApplicationRow
                key={item.id}
                item={item}
                serial={first + index}
                onView={() => setSelectedApplication(item)}
                onAttachments={() => setSelectedAttachments(item)}
                onEdit={() => administrative
                  ? administrative.onEdit(item)
                  : user?.role === "police"
                    ? setSelectedApplication(item)
                  : void navigate({
                      to: type === "birth" ? "/birth-entry" : "/death-entry",
                      search: { applicationId: item.id },
                    })}
                canEdit={user?.role === "worker"}
                administrativeActions={administrative?.actions(item, () => setSelectedAttachments(item))}
                {...(administrative ? { onRegister: () => administrative.onRegister(item) } : {})}
                villageName={(() => {
                  const village = findVillage(item.villageId);
                  if (village) return L(village.v.bn, village.v.en);
                  return L(
                    item.details?.birthPlace?.bn ?? item.details?.deathPlace?.bn ?? "—",
                    item.details?.birthPlace?.en ?? item.details?.deathPlace?.en ?? "—",
                  );
                })()}
                date={date}
                L={L}
                n={n}
              />
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={administrative ? 12 : 11} className="px-3 py-10 text-center text-muted-foreground">
                  {L("কোনো আবেদন পাওয়া যায়নি", "No applications found")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 text-base font-semibold text-muted-foreground">
        <span>
          {L(
            `দেখানো হচ্ছে ${n(first)} থেকে ${n(last)} / ${n(applications.length)}টি আবেদন`,
            `Showing ${n(first)} to ${n(last)} of ${n(applications.length)} applications`,
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            {L("আগের", "Previous")}
          </Button>
          {administrative ? (
            Array.from({ length: pageCount }, (_, index) => index + 1)
              .slice(0, 3)
              .map((number) => (
                <Button
                  key={number}
                  size="sm"
                  variant={number === currentPage ? "default" : "outline"}
                  onClick={() => setPage(number)}
                >
                  {n(number)}
                </Button>
              ))
          ) : (
            <span className="tabular-nums font-semibold">
              {n(currentPage)} / {n(pageCount)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            {L("পরের", "Next")}
          </Button>
        </div>
      </footer>
      <Dialog
        open={selectedApplication !== null}
        onOpenChange={(open) => !open && setSelectedApplication(null)}
      >
        <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto border-emerald-200">
          {selectedApplication && (
            <>
              <DialogHeader className="pr-7 text-left">
                <DialogTitle className="font-display text-xl text-emerald-950">
                  {L(selectedApplication.name.bn, selectedApplication.name.en)}
                </DialogTitle>
                <DialogDescription>
                  {L("আবেদনের সম্পূর্ণ তথ্য ও ঠিকানা", "Complete application details and address")}
                </DialogDescription>
              </DialogHeader>
              <ApplicationDetails
                item={selectedApplication}
                auditHistory={caseAuditHistory}
                auditHistoryLoading={auditHistoryLoading}
                auditHistoryError={auditHistoryError}
                actorUsers={state.users}
                address={address}
                date={date}
                L={L}
                n={n}
                lang={lang}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={selectedAttachments !== null}
        onOpenChange={(open) => !open && setSelectedAttachments(null)}
      >
        <DialogContent className="attachment-dialog-content max-h-[90svh] max-w-4xl overflow-y-auto border-emerald-200">
          {selectedAttachments && (
            <>
              <div className="mb-2 pr-8">
                <DialogHeader className="text-left">
                  <DialogTitle className="font-display text-xl text-emerald-950">
                    {L("সংযুক্তি", "Attachments")} ·{" "}
                    {L(selectedAttachments.name.bn, selectedAttachments.name.en)}
                  </DialogTitle>
                  <DialogDescription>
                    {L(
                      `${n(selectedAttachments.files.length)}টি সংযুক্তি`,
                      `${n(selectedAttachments.files.length)} attachments`,
                    )}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {selectedAttachments.filesPurged && (
                  <p className="col-span-full text-sm text-muted-foreground">
                    {L(
                      "সংরক্ষণ নীতি অনুযায়ী সংযুক্তিগুলো মুছে ফেলা হয়েছে",
                      "Attachments were removed according to the retention policy",
                    )}
                  </p>
                )}
                {attachmentsLoading && (
                  <p className="col-span-full text-sm text-muted-foreground">
                    {L("সংযুক্তি লোড হচ্ছে…", "Loading attachments…")}
                  </p>
                )}
                {!attachmentsLoading && selectedAttachments.files.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">
                    {L("কোনো সংযুক্তি নেই", "No attachments")}
                  </p>
                )}
                {!attachmentsLoading &&
                  !selectedAttachments.filesPurged &&
                  selectedAttachments.files.map((file, index) => {
                    const preview = attachmentPreviews[index];
                    const url = preview?.url;
                    const isImage = isImageAttachment(file.name, preview?.mimeType, url);
                    const isPdf =
                      preview?.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);

                    return (
                      <article
                        key={`${file.path ?? file.name}-${index}`}
                        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm"
                      >
                        <div className="relative flex h-52 items-center justify-center overflow-hidden bg-slate-50 p-3">
                          {url && isImage && (
                            <img
                              src={url}
                              alt={file.name}
                              className="max-h-full max-w-full object-contain"
                              onError={() => {
                                setAttachmentPreviews((current) =>
                                  current.map((currentPreview, currentIndex) =>
                                    currentIndex === index ? undefined : currentPreview,
                                  ),
                                );
                                toast.error(
                                  `${L("ছবির প্রিভিউ লোড করা যায়নি", "Could not load image preview")}: ${file.name}`,
                                );
                              }}
                            />
                          )}
                          {url && !isImage && !isPdf && (
                            <AttachmentPlaceholder fileName={file.name} L={L} />
                          )}
                          {url && isPdf && (
                            <iframe
                              src={url}
                              title={file.name}
                              className="h-full w-full bg-white"
                            />
                          )}
                          {!url && <AttachmentPlaceholder fileName={file.name} L={L} />}
                        </div>
                        <div className="flex flex-1 flex-col gap-3 p-3">
                          <h3 className="break-all text-sm font-medium text-slate-900">
                            {file.name}
                          </h3>
                          {file.fieldVisit && (
                            <div className="space-y-1 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-950">
                              <p className="font-semibold">
                                {L("বাড়ি পরিদর্শনের ছবি", "House visit photo")}
                              </p>
                              <p>
                                {L("ছবির সময়", "Photo time")}:{" "}
                                {new Date(file.fieldVisit.capturedAt).toLocaleString()}
                              </p>
                              {file.fieldVisit.latitude !== undefined &&
                                file.fieldVisit.longitude !== undefined && (
                                  <p>
                                    GPS: {file.fieldVisit.latitude.toFixed(6)},{" "}
                                    {file.fieldVisit.longitude.toFixed(6)}
                                  </p>
                                )}
                            </div>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-auto w-full border-emerald-200 text-emerald-900 hover:bg-emerald-50"
                            onClick={() => printAttachment(file.name, preview, L)}
                          >
                            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
                            {L("প্রিন্ট", "Print")}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AttachmentPlaceholder({
  fileName,
  L,
}: {
  fileName: string;
  L: (bn: string, en: string) => string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50 to-slate-100 p-4 text-center">
      <span className="flex h-20 w-16 items-center justify-center rounded-lg border border-emerald-100 bg-white text-emerald-700 shadow-sm">
        <FileText className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="max-w-full truncate rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
        {L("সংযুক্ত ফাইল", "Attached file")}
      </span>
      <span className="max-w-full break-all text-xs text-slate-600">{fileName}</span>
    </div>
  );
}

function isImageAttachment(fileName: string, mimeType?: string, url?: string) {
  return (
    mimeType?.startsWith("image/") === true ||
    /^data:image\//i.test(url ?? "") ||
    /\.(avif|bmp|gif|jpe?g|png|svg|tiff?|webp)$/i.test(fileName)
  );
}

function mimeTypeFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "pdf") return "application/pdf";
  if (extension === "avif") return "image/avif";
  if (extension === "bmp") return "image/bmp";
  return /\.(avif|bmp|jpe?g|tiff?)$/i.test(fileName) ? "image/jpeg" : undefined;
}

function printAttachment(
  fileName: string,
  preview: AttachmentPreview | undefined,
  L: (bn: string, en: string) => string,
) {
  const url = preview?.url;
  const isImage = isImageAttachment(fileName, preview?.mimeType, url);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    toast.error(L("প্রিন্ট উইন্ডো খোলা যায়নি", "Could not open print window"));
    return;
  }

  printWindow.opener = null;
  const printDocument = printWindow.document;
  printDocument.open();
  printDocument.write(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title></head><body></body></html>',
  );
  printDocument.close();
  printDocument.title = fileName;

  const style = printDocument.createElement("style");
  style.textContent = `
    @page { size: A4 portrait; margin: 12mm; }
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
    body { color: #111; font: 14px Arial, sans-serif; }
    h1 { margin: 0 0 6mm; overflow-wrap: anywhere; font-size: 14px; font-weight: 500; }
    img { display: block; width: 100%; max-height: 255mm; object-fit: contain; }
    iframe { display: block; width: 100%; height: 255mm; border: 0; }
    .document-card { min-height: 180mm; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px dashed #94a3b8; border-radius: 4mm; text-align: center; color: #334155; }
    .file-icon { width: 36mm; height: 48mm; margin-bottom: 10mm; border: 2px solid #047857; border-radius: 4mm; background: linear-gradient(135deg, #ecfdf5, #f8fafc); }
    .document-card p { margin: 2mm; }
    @media print { img, iframe, .document-card { break-inside: avoid; } }
  `;
  printDocument.head.append(style);

  const heading = printDocument.createElement("h1");
  heading.textContent = fileName;
  const triggerPrint = () => {
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };
  const handleLoadError = () => {
    printWindow.close();
    toast.error(L("ফাইল লোড করা যায়নি", "Could not load file"));
  };
  if (url && isImage) {
    const image = printDocument.createElement("img");
    image.alt = fileName;
    image.onload = triggerPrint;
    image.onerror = handleLoadError;
    printDocument.body.replaceChildren(heading, image);
    image.src = url;
  } else if (url) {
    const documentFrame = printDocument.createElement("iframe");
    documentFrame.title = fileName;
    documentFrame.onload = triggerPrint;
    documentFrame.onerror = handleLoadError;
    printDocument.body.replaceChildren(heading, documentFrame);
    documentFrame.src = url;
  } else {
    const card = printDocument.createElement("main");
    card.className = "document-card";
    const icon = printDocument.createElement("div");
    icon.className = "file-icon";
    icon.setAttribute("aria-hidden", "true");
    const badge = printDocument.createElement("p");
    badge.textContent = L("সংযুক্ত ফাইল", "Attached file");
    const description = printDocument.createElement("p");
    description.textContent = L(
      "এই আবেদনের সঙ্গে সংযুক্ত নথি",
      "Document attached to this application",
    );
    card.append(icon, badge, description);
    printDocument.body.replaceChildren(heading, card);
    triggerPrint();
  }
}

function ApplicationRow({
  item,
  serial,
  onView,
  onAttachments,
  onEdit,
  villageName,
  date,
  L,
  n,
  administrativeActions,
  onRegister,
  canEdit,
}: {
  item: RegCase;
  serial: number;
  onView: () => void;
  onAttachments: () => void;
  onEdit: () => void;
  villageName: string;
  date: (timestamp: number) => string;
  L: (bn: string, en: string) => string;
  n: (value: number | string) => string;
  administrativeActions?: ReactNode;
  onRegister?: () => void;
  canEdit: boolean;
}) {
  return (
    <>
      <tr className="border-b border-slate-100 odd:bg-slate-50 even:bg-white">
        <td className="px-2.5 py-1.5 text-base tabular-nums">{n(serial)}</td>
        <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-base">
          {item.id.slice(0, 8).toUpperCase()}
        </td>
        <td
          className="truncate px-2.5 py-1.5 text-base font-semibold"
          title={L(item.name.bn, item.name.en)}
        >
          {L(item.name.bn, item.name.en)}
        </td>
        <td className="whitespace-nowrap px-2.5 py-1.5 text-base">
          {date(Date.parse(item.type === "death" ? item.dod ?? item.dob : item.dob))}
        </td>
        <td className="truncate px-2.5 py-1.5 text-base" title={L(item.father.bn, item.father.en)}>
          {L(item.father.bn, item.father.en)}
        </td>
        <td className="truncate px-2.5 py-1.5 text-base" title={L(item.mother.bn, item.mother.en)}>
          {L(item.mother.bn, item.mother.en)}
        </td>
        <td className="max-w-36 truncate px-2.5 py-1.5 text-base" title={villageName}>
          {villageName}
        </td>
        <td className="whitespace-nowrap px-2.5 py-1.5 text-base">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            onClick={onAttachments}
            aria-label={L(
              `${n(item.files.length)}টি সংযুক্তি দেখুন`,
              `View ${n(item.files.length)} attachments`,
            )}
            title={L("সংযুক্তি দেখুন", "View attachments")}
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            {n(item.files.length)}
          </button>
        </td>
        <td className="whitespace-nowrap px-2.5 py-1.5 text-base">
          <StatusBadge s={item.status} />
        </td>
        <td className="px-1 py-1.5 text-base">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="whitespace-nowrap border-emerald-200 text-emerald-900 hover:bg-emerald-50"
            onClick={onView}
          >
            <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
            {L("দেখুন", "View")}
          </Button>
        </td>
        <td className="px-1 py-1.5 text-center text-base">
          {onRegister ? (
            <Button
              type="button"
              size="sm"
              variant={item.status === "completed" ? "outline" : "default"}
              className="whitespace-nowrap"
              onClick={onRegister}
              disabled={item.status === "completed" || item.status === "rejected"}
              title={
                item.status === "completed"
                  ? L("এই আবেদনটি নিবন্ধিত হয়েছে", "This application is registered")
                  : item.status === "rejected"
                    ? L("বাতিল আবেদন নিবন্ধন করা যাবে না", "Rejected applications cannot be registered")
                    : L("নিবন্ধিত করতে ক্লিক করুন", "Click to mark registered")
              }
            >
              <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
              {item.status === "completed" ? L("নিবন্ধিত", "Registered") : L("নিবন্ধিত করুন", "Register")}
            </Button>
          ) : (
            <div className="flex justify-end">
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant={item.details?.correctedAt ? "default" : "outline"}
                  className={
                    item.details?.correctedAt
                      ? "whitespace-nowrap bg-green-600 text-white hover:bg-green-700"
                      : "whitespace-nowrap border-amber-200 text-amber-900 hover:bg-amber-50"
                  }
                  onClick={onEdit}
                  disabled={item.status === "completed" || item.status === "rejected"}
                  title={
                    item.status === "completed" || item.status === "rejected"
                      ? L("এই আবেদনটি সংশোধন করা যাবে না", "This application cannot be corrected")
                      : item.details?.correctedAt
                        ? L("সংশোধিত", "Corrected")
                        : L("সংশোধন করুন", "Edit application")
                  }
                >
                  <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                  {L("সংশোধন করুন", "Edit")}
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">{L("নথি সংগ্রহ", "Collection task")}</span>
              )}
            </div>
          )}
        </td>
        {administrativeActions !== undefined && (
          <td className="whitespace-nowrap px-2 py-1.5 text-base">{administrativeActions}</td>
        )}
      </tr>
    </>
  );
}

function ApplicationDetails({
  item,
  auditHistory,
  auditHistoryLoading,
  auditHistoryError,
  actorUsers,
  address,
  date,
  L,
  n,
  lang,
}: {
  item: RegCase;
  auditHistory: CaseAuditEntry[];
  auditHistoryLoading: boolean;
  auditHistoryError: string;
  actorUsers: ReturnType<typeof useApp>["state"]["users"];
  address: (item: RegCase) => string;
  date: (timestamp: number) => string;
  L: (bn: string, en: string) => string;
  n: (value: number | string) => string;
  lang: "bn" | "en";
}) {
  return (
    <div className="space-y-5">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label={L("আবেদন নম্বর", "Application ID")} value={item.id} />
        <Detail label={L("অবস্থা", "Status")} value={<StatusBadge s={item.status} />} />
        <Detail label={L("জন্ম তারিখ", "Date of birth")} value={date(Date.parse(item.dob))} />
        <Detail
          label={L("লিঙ্গ", "Gender")}
          value={
            { male: L("পুরুষ", "Male"), female: L("নারী", "Female"), other: L("অন্যান্য", "Other") }[
              item.gender
            ]
          }
        />
        <Detail label={L("পিতার নাম", "Father's name")} value={L(item.father.bn, item.father.en)} />
        <Detail label={L("মাতার নাম", "Mother's name")} value={L(item.mother.bn, item.mother.en)} />
        <Detail label={L("NID / BRN", "NID / BRN")} value={item.nid || "—"} />
        <Detail label={L("মোবাইল", "Mobile")} value={item.parentMobile ?? "—"} />
        <Detail label={L("ওয়ার্ড", "Ward")} value={n(item.ward)} />
        <Detail label={L("জমার তারিখ", "Submitted")} value={date(item.createdAt)} />
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold text-muted-foreground">
            {L("সম্পূর্ণ ঠিকানা", "Full address")}
          </dt>
          <dd className="mt-1 text-sm font-medium">{address(item) || "—"}</dd>
        </div>
      </dl>
      <CaseHistoryTimeline
        item={item}
        auditHistory={auditHistory}
        auditHistoryLoading={auditHistoryLoading}
        auditHistoryError={auditHistoryError}
        actorUsers={actorUsers}
        L={L}
        lang={lang}
      />
    </div>
  );
}

function CaseHistoryTimeline({
  item,
  auditHistory,
  auditHistoryLoading,
  auditHistoryError,
  actorUsers,
  L,
  lang,
}: {
  item: RegCase;
  auditHistory: CaseAuditEntry[];
  auditHistoryLoading: boolean;
  auditHistoryError: string;
  actorUsers: ReturnType<typeof useApp>["state"]["users"];
  L: (bn: string, en: string) => string;
  lang: "bn" | "en";
}) {
  const actorName = (userId: string | null) => {
    const actor = actorUsers.find((candidate) => candidate.id === userId);
    return actor ? L(actor.name.bn, actor.name.en) : L("অফিসার", "Officer");
  };
  const events = auditHistory.map((event) => {
    const auditRole = event.role ?? undefined;
    let title = L("রেকর্ড হালনাগাদ", "Record updated");
    let description = "";
    if (event.action.startsWith("create:")) {
      title = L("মাঠপর্যায়ের তথ্য সংগ্রহ", "Field data collected");
    } else if (event.action === "remark") {
      title = L("অফিস প্রি-চেক / মন্তব্য", "Office pre-check / comment");
      description = L(
        `${auditRole ? roleLabel(auditRole, L) : L("অফিসার", "Officer")} মন্তব্য যুক্ত করেছেন`,
        `${auditRole ? roleLabel(auditRole, L) : L("Officer", "Officer")} added a remark`,
      );
    } else if (event.action === "update") {
      if (event.status_to) {
        const nextStatus = event.status_to;
        const statusLabel = (status: string) =>
          ({
            pending: L("অপেক্ষমাণ", "Pending"),
            progress: L("প্রক্রিয়াধীন", "In progress"),
            completed: L("সম্পন্ন", "Completed"),
            rejected: L("বাতিল", "Rejected"),
          })[status] ?? status;
        title =
          nextStatus === "completed"
            ? L("সফলভাবে নিবন্ধিত", "Successfully registered")
            : nextStatus === "progress"
              ? L("অফিস যাচাই চলছে", "Office verification in progress")
              : nextStatus === "rejected"
                ? L("আবেদন বাতিল", "Application rejected")
                : L("বিডিআরআইএস এন্ট্রি অপেক্ষমাণ", "BDRIS entry pending");
        if (event.status_from && event.status_from !== nextStatus) {
          description = `${statusLabel(event.status_from)} → ${statusLabel(nextStatus)}`;
        }
      }
    }
    const role = auditRole ?? actorUsers.find((candidate) => candidate.id === event.user_id)?.role;
    return {
      id: String(event.id),
      at: Date.parse(event.at),
      title,
      description,
      actor: `${actorName(event.user_id)}${role ? ` · ${roleLabel(role, L)}` : ""}`,
      clientHint: event.client_hint ?? "",
    };
  });
  if (events.length === 0) {
    events.push({
      id: `created-${item.id}`,
      at: item.createdAt,
      title: L("মাঠপর্যায়ের তথ্য সংগ্রহ", "Field data collected"),
      description: "",
      actor: L("রেকর্ড স্রষ্টা", "Record creator"),
      clientHint: "",
    });
    for (const [index, remark] of item.remarks.entries()) {
      events.push({
        id: `remark-${item.id}-${index}`,
        at: remark.at,
        title: L("অফিস প্রি-চেক / মন্তব্য", "Office pre-check / comment"),
        description: remark.text,
        actor: roleLabel(remark.role, L),
        clientHint: "",
      });
    }
    if (item.status === "completed" && item.completedAt) {
      events.push({
        id: `completed-${item.id}`,
        at: item.completedAt,
        title: L("সফলভাবে নিবন্ধিত", "Successfully registered"),
        description: item.regNo ? `${L("নিবন্ধন নং", "Registration no.")}: ${item.regNo}` : "",
        actor: L("নিবন্ধনকারী কর্মকর্তা", "Registering officer"),
        clientHint: "",
      });
    }
  }
  events.sort((left, right) => left.at - right.at);

  return (
    <section className="border-t border-emerald-100 pt-4" aria-labelledby="case-history-heading">
      <h3 id="case-history-heading" className="flex items-center gap-2 font-semibold text-emerald-950">
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        {L("আবেদনের কার্যক্রমের ইতিহাস", "Application activity timeline")}
      </h3>
      {auditHistoryLoading && (
        <p className="mt-2 text-xs text-slate-600" role="status">
          {L("ইতিহাস লোড হচ্ছে…", "Loading history…")}
        </p>
      )}
      {auditHistoryError && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-950" role="status">
          {L(
            "সার্ভার অডিট লগ পাওয়া যায়নি; প্রদর্শিত ইতিহাসে রেকর্ডে থাকা তথ্যই দেখানো হচ্ছে।",
            "Server audit log is unavailable; only history available on this record is shown.",
          )}
        </p>
      )}
      <ol className="mt-3 space-y-3">
        {events.map((event, index) => (
          <li key={event.id} className="relative flex gap-3 pl-1">
            {index < events.length - 1 && (
              <span className="absolute bottom-[-0.9rem] left-[0.45rem] top-4 w-px bg-emerald-200" aria-hidden="true" />
            )}
            <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600 ring-2 ring-white" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{event.title}</p>
              {event.description && <p className="break-words text-xs text-slate-700">{event.description}</p>}
              <p className="mt-0.5 text-[11px] text-slate-500">
                {new Date(event.at).toLocaleString(lang === "bn" ? "bn-BD" : "en-US")}
                {" · "}{event.actor}
                {event.clientHint && ` · ${event.clientHint}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[10px] text-slate-500">
        {L(
          "আইপি ঠিকানা ও ডিভাইস শনাক্তকারী সংরক্ষণ করা হয় না।",
          "IP addresses and device identifiers are not stored.",
        )}
      </p>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
