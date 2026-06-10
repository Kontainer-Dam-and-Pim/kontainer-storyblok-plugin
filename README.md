# Kontainer Asset Picker — Storyblok Field Plugin

A Storyblok [field plugin](https://www.storyblok.com/docs/plugins/field-plugins/introduction)
that opens Kontainer in CMS mode, lets editors pick a file, and **imports the
actual file into the Storyblok space's asset library** — producing a real,
self-hosted Storyblok asset (`a.storyblok.com`), not an external link.

## How it works

1. The field renders a **Select from Kontainer** button (opens a modal iframe
   with Kontainer in CMS mode).
2. The editor authenticates (if needed) and picks a file in Kontainer.
3. Kontainer fetches the file bytes (authenticated, in its own session) and
   posts them back to the plugin as a base64 data URL:
   ```js
   { source: 'kontainer', action: 'kontainer-insert', data: { ...fileInfo, dataUrl } }
   ```
4. The plugin uploads those bytes to the Storyblok **Management API** directly
   from the browser (signed upload → S3 → `finish_upload`), then stores the
   resulting Storyblok `Asset` as the field value.

The Management API host is auto-derived from the editor's region (EU/US/CA/AP/CN),
defaulting to EU — no region config.

## Configuration (2 options)

| Option | Required | Value |
| --- | --- | --- |
| `kontainerHost` | yes | Your Kontainer host, no protocol — e.g. `company.kontainer.com` |
| `storyblokManagementToken` | yes | A Storyblok [Personal Access Token](https://app.storyblok.com/#/me/account?tab=token) (or space token) with asset write access |

See `field-plugin.config.json`. In the Sandbox the options apply automatically;
`npm run deploy` applies them in production.

> **Security tradeoff.** The Management API token is stored as a plugin option,
> so it is delivered to the browser of every editor who uses this field. Anyone
> with that token has write access to the space's assets. This is the price of
> "no backend / simplest setup". If that exposure is unacceptable, move the
> upload behind a server that holds the token (the plugin would POST the bytes
> there instead of calling the Management API directly).

## Kontainer backend requirements

1. **Enable the Storyblok integration** for the client (admin toggle
   `switch_storyblok_integration_enabled`). This drives the CSP/cookie config
   below.
2. **CSP `frame-ancestors`** — the Storyblok field-plugin serving origin **and**
   `https://app.storyblok.com` must be allowlisted (Kontainer is framed two
   levels deep; the whole ancestor chain is checked). Configured under
   `kontainer.integrations.storyblok.origins`.
3. **`connect-src` / CDN CORS** — Kontainer's CMS-mode page fetches the file
   bytes from its CDN to build the data URL; the Storyblok-enabled client gets
   the same CDN allowances as Figma.
4. **`SameSite=None`** cookies — so the embedded (cross-site) Kontainer iframe
   stays authenticated. Enabled when the integration is on.

## Develop

```sh
npm run dev
```

Open the [Sandbox](https://plugin-sandbox.storyblok.com/field-plugin/), set both
options, and exercise the picker.

## Deploy

Issue a [personal access token](https://app.storyblok.com/#/me/account?tab=token),
copy `.env.local.example` to `.env.local`, set `STORYBLOK_PERSONAL_ACCESS_TOKEN`,
then:

```sh
npm run deploy
```
