# Telegram Mini App

## Local preview

```bash
pnpm install
pnpm dev
```

Outside Telegram the app uses four demonstration recipes. In Telegram it uses
the deployed `mini-app-api` URL from `VITE_MINI_APP_API_URL` and sends the raw
Telegram `initData` in the `x-telegram-init-data` header.

## Production build

```bash
pnpm build
```

Publish the resulting `dist` directory on an HTTPS static host. Never add a
Supabase secret key or Telegram bot token to a `VITE_*` variable.

## GitHub Pages

This directory is prepared to be a standalone public repository. The workflow
in `.github/workflows/deploy-pages.yml` builds and publishes the app on every
push to `main`.

1. Create an empty public GitHub repository, for example `grill-weekend-app`.
2. Upload the contents of this `mini-app` directory to the repository root.
3. Open `Settings` > `Pages` in the repository.
4. Select `GitHub Actions` under `Build and deployment`.
5. Push to `main` or run the workflow manually from the `Actions` tab.

The resulting address will be similar to:

```text
https://YOUR-USERNAME.github.io/grill-weekend-app/
```

The Supabase function URL is public configuration, not a secret. The workflow
passes it to Vite as `VITE_MINI_APP_API_URL`. Telegram authentication is still
validated by the Edge Function using the server-only bot token.
