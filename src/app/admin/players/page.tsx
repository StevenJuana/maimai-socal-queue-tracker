import { AdminPlayerDeleteForm } from "@/components/AdminPlayerDeleteForm";
import { AdminSectionNav } from "@/components/AdminSectionNav";
import { Navigation } from "@/components/Navigation";
import { requireAdmin } from "@/lib/require-admin";

export default async function AdminPlayers({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const query = await searchParams;
  const { supabase, user } = await requireAdmin();

  const { data: approvedPlayers, error } = await supabase
    .from("profiles")
    .select("id,display_name,role")
    .eq("verification_status", "approved")
    .order("display_name");

  return (
    <main className="site-shell">
      <Navigation />
      <AdminSectionNav />
      <h1 className="page-title">Approved Players</h1>
      <p className="page-subtitle">Deleting an account is permanent. Its status history remains, with the reporter shown as “Deleted player.”</p>
      {query.message && <div className="notice success">{query.message.replaceAll("+", " ")}</div>}
      {query.error && <div className="notice error" role="alert">{query.error.replaceAll("+", " ")}</div>}
      {error ? <div className="empty-state">Could not load approved accounts.</div> : !approvedPlayers?.length ? (
        <div className="empty-state">No approved player accounts.</div>
      ) : (
        <div className="location-list">
          {approvedPlayers.map((player) => (
            <article className="request-card" key={player.id}>
              <div>
                <strong>{player.display_name}</strong>
                {player.role === "admin" && <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>Administrator account — protected from deletion</div>}
                {player.id === user.id && <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>Your account — protected from deletion</div>}
              </div>
              {player.role === "user" && player.id !== user.id && (
                <AdminPlayerDeleteForm userId={player.id} displayName={player.display_name || "Player"} />
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
