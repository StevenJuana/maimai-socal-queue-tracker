/* eslint-disable @next/next/no-img-element -- private signed URLs should not be sent through image optimization. */
import { AdminSectionNav } from "@/components/AdminSectionNav";
import { Navigation } from "@/components/Navigation";
import { reviewRequestAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/require-admin";

export default async function AdminVerifications({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const query = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: requests, error } = await supabase
    .from("verification_requests")
    .select("id,user_id,screenshot_path,created_at")
    .eq("status", "pending")
    .order("created_at");
  const profiles = requests?.length
    ? await supabase.from("profiles").select("id,display_name").in("id", requests.map((request) => request.user_id))
    : { data: [] };
  const nameMap = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.display_name || "Player"]));
  const rows = await Promise.all((requests ?? []).map(async (request) => {
    const { data } = await supabase.storage.from("verification-screenshots").createSignedUrl(request.screenshot_path, 300);
    return { ...request, name: nameMap.get(request.user_id) || "Player", image: data?.signedUrl ?? null };
  }));

  return (
    <main className="site-shell">
      <Navigation />
      <AdminSectionNav />
      <h1 className="page-title">Verification Requests</h1>
      <p className="page-subtitle">Review player screenshots. Images are removed from storage after you approve or reject.</p>
      {query.message && <div className="notice success">{query.message.replaceAll("+", " ")}</div>}
      {query.error && <div className="notice error" role="alert">{query.error.replaceAll("+", " ")}</div>}
      {error ? <div className="empty-state">Could not load verification requests.</div> : rows.length === 0 ? (
        <div className="empty-state"><h3>No pending requests</h3>New verification requests will show up here.</div>
      ) : (
        <div className="location-list">
          {rows.map((request) => (
            <article className="request-card" key={request.id}>
              <div>
                <strong>{request.name}</strong>
                <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>Submitted {new Date(request.created_at).toLocaleString()}</div>
              </div>
              {request.image ? <img src={request.image} alt={`maimai profile screenshot submitted by ${request.name}`} /> : <div className="notice error">Screenshot is unavailable. You can still review the request.</div>}
              <div className="request-actions">
                <form action={reviewRequestAction}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="decision" value="approved" /><button className="primary-button approve">Approve</button></form>
                <form action={reviewRequestAction}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="decision" value="rejected" /><button className="primary-button reject">Reject</button></form>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
