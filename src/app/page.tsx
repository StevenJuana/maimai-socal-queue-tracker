import Link from "next/link";
import { Clock3, Gamepad2, MapPin, Users } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { createClient } from "@/lib/supabase/server";
import type { LocationStatus } from "@/lib/types";

function age(date: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000)); if (minutes < 1) return { text: "just now", cls: "" }; if (minutes < 60) return { text: `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`, cls: "" }; const hours = Math.floor(minutes / 60); if (hours < 24) return { text: `${hours} ${hours === 1 ? "hour" : "hours"} ago`, cls: "stale-old" }; return { text: `${Math.floor(hours / 24)} days ago`, cls: "stale-very-old" }; }
function isCurrentStatus(date: string) { return Date.now() - new Date(date).getTime() < 6 * 60 * 60 * 1000; }
export default async function Home({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const query = await searchParams; const supabase = await createClient();
  let locations: LocationStatus[] = []; let loadFailed = false; let statusReadFailed = false; let loggedIn = false; let approved = false;
  if (supabase) {
    const [locs, auth] = await Promise.all([supabase.from("locations").select("id,name,city,created_at").eq("active", true).order("sort_order").order("name"), supabase.auth.getUser()]);
    const { user } = auth.data; loggedIn = !!user;
    if (locs.error) loadFailed = true;
    if (!locs.error && locs.data?.length) {
      const [updates, profile] = await Promise.all([supabase.from("public_status_updates").select("location_name,playing_count,queue_count,created_at,display_name").in("location_name", locs.data.map(x => x.name)), user ? supabase.from("profiles").select("verification_status").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null })]);
      if (updates.error) {
        statusReadFailed = true;
        console.error("[home] public status query failed", { code: updates.error.code, message: updates.error.message, details: updates.error.details, hint: updates.error.hint });
      }
      approved = profile.data?.verification_status === "approved";
      const latest = new Map<string, LocationStatus["latest_update"]>();
      for (const row of updates.data ?? []) latest.set(row.location_name, { playing_count: row.playing_count, queue_count: row.queue_count, created_at: row.created_at, display_name: row.display_name || "Player" });
      locations = locs.data.map(x => ({ ...x, latest_update: latest.get(x.name) ?? null }));
    }
  } else loadFailed = true;
  return <main className="site-shell"><Navigation/><header className="hero"><span className="eyebrow">Southern California · Round1</span><h1>maimai status,<br/>from the community.</h1><p>Check current maimai DX play and queue counts at Round1 locations across SoCal. Status is crowdsourced and can change quickly.</p></header>{query.message && <div className="notice success" role="status">{query.message}</div>}<div className="section-head"><h2>Round1 locations</h2><span>{locations.length ? `${locations.length} locations` : "Community reported"}</span></div>{loadFailed ? <div className="empty-state"><h3>Can’t load locations right now</h3>Please check your connection or try again soon.</div> : locations.length === 0 ? <div className="empty-state"><h3>No locations available yet</h3>Locations will appear here when configured in the database.</div> : <div className="location-list">{locations.map(loc => { const previousUpdate = loc.latest_update; const update = previousUpdate && isCurrentStatus(previousUpdate.created_at) ? previousUpdate : null; const stale = update ? age(update.created_at) : null; return <article className="location-card" key={loc.id}><div className="card-foot"><div><div className="loc-name">Round1 {loc.name}</div><div className="loc-city"><MapPin size={12} style={{display:"inline",verticalAlign:"-2px"}}/> {loc.city}, California</div></div>{approved && <Link className="update-link" href={`/update?location=${loc.id}`}><Gamepad2/> Update</Link>}</div>{update ? <><div className="counts"><div className="count-pill play"><Gamepad2/>{update.playing_count} playing</div><div className="count-pill queue"><Users/>{update.queue_count} waiting</div></div><div className="updated"><span><i className={`stale-dot ${stale?.cls ?? ""}`}/><Clock3 size={13} style={{display:"inline",verticalAlign:"-2px"}}/> Updated {stale?.text} by <strong>{update.display_name}</strong></span></div></> : <><div className="empty-status">{statusReadFailed ? "Status temporarily unavailable." : "No status reported yet."}</div><div className="updated"><span><Clock3 size={13}/> {statusReadFailed ? "Could not load the latest community update" : previousUpdate ? "Waiting for a fresh community update" : "Waiting for the first community update"}</span></div></>}{!approved && <div style={{marginTop:12,fontSize:12,color:"var(--muted)"}}>{loggedIn ? "Player verification approval is required to submit updates." : <> <Link href="/signup" style={{color:"var(--red)",fontWeight:700}}>Request player verification</Link> to submit status updates.</>}</div>}</article>; })}</div>}<footer style={{fontSize:11,color:"var(--muted)",textAlign:"center",padding:"24px 0"}}>Community reported counts · Please verify in person</footer></main>;
}
