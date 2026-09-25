import Link from "next/link";

export function AdminSectionNav() {
  return (
    <nav className="top-actions admin-section-nav" aria-label="Admin pages">
      <Link className="small-link" href="/admin">Admin home</Link>
      <Link className="small-link" href="/admin/verifications">Verification Requests</Link>
      <Link className="small-link" href="/admin/players">Approved Players</Link>
      <Link className="small-link" href="/admin/test-status">TEST DATA</Link>
    </nav>
  );
}
