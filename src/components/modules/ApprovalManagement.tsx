import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModuleNavigation } from "./ModuleNavigation";
import { PageTitle } from "@/components/shared";
import { useServerFn } from "@tanstack/react-start";
import { listPendingStaff, reviewStaffRegistration } from "@/lib/auth.functions";
import { useApp } from "@/lib/store";

type Applicant = {
  id: string;
  nameBn: string;
  nameEn: string;
  email: string | null;
  mobile: string | null;
  role: "worker" | "police" | "admin";
  createdAt: string;
};

function roleName(role: Applicant["role"], L: (bn: string, en: string) => string) {
  if (role === "worker") return L("স্বাস্থ্যকর্মী", "Health Worker");
  if (role === "police") return L("গ্রাম পুলিশ", "Gram Police");
  return L("ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer");
}

export function ApprovalManagement() {
  const { L } = useApp();
  const loadApplicants = useServerFn(listPendingStaff);
  const review = useServerFn(reviewStaffRegistration);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadApplicants();
      if (!result.ok) {
        setError(true);
        setApplicants([]);
        toast.error(
          result.error === "mfa_required"
            ? L("অনুমোদন পর্যালোচনার জন্য MFA যাচাই করুন", "Verify MFA to review registrations")
            : result.error === "forbidden"
              ? L("এই পাতায় প্রবেশের অনুমতি নেই", "You don't have access to this page")
              : L("নিবন্ধনের তালিকা লোড করা যায়নি", "Could not load pending registrations"),
        );
      } else {
        setApplicants(result.applicants);
      }
    } catch (cause) {
      console.error("Could not load pending registrations", cause);
      setApplicants([]);
      setError(true);
      toast.error(L("নিবন্ধনের তালিকা লোড করা যায়নি", "Could not load pending registrations"));
    } finally {
      setLoading(false);
    }
  }, [L, loadApplicants]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = async (applicant: Applicant, decision: "approve" | "reject") => {
    setBusyId(applicant.id);
    try {
      const result = await review({ data: { userId: applicant.id, decision } });
      if (!result.ok) {
        toast.error(
          result.error === "not_pending_or_forbidden"
            ? L("এই আবেদনটি আর অপেক্ষমাণ নেই বা আপনার ইউনিয়নের নয়", "This registration is no longer pending or is outside your union")
            : result.error === "mfa_required"
              ? L("অনুমোদন পরিবর্তনের জন্য MFA যাচাই করুন", "Verify MFA to change approval status")
              : L("নিবন্ধনের অবস্থা হালনাগাদ করা যায়নি", "Could not update registration status"),
        );
      } else {
        setApplicants((current) => current.filter((item) => item.id !== applicant.id));
        toast.success(
          decision === "approve"
            ? L("ব্যবহারকারী অনুমোদিত হয়েছে", "User approved")
            : L("নিবন্ধন প্রত্যাখ্যান করা হয়েছে", "Registration rejected"),
        );
        if (result.warning === "audit_failed") {
          toast.error(L("অবস্থা পরিবর্তিত হয়েছে, তবে নিরীক্ষা লগ সংরক্ষণ হয়নি", "Status changed, but the audit log could not be saved"));
        }
      }
    } catch (cause) {
      console.error("Could not update staff approval status", cause);
      toast.error(L("নিবন্ধনের অবস্থা হালনাগাদ করা যায়নি", "Could not update registration status"));
      void refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8">
      <ModuleNavigation />
      <PageTitle
        title={L("অনুমোদন ব্যবস্থাপনা", "Approval Management")}
        sub={L("আপনার ইউনিয়নের নতুন কর্মী নিবন্ধন পর্যালোচনা করুন", "Review new staff registrations from your union")}
        actions={
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {L("হালনাগাদ", "Refresh")}
          </Button>
        }
      />
      {loading ? (
        <p className="py-12 text-center text-muted-foreground" role="status">
          {L("নিবন্ধনের তালিকা লোড হচ্ছে…", "Loading registrations…")}
        </p>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            {L("নিবন্ধনের তালিকা পাওয়া যায়নি। আবার চেষ্টা করুন।", "The registration list is unavailable. Please try again.")}
          </p>
          <Button variant="outline" onClick={() => void refresh()}>{L("আবার চেষ্টা করুন", "Try again")}</Button>
        </div>
      ) : applicants.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          {L("আপনার ইউনিয়নে অপেক্ষমাণ নিবন্ধন নেই", "There are no pending registrations for your union")}
        </div>
      ) : (
        <div className="space-y-3">
          {applicants.map((applicant) => (
            <article key={applicant.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-semibold">{applicant.nameEn || applicant.nameBn}</h2>
                {applicant.nameBn && applicant.nameBn !== applicant.nameEn && (
                  <p className="text-sm text-muted-foreground">{applicant.nameBn}</p>
                )}
                <p className="text-sm text-muted-foreground">{roleName(applicant.role, L)}</p>
                <p className="break-all text-sm">{applicant.email ?? applicant.mobile}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {L("আবেদনের তারিখ", "Submitted")} · {new Date(applicant.createdAt).toLocaleDateString(L("bn-BD", "en-US"))}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button disabled={busyId !== null} onClick={() => void decide(applicant, "approve")}>
                  <Check className="mr-1 h-4 w-4" />{L("অনুমোদন", "Approve")}
                </Button>
                <Button variant="destructive" disabled={busyId !== null} onClick={() => void decide(applicant, "reject")}>
                  <X className="mr-1 h-4 w-4" />{L("প্রত্যাখ্যান", "Reject")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
