"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function safeMessage(message: string) {
  if (/already registered|already exists/i.test(message)) return "An account with that email already exists. Try logging in.";
  if (/invalid login credentials/i.test(message)) return "That email and password do not match.";
  return "Something went wrong. Please try again in a moment.";
}

function logVerificationError(stage: string, error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  console.error(`[verification-debug] ${stage}`, {
    code: value.code ?? null,
    message: value.message ?? null,
    details: value.details ?? null,
    hint: value.hint ?? null,
  });
}

async function displayNameIsTaken(supabase: Awaited<ReturnType<typeof createClient>>, displayName: string) {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_display_name_available", { candidate_name: displayName });
  return !error && data === false;
}

function normalizeDisplayNameInput(displayName: string) {
  return displayName.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, "");
}

async function removeUserScreenshots(admin: SupabaseClient, userId: string) {
  const bucket = admin.storage.from("verification-screenshots");

  async function removeFolder(folder: string): Promise<boolean> {
    while (true) {
      const { data, error } = await bucket.list(folder, { limit: 1000, sortBy: { column: "name", order: "asc" } });
      if (error) return false;
      if (!data?.length) return true;

      const files: string[] = [];
      const folders: string[] = [];
      for (const entry of data) {
        if (!entry.name || entry.name === "." || entry.name === ".." || entry.name.includes("/")) return false;
        if (entry.id) files.push(`${folder}/${entry.name}`);
        else folders.push(`${folder}/${entry.name}`);
      }

      if (files.length) {
        const { error: removeError } = await bucket.remove(files);
        if (removeError) return false;
      }
      for (const child of folders) {
        if (!await removeFolder(child)) return false;
      }
    }
  }

  return removeFolder(userId);
}

export async function loginAction(formData: FormData) {
  const supabase = await createClient(); if (!supabase) redirect("/login?error=setup");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(safeMessage(error.message))}`);
  revalidatePath("/", "layout"); redirect("/");
}

export async function signupAction(formData: FormData) {
  const supabase = await createClient(); if (!supabase) redirect("/signup?error=setup");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = normalizeDisplayNameInput(String(formData.get("display_name") ?? "")).slice(0, 40);
  const screenshot = formData.get("screenshot");
  if (!displayName || !(screenshot instanceof File) || !screenshot.size || screenshot.size > 4_000_000 || !screenshot.type.startsWith("image/")) {
    redirect("/signup?error=Please+enter+a+display+name+and+upload+an+image+under+4MB.");
  }
  if (await displayNameIsTaken(supabase, displayName)) {
    redirect("/signup?error=That+display+name+is+already+taken.+Choose+another.");
  }
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  if (error) {
    if (await displayNameIsTaken(supabase, displayName)) {
      redirect("/signup?error=That+display+name+is+already+taken.+Choose+another.");
    }
    redirect(`/signup?error=${encodeURIComponent(safeMessage(error.message))}`);
  }
  if (!data.user) redirect("/signup?error=Could+not+create+your+account.");
  if (!data.session) redirect("/login?message=Account+created.+Log+in+to+send+your+verification+request.");
  const path = `${data.user.id}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from("verification-screenshots").upload(path, screenshot, { contentType: screenshot.type, upsert: false });
  if (uploadError) { logVerificationError("screenshot upload", uploadError); redirect("/signup?error=Your+account+was+created,+but+the+image+upload+failed.+Log+in+to+submit+verification."); }
  const { error: profileError } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", data.user.id);
  const { error: requestError } = await supabase.from("verification_requests").upsert({ user_id: data.user.id, screenshot_path: path, status: "pending" }, { onConflict: "user_id" });
  if (profileError) logVerificationError("profile update", profileError);
  if (requestError) logVerificationError("verification_requests upsert", requestError);
  if (profileError || requestError) redirect("/signup?error=Account+created,+but+the+verification+request+could+not+be+saved.+Log+in+to+retry.");
  revalidatePath("/"); redirect("/?message=Your+verification+request+is+pending.");
}

export async function logoutAction() {
  const supabase = await createClient(); if (supabase) await supabase.auth.signOut();
  revalidatePath("/", "layout"); redirect("/");
}

