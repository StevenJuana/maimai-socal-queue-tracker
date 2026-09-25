"use client";

import { deleteApprovedPlayerAction } from "@/lib/actions";

export function AdminPlayerDeleteForm({ userId, displayName }: { userId: string; displayName: string }) {
  return (
    <form
      action={deleteApprovedPlayerAction}
      onSubmit={(event) => {
        if (!window.confirm(`Permanently delete ${displayName}'s account? Their status history will remain, attributed to Deleted player.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button className="primary-button reject" type="submit">Delete account</button>
    </form>
  );
}
