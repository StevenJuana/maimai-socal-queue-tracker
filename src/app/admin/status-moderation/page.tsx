import { AdminSectionNav } from "@/components/AdminSectionNav";
import { Navigation } from "@/components/Navigation";
import { removeStatusUpdateAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/require-admin";

type RecentStatusUpdate = {
  status_id?: string;
  id?: string;
  location_id: string;
  location_name: string;
  location_sort_order: number;
  playing_count: number;
  queue_count: number;
  created_at: string;
  display_name: string;
  is_test: boolean;
  is_removed: boolean;
};

export default async function AdminStatusModeration({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const query = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: locations, error: locationsError }, { data: statusData, error: statusError }] = await Promise.all([
    supabase.from("locations").select("id,name,sort_order").eq("active", true).order("sort_order").order("name"),
    supabase.rpc("admin_recent_status_updates"),
  ]);
  const updates = (statusData ?? []) as RecentStatusUpdate[];
  const updatesByLocation = new Map<string, RecentStatusUpdate[]>();
  for (const update of updates) {
    const history = updatesByLocation.get(update.location_id) ?? [];
    history.push(update);
    updatesByLocation.set(update.location_id, history);
  }

  return (
    <main className="site-shell">
      <Navigation />
      <AdminSectionNav />
      <h1 className="page-title">Status moderation</h1>
      <p className="page-subtitle">Review up to 10 recent updates per active location. Removing a report excludes it from public status and future statistics while preserving its history.</p>
      {query.message && <div className="notice success" role="status">{query.message.replaceAll("+", " ")}</div>}
      {query.error && <div className="notice error" role="alert">{query.error.replaceAll("+", " ")}</div>}
      {locationsError || statusError ? <div className="empty-state">Could not load status history.</div> : !locations?.length ? (
        <div className="empty-state">There are no active locations.</div>
      ) : (
        <div className="location-list">
          {locations.map((location) => {
            const history = updatesByLocation.get(location.id) ?? [];
            return (
              <section key={location.id}>
                <div className="section-head"><h2>{location.name}</h2><span>Recent history</span></div>
                {history.length === 0 ? <div className="empty-state">No status updates found for this location.</div> : (
                  <div className="location-list">
                    {history.map((update, index) => {
                      const statusId = update.status_id ?? update.id;
                      return <article className="request-card" key={statusId ?? `${location.id}-${index}`}>
                        <div className="card-foot">
                          <strong>{update.playing_count} playing · {update.queue_count} waiting</strong>
                          <span className="muted" style={{ fontSize: 12 }}>{new Date(update.created_at).toLocaleString()}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          Updated by {update.display_name || "Deleted player"}
                          {update.is_test && <strong> · TEST DATA</strong>}
                          {update.is_removed && <strong> · REMOVED / EXCLUDED</strong>}
                        </div>
                        {!update.is_removed && statusId && (
                          <details>
                            <summary style={{ cursor: "pointer", color: "var(--red)", fontSize: 13, fontWeight: 750 }}>Remove / exclude this status</summary>
                            <p className="notice error">Remove this status update? It will no longer be used for public status display or statistics. The original history will be preserved.</p>
                            <form action={removeStatusUpdateAction.bind(null, statusId)}>
                              <button className="primary-button reject" type="submit">Confirm removal and exclusion</button>
                            </form>
                          </details>
                        )}
                      </article>
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
