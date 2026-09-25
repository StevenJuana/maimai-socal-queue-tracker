# Security

## Reporting a concern

Please report issues involving authentication, authorization or RLS, exposed credentials, private screenshot access, admin features, status data exposure, or another vulnerability privately. Contact the maintainer through their GitHub profile rather than opening a public issue. Do not include secrets, tokens, or sensitive user data in a report.

## Security boundaries

- Supabase Row Level Security is part of the application’s security boundary.
- Public queue data is served through the curated `public_status_updates` view; raw `status_updates` history is not intended to be publicly readable.
- The service-role key is server-only. It bypasses normal RLS and must never be sent to a browser or committed.
- Verification screenshots are stored in a private bucket.
- Admin operations are authorized server-side and checked by database functions where applicable.
