import { redirect } from "next/navigation";
import { Navigation } from "@/components/Navigation";
import { createClient } from "@/lib/supabase/server";
import { submitVerificationAction } from "@/lib/actions";
export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, pendingRequestResult] = await Promise.all([
    supabase.from("profiles").select("display_name,verification_status").eq("id", user.id).maybeSingle(),
    supabase.from("verification_requests").select("id").eq("user_id", user.id).eq("status", "pending").maybeSingle(),
  ]);
  const profileStatus = profile?.verification_status ?? "unknown";
  const hasPendingRequest = !pendingRequestResult.error && !!pendingRequestResult.data;

  return <main className="site-shell"><Navigation/><h1 className="page-title">My account</h1><p className="page-subtitle">Your player verification status.</p>
    {query.error && <div className="notice error">{query.error.replaceAll("+", " ")}</div>}
    {query.message && <div className="notice success">{query.message.replaceAll("+", " ")}</div>}
    <section className="panel">
      <div className="eyebrow">{profile?.display_name || user.email}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 9 }}>Profile verification status</div>
      <h2 style={{ margin: "4px 0 10px", textTransform: "capitalize" }}>{profileStatus}</h2>
      <p className="muted" style={{ lineHeight: 1.5, marginBottom: 0 }}>
        {profileStatus === "approved" ? "You can submit current play and queue counts from any location." :
          profileStatus === "rejected" ? "Your profile verification status is rejected. Submit a new screenshot to request another review." :
            profileStatus === "pending" ? "Your profile verification status is pending." : "A profile verification status is not available."}
      </p>
      <div className="muted" style={{ fontSize: 12, marginTop: 16 }}>Verification request</div>
      <p style={{ lineHeight: 1.5, margin: "5px 0 0" }}>
        {pendingRequestResult.error ? "We couldn’t confirm whether a pending verification request is on file." :
          hasPendingRequest ? "A verification request is awaiting an administrator’s review." :
            "No pending verification request is on file."}
      </p>
    </section>
    {profileStatus !== "approved" && !hasPendingRequest && <section style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 17 }}>Player verification</h2>
      <form action={submitVerificationAction} className="form-stack">
        <div className="field"><label htmlFor="screenshot">Maimai profile screenshot</label><input className="file-input" id="screenshot" name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" required/><span className="muted" style={{ fontSize: 12 }}>Private to admins and removed after review. Max 4MB.</span></div>
        <button className="primary-button">{profileStatus === "rejected" ? "Request another review" : "Submit verification request"}</button>
      </form>
    </section>}
  </main>;
}
