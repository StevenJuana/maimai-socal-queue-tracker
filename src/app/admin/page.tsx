import Link from "next/link";
import { AdminSectionNav } from "@/components/AdminSectionNav";
import { Navigation } from "@/components/Navigation";
import { requireAdmin } from "@/lib/require-admin";

export default async function Admin() {
  await requireAdmin();

  return (
    <main className="site-shell">
      <Navigation />
      <AdminSectionNav />
      <h1 className="page-title">Admin</h1>
      <p className="page-subtitle">Choose an admin area.</p>
      <div className="location-list">
        <Link className="panel" href="/admin/verifications">
          <strong>Verification Requests</strong>
          <p className="muted" style={{ marginBottom: 0 }}>Review pending player verification submissions.</p>
        </Link>
        <Link className="panel" href="/admin/players">
          <strong>Approved Players</strong>
          <p className="muted" style={{ marginBottom: 0 }}>View approved accounts and manage player accounts.</p>
        </Link>
      </div>
    </main>
  );
}
