"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 40);
  const screenshot = formData.get("screenshot");
  if (!displayName || !(screenshot instanceof File) || !screenshot.size || screenshot.size > 4_000_000 || !screenshot.type.startsWith("image/")) {
    redirect("/signup?error=Please+enter+a+display+name+and+upload+an+image+under+4MB.");
  }
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  if (error) redirect(`/signup?error=${encodeURIComponent(safeMessage(error.message))}`);
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
  const { error } = await supabase.from("status_updates").insert({ location_id: locationId, playing_count: playing, queue_count: queue, user_id: user.id });
  if (error) redirect(`/update?location=${encodeURIComponent(locationId)}&error=${encodeURIComponent(/row-level security|permission/i.test(error.message) ? "Only approved players can submit updates." : "The update could not be saved. Please try again.")}`);
  revalidatePath("/"); redirect("/?message=Status+updated.");
}

export async function reviewRequestAction(formData: FormData) {
  const supabase = await createClient(); if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const requestId = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["approved", "rejected"].includes(decision)) redirect("/admin?error=Invalid+review+action.");
  const { data: request } = await supabase.from("verification_requests").select("user_id,screenshot_path").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (!request) redirect("/admin?error=Request+is+no+longer+pending.");
  const { error } = await supabase.rpc("review_verification_request", { target_request_id: requestId, decision });
  if (error) redirect(`/admin?error=${encodeURIComponent(/admin/i.test(error.message) ? "Only admins can review verification requests." : "Review could not be saved." )}`);
  await supabase.storage.from("verification-screenshots").remove([request.screenshot_path]);
  revalidatePath("/admin"); revalidatePath("/"); redirect("/admin?message=Request+reviewed.");
}