export async function submitVerificationAction(formData: FormData) {
  const supabase=await createClient(); if(!supabase) redirect("/login?error=setup");
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const screenshot=formData.get("screenshot");
  if(!(screenshot instanceof File)||!screenshot.size||screenshot.size>4_000_000||!screenshot.type.startsWith("image/")) redirect("/account?error=Choose+an+image+under+4MB.");
  const {data:profile}=await supabase.from("profiles").select("verification_status").eq("id",user.id).maybeSingle();
  if(profile?.verification_status==="approved") redirect("/account");
  const path=`${user.id}/${crypto.randomUUID()}.jpg`;
  const {error:uploadError}=await supabase.storage.from("verification-screenshots").upload(path,screenshot,{contentType:screenshot.type,upsert:false});
  if(uploadError) { logVerificationError("screenshot upload", uploadError); redirect("/account?error=Screenshot+upload+failed.+Please+try+again."); }
  const {error}=await supabase.from("verification_requests").upsert({user_id:user.id,screenshot_path:path,status:"pending"},{onConflict:"user_id"});
  if(error) logVerificationError("verification_requests upsert", error);
  if(error) { await supabase.storage.from("verification-screenshots").remove([path]); redirect("/account?error=Could+not+save+the+request.+Please+try+again."); }
  const {error:profileError}=await supabase.from("profiles").update({verification_status:"pending"}).eq("id",user.id);
  if(profileError) logVerificationError("profile update", profileError);
  revalidatePath("/admin"); redirect("/account?message=Verification+request+submitted.");
}

export async function submitStatusAction(formData: FormData) {
  const supabase = await createClient(); if (!supabase) redirect("/login?error=setup");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=Please+log+in+to+submit+an+update.");
  const locationId = String(formData.get("location_id") ?? "");
  const playing = Number(formData.get("playing_count")); const queue = Number(formData.get("queue_count"));
  if (!Number.isInteger(playing) || !Number.isInteger(queue) || playing < 0 || queue < 0 || playing > 99 || queue > 99) redirect("/update?error=Counts+must+be+whole+numbers+from+0+to+99.");
  const { error } = await supabase.from("status_updates").insert({ location_id: locationId, playing_count: playing, queue_count: queue, user_id: user.id, is_test: false });
  if (error) redirect(`/update?location=${encodeURIComponent(locationId)}&error=${encodeURIComponent(/row-level security|permission/i.test(error.message) ? "Only approved players can submit updates." : "The update could not be saved. Please try again.")}`);
  revalidatePath("/"); redirect("/?message=Status+updated.");
}

export async function reviewRequestAction(formData: FormData) {
  const supabase = await createClient(); if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const requestId = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["approved", "rejected"].includes(decision)) redirect("/admin/verifications?error=Invalid+review+action.");
  const { data: request } = await supabase.from("verification_requests").select("user_id,screenshot_path").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (!request) redirect("/admin/verifications?error=Request+is+no+longer+pending.");
  const { error } = await supabase.rpc("review_verification_request", { target_request_id: requestId, decision });
  if (error) redirect(`/admin/verifications?error=${encodeURIComponent(/admin/i.test(error.message) ? "Only admins can review verification requests." : "Review could not be saved." )}`);
  await supabase.storage.from("verification-screenshots").remove([request.screenshot_path]);
  revalidatePath("/admin"); revalidatePath("/admin/verifications"); revalidatePath("/"); redirect("/admin/verifications?message=Request+reviewed.");
}

