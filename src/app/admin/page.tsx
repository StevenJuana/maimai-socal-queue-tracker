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
        <Link className="panel" href="/admin/test-status">
          <strong>TEST DATA · Create test status</strong>
          <p className="muted" style={{ marginBottom: 0 }}>Submit a clearly marked test update to exercise the public location cards.</p>
        </Link>
        <Link className="panel" href="/admin/status-moderation">
          <strong>Status moderation</strong>
          <p className="muted" style={{ marginBottom: 0 }}>Review recent status history and remove erroneous reports from public display.</p>
        </Link>
      </div>
    </main>
  );
}
