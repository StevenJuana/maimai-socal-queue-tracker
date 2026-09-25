# Contributing

Thanks for taking an interest in the project. This is a small community app, so focused, clearly explained contributions are easiest to review.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and use a Supabase project you control for development. Do not use production credentials.
4. Apply the Supabase migrations in `supabase/migrations/` in timestamp order.
5. Run `npm run dev` and open `http://localhost:3000`.

## Development expectations

- Keep changes focused and test the behavior your change affects.
- Preserve the existing Supabase security model, including RLS and server-side admin checks.
- Never commit credentials, tokens, or other secrets.
- Do not use production credentials for local development.

## Checks

Run the checks relevant to your change:

```sh
npm run lint
npm run typecheck
```

`npm run build` is available when it is useful for the change; it is not necessary for every small documentation or UI contribution.

## Pull requests

Create a branch, describe what changed and how you tested it, then open a pull request. Please do not push directly to `main`; the maintainer reviews contributions before merging.