export async function deleteApprovedPlayerAction(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc("is_admin");
  if (adminCheckError || !isAdmin) redirect("/admin/players?error=Only+admins+can+delete+player+accounts.");

  const submittedTargetUserId = String(formData.get("user_id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submittedTargetUserId)) {
    redirect("/admin/players?error=That+account+cannot+be+deleted.");
  }
  const targetUserId = submittedTargetUserId.toLowerCase();
  if (targetUserId === user.id.toLowerCase()) redirect("/admin/players?error=That+account+cannot+be+deleted.");

  const admin = createAdminClient();
  if (!admin) redirect("/admin/players?error=Account+deletion+is+not+configured.");

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id,display_name,role,verification_status")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetError) {
    console.error("[account-delete] Authenticated target profile lookup failed", {
      code: targetError.code,
      message: targetError.message,
      details: targetError.details,
      hint: targetError.hint,
    });
    redirect("/admin/players?error=Could+not+verify+the+player+profile.+Please+try+again.");
  }
  if (!target) redirect("/admin/players?error=Player+profile+was+not+found.");
  if (target.role !== "user") redirect("/admin/players?error=Administrator+accounts+cannot+be+deleted.");
  if (target.verification_status !== "approved") {
    redirect("/admin/players?error=Only+approved+player+accounts+can+be+deleted.");
  }

  const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(targetUserId);
  if (authLookupError || !authUser.user) redirect("/admin/players?error=The+player+account+could+not+be+found.");

  if (!await removeUserScreenshots(admin, targetUserId)) {
    redirect("/admin/players?error=The+player%27s+private+screenshots+could+not+be+removed,+so+the+account+was+not+deleted.");
  }

  const { data: finalTarget, error: finalTargetError } = await admin
    .from("profiles")
    .select("id,role,verification_status")
    .eq("id", targetUserId)
    .maybeSingle();
  const { data: finalAuthUser, error: finalAuthLookupError } = await admin.auth.admin.getUserById(targetUserId);
  const finalTargetIsSelf = Boolean(finalTarget && finalTarget.id.toLowerCase() === user.id.toLowerCase());
  if (
    finalTargetError || !finalTarget || finalTargetIsSelf
    || finalTarget.id.toLowerCase() !== targetUserId
    || finalTarget.role !== "user" || finalTarget.verification_status !== "approved"
    || finalAuthLookupError || !finalAuthUser.user
  ) {
    console.error("[account-delete] Final eligibility recheck failed", JSON.stringify({
      profileLookupError: finalTargetError ? {
        code: finalTargetError.code,
        message: finalTargetError.message,
        details: finalTargetError.details,
        hint: finalTargetError.hint,
      } : null,
      profileFound: Boolean(finalTarget),
      profileIdMatchesTarget: finalTarget?.id.toLowerCase() === targetUserId,
      targetIsCurrentAdmin: finalTargetIsSelf,
      targetRole: finalTarget?.role ?? null,
      targetVerificationStatus: finalTarget?.verification_status ?? null,
      authLookupError: finalAuthLookupError ? {
        code: finalAuthLookupError.code,
        message: finalAuthLookupError.message,
      } : null,
      authUserFound: Boolean(finalAuthUser.user),
    }));
    redirect("/admin/players?error=The+player+is+no+longer+eligible+for+deletion.+Their+account+was+not+deleted.");
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    console.error("[account-delete] Auth account deletion failed", { code: deleteError.code ?? null, message: deleteError.message });
    redirect("/admin/players?error=Account+deletion+failed.+The+player%27s+screenshots+may+already+have+been+removed.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/players");
  revalidatePath("/");
  redirect("/admin/players?message=Player+account+deleted.+Their+status+history+is+preserved.");
}

export async function createTestStatusAction(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin, error: adminCheckError } = await supabase.rpc("is_admin");
  if (adminCheckError || !isAdmin) redirect("/admin/test-status?error=Only+admins+can+create+test+data.");

  const locationId = String(formData.get("location_id") ?? "");
  const playingRaw = String(formData.get("playing_count") ?? "");
  const queueRaw = String(formData.get("queue_count") ?? "");
  const playing = Number(playingRaw);
  const queue = Number(queueRaw);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId)
    || !/^\d{1,2}$/.test(playingRaw) || !/^\d{1,2}$/.test(queueRaw)
    || !Number.isInteger(playing) || !Number.isInteger(queue)
    || playing < 0 || playing > 99 || queue < 0 || queue > 99
  ) redirect("/admin/test-status?error=Choose+an+active+location+and+whole-number+counts+from+0+to+99.");

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("active", true)
    .maybeSingle();
  if (locationError || !location) redirect("/admin/test-status?error=Choose+an+active+location.");

  const { error } = await supabase.from("status_updates").insert({
    location_id: location.id,
    playing_count: playing,
    queue_count: queue,
    user_id: user.id,
    is_test: true,
  });
  if (error) redirect("/admin/test-status?error=Test+status+could+not+be+saved.");

  revalidatePath("/");
  revalidatePath("/admin/test-status");
  redirect("/admin/test-status?message=TEST+DATA+status+submitted.");
}
