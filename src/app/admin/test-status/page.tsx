import { AdminSectionNav } from "@/components/AdminSectionNav";
import { Counter } from "@/components/Counter";
import { Navigation } from "@/components/Navigation";
import { createTestStatusAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/require-admin";

export default async function AdminTestStatus({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const query = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: locations, error: locationsError } = await supabase
    .from("locations")
    .select("id,name,city")
    .eq("active", true)
    .order("sort_order")
    .order("name");

  return (
    <main className="site-shell">
      <Navigation />
      <AdminSectionNav />
      <h1 className="page-title">TEST DATA status</h1>
      <p className="page-subtitle">Create a test update to exercise the public location cards. It can appear publicly as the latest fresh status, but is marked as test data for future statistics.</p>
      {query.message && <div className="notice success" role="status">{query.message.replaceAll("+", " ")}</div>}
      {query.error && <div className="notice error" role="alert">{query.error.replaceAll("+", " ")}</div>}
      {locationsError ? <div className="empty-state">Could not load active locations.</div> : !locations?.length ? (
        <div className="empty-state">There are no active locations available for test data.</div>
      ) : (
        <form action={createTestStatusAction} className="form-stack">
          <div className="notice"><strong>TEST DATA</strong> — This update is not a real observation.</div>
          <div className="field">
            <label htmlFor="location_id">TEST DATA location</label>
            <select id="location_id" name="location_id" required defaultValue={locations[0].id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "13px 14px", minHeight: 48, background: "white" }}>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.city}</option>)}
            </select>
          </div>
          <Counter name="playing_count" label="TEST DATA · Playing now" help="Players currently on the machines" />
          <Counter name="queue_count" label="TEST DATA · Waiting" help="People waiting for their turn" />
          <button className="primary-button" type="submit">Submit TEST DATA status</button>
        </form>
      )}
    </main>
  );
}
