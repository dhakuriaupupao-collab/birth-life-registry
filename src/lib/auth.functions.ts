import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  admin, clientIp, lockoutMinutes, logAttempt, normalizePhone, origin, publicClient, recentCount, sha256, LIMITS,
} from "./auth.server";
import { MONIRAMPUR_STATIONS } from "./monirampur-stations";

type Tokens = { access_token: string; refresh_token: string };
type Result = { ok: true; tokens: Tokens } | { ok: false; error: string; lockedMinutes?: number };

const PRIV = ["admin", "uno", "super"] as const;

async function rolesOf(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role);
}

/* ---------- Password sign-in (officers) ---------- */
export const passwordSignIn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const ip = clientIp(); const id = `email:${data.email}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) { await logAttempt(id, "password", ip, false, "locked"); return { ok: false, error: "locked", lockedMinutes: lock }; }
    const { data: s, error } = await publicClient().auth.signInWithPassword({ email: data.email, password: data.password });
    if (error || !s.session) { await logAttempt(id, "password", ip, false, error?.code ?? "invalid"); return { ok: false, error: "invalid" }; }
    const db = await admin();
    const { data: profile, error: profileError } = await db.from("profiles").select("active, status").eq("id", s.user.id).maybeSingle();
    if (profileError) {
      console.error("Could not check sign-in approval status", profileError.message);
      return { ok: false, error: "unavailable" };
    }
    if (profile?.status === "pending") {
      await logAttempt(id, "password", ip, false, "pending_approval");
      return { ok: false, error: "pending" };
    }
    if (profile?.status === "rejected") {
      await logAttempt(id, "password", ip, false, "rejected");
      return { ok: false, error: "rejected" };
    }
    if (!profile?.active || profile.status !== "active") {
      await logAttempt(id, "password", ip, false, "inactive");
      return { ok: false, error: "invalid" };
    }
    const roles = await rolesOf(s.user.id);
    if (!roles.some((r) => (PRIV as readonly string[]).includes(r))) {
      await logAttempt(id, "password", ip, false, "role"); return { ok: false, error: "invalid" };
    }
    await logAttempt(id, "password", ip, true);
    return { ok: true, tokens: { access_token: s.session.access_token, refresh_token: s.session.refresh_token } };
  });

/* ---------- Server-only fallback when the Supabase instance disables public signup ---------- */
export const registerStaffWithAdminFallback = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    name: z.string().trim().min(1).max(100),
    contact: z.string().trim().max(255),
    role: z.enum(["worker", "police", "admin"]),
    unionId: z.string().min(1).max(64),
    password: z.string().min(8).max(128).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const fieldRole = data.role === "worker" || data.role === "police";
    const phone = fieldRole ? normalizePhone(data.contact) : null;
    let email: string | null = null;
    if (fieldRole && !phone) return { ok: false as const, error: "bad_phone" };
    if (!fieldRole) {
      const parsedEmail = z.string().trim().toLowerCase().email().max(255).safeParse(data.contact);
      if (!parsedEmail.success || !data.password) return { ok: false as const, error: "bad_email" };
      email = parsedEmail.data;
    }
    if (!MONIRAMPUR_STATIONS.some((station) => station.id === data.unionId && station.type === "union")) {
      return { ok: false as const, error: "bad_union" };
    }

    const identifier = phone ? `phone:${phone}` : `email:${email ?? ""}`;
    const ip = clientIp();
    try {
      const lock = await lockoutMinutes(identifier, ip);
      if (lock) return { ok: false as const, error: "locked", lockedMinutes: lock };
      if ((await recentCount(identifier, "signup", 60)) >= 3) {
        return { ok: false as const, error: "too_many", lockedMinutes: 60 };
      }

      const dummyEmail = phone ? `${phone.replace(/\D/g, "")}@manirampur.gov.bd` : null;
      const userMetadata = {
        full_name: data.name,
        role: data.role,
        union_id: data.unionId,
        upazila_id: "manirampur",
        signup_name: data.name,
        signup_role: data.role,
        signup_union_id: data.unionId,
        ...(phone ? { phone_number: phone, email: dummyEmail, dummy_email: dummyEmail } : {}),
      };
      const db = await admin();
      const { data: created, error } = await db.auth.admin.createUser({
        ...(phone ? { phone } : { email: email! }),
        password: data.password ?? `${crypto.randomUUID()}${crypto.randomUUID()}`,
        ...(phone ? {} : { email_confirm: false }),
        user_metadata: userMetadata,
      });
      if (error || !created.user) {
        const code = error?.code ?? "create_failed";
        await logAttempt(identifier, "signup", ip, false, code);
        console.error("Admin signup fallback failed", { code, message: error?.message });
        if (code === "user_already_exists" || code === "email_exists" || code === "phone_exists") {
          return { ok: false as const, error: "already_registered", message: error?.message };
        }
        return { ok: false as const, error: "registration_failed", message: error?.message ?? "Supabase returned no user" };
      }

      const { error: profileError } = await db.from("profiles").upsert({
        id: created.user.id,
        name_bn: data.name,
        name_en: data.name,
        mobile: phone,
        email: email ?? dummyEmail,
        upazila_id: "manirampur",
        union_id: data.unionId,
        ward: fieldRole ? 1 : null,
        active: false,
        status: "pending",
      });
      if (profileError) {
        const { error: deleteError } = await db.auth.admin.deleteUser(created.user.id);
        if (deleteError) console.error("Could not clean up signup after profile creation failed", deleteError.message);
        await logAttempt(identifier, "signup", ip, false, "profile_failed");
        console.error("Admin signup fallback profile creation failed", profileError.message);
        return { ok: false as const, error: "registration_failed", message: profileError.message };
      }

      const { error: roleError } = await db.from("user_roles")
        .upsert({ user_id: created.user.id, role: data.role }, { onConflict: "user_id,role" });
      if (roleError) {
        const { error: deleteError } = await db.auth.admin.deleteUser(created.user.id);
        if (deleteError) console.error("Could not clean up signup after role creation failed", deleteError.message);
        await logAttempt(identifier, "signup", ip, false, "role_failed");
        console.error("Admin signup fallback role creation failed", roleError.message);
        return { ok: false as const, error: "registration_failed", message: roleError.message };
      }

      if (email) {
        const { error: resendError } = await publicClient().auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: origin() },
        });
        if (resendError) {
          const { error: deleteError } = await db.auth.admin.deleteUser(created.user.id);
          if (deleteError) console.error("Could not clean up unverified signup fallback user", deleteError.message);
          await logAttempt(identifier, "signup", ip, false, "confirmation_email_failed");
          console.error("Signup confirmation email failed", resendError.message);
          return {
            ok: false as const,
            error: "confirmation_failed",
            message: resendError.message,
          };
        }
      }

      await logAttempt(identifier, "signup", ip, true);
      return { ok: true as const };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error("Admin signup fallback could not run", message);
      return {
        ok: false as const,
        error: message.includes("SUPABASE_SERVICE_ROLE_KEY") ? "server_configuration" : "registration_failed",
        message,
      };
    }
  });

/* ---------- Union-scoped account approval (UP Administrative Officer only) ---------- */
export const listPendingStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify approval-management role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!(roles ?? []).some((item) => item.role === "admin") || (roles ?? []).some((item) => item.role !== "admin")) {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();
    const { data: officer, error: officerError } = await db.from("profiles")
      .select("active, status, upazila_id, union_id").eq("id", context.userId).maybeSingle();
    if (officerError) {
      console.error("Could not load approval officer scope", officerError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!officer?.active || officer.status !== "active" || !officer.upazila_id || !officer.union_id) {
      return { ok: false as const, error: "forbidden" };
    }

    const { data: profiles, error: pendingError } = await db.from("profiles")
      .select("id, name_bn, name_en, email, mobile, created_at")
      .eq("status", "pending")
      .eq("upazila_id", officer.upazila_id)
      .eq("union_id", officer.union_id)
      .order("created_at", { ascending: true });
    if (pendingError) {
      console.error("Could not load pending staff registrations", pendingError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!profiles?.length) return { ok: true as const, applicants: [] };

    const { data: applicantRoles, error: applicantRolesError } = await db.from("user_roles")
      .select("user_id, role").in("user_id", profiles.map((profile) => profile.id));
    if (applicantRolesError) {
      console.error("Could not load pending applicant roles", applicantRolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const applicants = profiles.flatMap((profile) => {
      const role = applicantRoles?.find((item) => item.user_id === profile.id)?.role;
      if (role !== "worker" && role !== "police" && role !== "admin") return [];
      return [{
        id: profile.id,
        nameBn: profile.name_bn,
        nameEn: profile.name_en,
        email: profile.email,
        mobile: profile.mobile,
        role,
        createdAt: profile.created_at,
      }];
    });
    return { ok: true as const, applicants };
  });

export const reviewStaffRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    userId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify approval-management role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!(roles ?? []).some((item) => item.role === "admin") || (roles ?? []).some((item) => item.role !== "admin")) {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();
    const { data: officer, error: officerError } = await db.from("profiles")
      .select("active, status, upazila_id, union_id").eq("id", context.userId).maybeSingle();
    if (officerError) {
      console.error("Could not load approval officer scope", officerError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!officer?.active || officer.status !== "active" || !officer.upazila_id || !officer.union_id) {
      return { ok: false as const, error: "forbidden" };
    }

    const status = data.decision === "approve" ? "active" : "rejected";
    const { data: updated, error: updateError } = await db.from("profiles")
      .update({ status, active: data.decision === "approve" })
      .eq("id", data.userId)
      .eq("status", "pending")
      .eq("upazila_id", officer.upazila_id)
      .eq("union_id", officer.union_id)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error("Could not update staff approval status", updateError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!updated) return { ok: false as const, error: "not_pending_or_forbidden" };

    const { error: auditError } = await db.from("audit_logs").insert({
      user_id: context.userId,
      action: `staff:${data.decision}`,
      details: { target_user: data.userId },
    });
    if (auditError) {
      console.error("Staff approval changed but audit logging failed", auditError.message);
      return { ok: true as const, warning: "audit_failed" };
    }
    return { ok: true as const };
  });

/* ---------- Phone OTP (field staff) ---------- */
export const sendPhoneOtp = createServerFn({ method: "POST" })
  .validator((d) => z.object({ mobile: z.string().max(20) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; lockedMinutes?: number }> => {
    const phone = normalizePhone(data.mobile);
    if (!phone) return { ok: false, error: "bad_phone" };
    const ip = clientIp(); const id = `phone:${phone}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) return { ok: false, error: "locked", lockedMinutes: lock };
    if ((await recentCount(id, "otp_send", 15)) >= LIMITS.otpSends) return { ok: false, error: "too_many", lockedMinutes: 15 };
    await logAttempt(id, "otp_send", ip, true);
    // Only existing field-staff accounts receive codes; response is identical either way (no account enumeration).
    const db = await admin();
    const { data: prof, error: profileError } = await db.from("profiles")
      .select("id, active, status").eq("mobile", phone).maybeSingle();
    if (profileError) {
      console.error("Could not check phone sign-in approval status", profileError.message);
      return { ok: false, error: "unavailable" };
    }
    if (prof && !prof.active) {
      if (prof.status === "pending") return { ok: false, error: "pending" };
      if (prof.status === "rejected") return { ok: false, error: "rejected" };
    }
    if (prof?.active) {
      const roles = await rolesOf(prof.id);
      if (roles.includes("worker") || roles.includes("police")) {
        const { error } = await publicClient().auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
        if (error) { console.error("OTP send failed", error.message); return { ok: false, error: "sms_failed" }; }
      }
    }
    return { ok: true };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .validator((d) => z.object({ mobile: z.string().max(20), code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const phone = normalizePhone(data.mobile);
    if (!phone) return { ok: false, error: "bad_phone" };
    const ip = clientIp(); const id = `phone:${phone}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) { await logAttempt(id, "otp_verify", ip, false, "locked"); return { ok: false, error: "locked", lockedMinutes: lock }; }
    const { data: s, error } = await publicClient().auth.verifyOtp({ phone, token: data.code, type: "sms" });
    if (error || !s.session || !s.user) { await logAttempt(id, "otp_verify", ip, false, error?.code ?? "invalid"); return { ok: false, error: "invalid" }; }
    const db = await admin();
    const { data: profile, error: profileError } = await db.from("profiles").select("active, status").eq("id", s.user.id).maybeSingle();
    if (profileError) {
      console.error("Could not check OTP approval status", profileError.message);
      return { ok: false, error: "unavailable" };
    }
    if (profile?.status === "pending") {
      await logAttempt(id, "otp_verify", ip, false, "pending_approval");
      return { ok: false, error: "pending" };
    }
    if (profile?.status === "rejected") {
      await logAttempt(id, "otp_verify", ip, false, "rejected");
      return { ok: false, error: "rejected" };
    }
    if (!profile?.active || profile.status !== "active") {
      await logAttempt(id, "otp_verify", ip, false, "inactive");
      return { ok: false, error: "invalid" };
    }
    await logAttempt(id, "otp_verify", ip, true);
    return { ok: true, tokens: { access_token: s.session.access_token, refresh_token: s.session.refresh_token } };
  });

/* ---------- Password reset (expiring one-time email link) ---------- */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const ip = clientIp(); const id = `email:${data.email}`;
    if ((await recentCount(id, "reset", 60)) < 3) {
      await logAttempt(id, "reset", ip, true);
      const { error } = await publicClient().auth.resetPasswordForEmail(data.email, { redirectTo: `${origin()}/reset-password` });
      if (error) console.error("reset failed", error.message);
    }
    return { ok: true }; // always generic
  });

/* ---------- First-run setup ---------- */
export const needsSetup = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { count } = await db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super");
  return { needed: (count ?? 0) === 0 };
});

export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(12).max(128),
    nameBn: z.string().trim().min(1).max(100), nameEn: z.string().trim().min(1).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { count } = await db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super");
    if ((count ?? 0) > 0) return { ok: false as const, error: "already_setup" };
    const { data: u, error } = await db.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true });
    if (error || !u.user) return { ok: false as const, error: error?.message ?? "failed" };
    await db.from("profiles").insert({ id: u.user.id, name_bn: data.nameBn, name_en: data.nameEn, email: data.email });
    await db.from("user_roles").insert({ user_id: u.user.id, role: "super" });
    await db.from("audit_logs").insert({ user_id: u.user.id, action: "setup:super_admin" });
    return { ok: true as const };
  });

/* ---------- Staff provisioning (Super Admin / UNO) ---------- */
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    role: z.enum(["worker", "police", "admin", "uno"]),
    nameBn: z.string().trim().min(1).max(100), nameEn: z.string().trim().min(1).max(100),
    contact: z.string().trim().max(255),
    upazilaId: z.string().min(1).max(64),
    unionId: z.string().max(64).optional(),
    ward: z.number().int().min(1).max(9).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const claims = context.claims as { aal?: string };
    if (claims.aal !== "aal2") return { ok: false as const, error: "mfa_required" };
    const { data: myRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (myRoles ?? []).map((r) => r.role);
    const isSuper = roles.includes("super");
    if (!isSuper) {
      if (!roles.includes("uno") || data.role === "uno") return { ok: false as const, error: "forbidden" };
      const { data: me } = await context.supabase.from("profiles").select("upazila_id").eq("id", context.userId).single();
      if (me?.upazila_id !== data.upazilaId) return { ok: false as const, error: "forbidden" };
    }
    const fieldRole = data.role === "worker" || data.role === "police";
    if (data.role !== "uno" && !data.unionId) return { ok: false as const, error: "union_required" };

    const db = await admin();
    const { data: up } = await db.from("upazilas").select("unions").eq("id", data.upazilaId).single();
    if (!up) return { ok: false as const, error: "bad_upazila" };
    if (data.unionId && !(up.unions as { id: string }[]).some((u) => u.id === data.unionId)) return { ok: false as const, error: "bad_union" };

    let created;
    if (fieldRole) {
      const phone = normalizePhone(data.contact);
      if (!phone) return { ok: false as const, error: "bad_phone" };
      created = await db.auth.admin.createUser({ phone, phone_confirm: true });
    } else {
      const email = z.string().email().safeParse(data.contact.toLowerCase());
      if (!email.success) return { ok: false as const, error: "bad_email" };
      const pw = crypto.randomUUID() + crypto.randomUUID();
      created = await db.auth.admin.createUser({ email: email.data, password: pw, email_confirm: true });
    }
    if (created.error || !created.data.user) return { ok: false as const, error: created.error?.message ?? "failed" };
    const uid = created.data.user.id;
    const { error: pe } = await db.from("profiles").insert({
      id: uid, name_bn: data.nameBn, name_en: data.nameEn,
      mobile: fieldRole ? normalizePhone(data.contact) : null, email: fieldRole ? null : data.contact.toLowerCase(),
      upazila_id: data.upazilaId, union_id: data.role === "uno" ? null : data.unionId ?? null,
      ward: fieldRole ? data.ward ?? 1 : null,
    });
    if (pe) { await db.auth.admin.deleteUser(uid); return { ok: false as const, error: pe.message }; }
    await db.from("user_roles").insert({ user_id: uid, role: data.role });
    await db.from("audit_logs").insert({ user_id: context.userId, action: `staff:create:${data.role}`, details: { new_user: uid } });
    // Officers set their own password via an expiring one-time link
    if (!fieldRole) await publicClient().auth.resetPasswordForEmail(data.contact.toLowerCase(), { redirectTo: `${origin()}/reset-password` });
    return { ok: true as const };
  });

/* ---------- Recovery codes ---------- */
export const generateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") return { ok: false as const, codes: [] as string[] };
    const db = await admin();
    const codes = Array.from({ length: 10 }, () => {
      const b = crypto.getRandomValues(new Uint8Array(5));
      const s = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
      return `${s.slice(0, 5)}-${s.slice(5)}`;
    });
    await db.from("mfa_recovery_codes").delete().eq("user_id", context.userId);
    await db.from("mfa_recovery_codes").insert(await Promise.all(codes.map(async (c) => ({ user_id: context.userId, code_hash: await sha256(c) }))));
    await db.from("audit_logs").insert({ user_id: context.userId, action: "mfa:recovery_codes_generated" });
    return { ok: true as const, codes };
  });

export const useRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ code: z.string().trim().toUpperCase().regex(/^[0-9A-F]{5}-[0-9A-F]{5}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const ip = clientIp(); const id = `recovery:${context.userId}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) return { ok: false as const, error: "locked", lockedMinutes: lock };
    const db = await admin();
    const hash = await sha256(data.code);
    const { data: row } = await db.from("mfa_recovery_codes").select("id").eq("user_id", context.userId).eq("code_hash", hash).is("used_at", null).maybeSingle();
    if (!row) { await logAttempt(id, "recovery_code", ip, false, "invalid"); return { ok: false as const, error: "invalid" }; }
    await db.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    // Remove existing factors so the user re-enrols a new authenticator
    const { data: f } = await db.auth.admin.mfa.listFactors({ userId: context.userId });
    for (const factor of f?.factors ?? []) await db.auth.admin.mfa.deleteFactor({ userId: context.userId, id: factor.id });
    await logAttempt(id, "recovery_code", ip, true);
    await db.from("audit_logs").insert({ user_id: context.userId, action: "mfa:recovery_code_used" });
    return { ok: true as const };
  });

export const logSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ action: z.enum(["mfa:enrolled", "mfa:verified"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await db.from("audit_logs").insert({ user_id: context.userId, action: data.action });
    return { ok: true };
  });

/* ---------- Storage purge: files 90 days after completion ---------- */
export const purgeExpiredFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: r } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(r ?? []).some((x) => (PRIV as readonly string[]).includes(x.role))) return { purged: 0 };
    const db = await admin();
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: rows } = await db.from("cases").select("id, files").eq("status", "completed").not("reg_no", "is", null)
      .lt("completed_at", cutoff).eq("files_purged", false).limit(200);
    for (const c of rows ?? []) {
      const paths = ((c.files as { path?: string }[]) ?? []).map((f) => f.path).filter(Boolean) as string[];
      if (paths.length) await db.storage.from("case-files").remove(paths);
      await db.from("cases").update({ files: [], files_purged: true }).eq("id", c.id);
    }
    return { purged: rows?.length ?? 0 };
  });
