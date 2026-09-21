# Kontainer Asset Picker — Storyblok Field Plugin

A Storyblok [field plugin](https://www.storyblok.com/docs/plugins/field-plugins/introduction)
that opens Kontainer in CMS mode and lets editors pick a file without leaving
the Visual Editor.

## Modes

| Mode | What gets stored | Credential needed |
| --- | --- | --- |
| `external` (default) | A Storyblok asset with `is_external_url: true`, pointing at Kontainer's CDN | none |
| `import` | A real, self-hosted Storyblok asset (`a.storyblok.com`) — the bytes are copied in | a Storyblok Management API token |

**Use `external` unless you have a specific reason not to.** Kontainer stays
the source of truth, so replacing a file in the DAM updates it everywhere it is
used; nothing is copied, so file size is irrelevant; and setup is a single
option with no credential in play.

The tradeoff: Storyblok's image service cannot transform an external URL. Use
Kontainer's own transformation parameters on the stored URL instead.

`import` exists for spaces that require every asset to be self-hosted. It is
opt-in per field, and its security tradeoff is real — see below.

## Configuration

Field plugin options are set **per field**, by a space admin, in the block
schema. Storyblok does not ship option *values* with the plugin ("the option
values are not shared. Only keys are configured for security reasons"), so
every field using this plugin needs its own values.

| Option | Required | Value |
| --- | --- | --- |
| `kontainerHost` | yes | Kontainer host, with or without protocol — e.g. `company.kontainer.com` |
| `mode` | no | `external` (default) or `import` |
| `storyblokRegion` | import only | `eu` (default), `us`, `ca`, `ap`, `cn` |
| `storyblokManagementToken` | import only | A [Personal Access Token](https://app.storyblok.com/#/me/account?tab=token) with asset write access |
| `maxImportMb` | no | Import size ceiling, default `50` |

> **Security tradeoff in `import` mode.** The Management API token is a plugin
> option, so it is delivered to the browser of every editor who uses the field,
> and a Storyblok PAT is account-wide rather than space-scoped. Storyblok
> provides no sanctioned place for a credential in a field plugin — space-level
> settings are for Space and Tool plugins only, and their docs state plainly
> that "credentials such as secrets and passwords should not be stored" there.
> If you need self-hosted assets *and* cannot expose a token, the upload has to
> move behind a Kontainer-hosted endpoint that holds the credential server-side.

Set `storyblokRegion` explicitly for any non-EU space. The plugin can infer the
region from the editor origin, but only in Chromium — inside the sandboxed
plugin iframe `document.referrer` is usually empty and `ancestorOrigins` does
not exist in Firefox or Safari, so an unset option there means the EU host and
a 401.

## What gets stored

Both modes save a standard Storyblok `asset` value with the Kontainer reference
preserved in `meta_data`:

```jsonc
{
  "id": null,                     // the Storyblok asset id in import mode
  "fieldtype": "asset",
  "filename": "https://company.kontainer.com/file/123/hero.jpg",
  "name": "hero.jpg",
  "alt": "A hero image",
  "title": "Campaign hero",
  "source": "kontainer",
  "is_external_url": true,
  "meta_data": {
    "kontainer_host": "company.kontainer.com",
    "kontainer_file_id": 123,
    "kontainer_folder_id": 7,
    "kontainer_url": "https://company.kontainer.com/file/123/hero.jpg",
    "kontainer_thumbnail_url": "https://company.kontainer.com/thumb/123.jpg",
    "kontainer_extension": "jpg",
    "kontainer_type": "image",
    "kontainer_focal_point_x": 400,
    "kontainer_focal_point_y": 300,
    "kontainer_picked_at": "2026-09-21T10:00:00.000Z"
  }
}
```

A focal point set in Kontainer is carried across in two forms. `focus` holds
Storyblok's own `X1xY1:X2xY2` notation, ready for
`/filters:focal(${asset.focus})` on an imported asset. The raw pixel
coordinates stay in `meta_data`, because Storyblok's image service does not
transform an external URL — for a linked file, pass them to Kontainer's own
transformation parameters instead.

When a download template applies, `url` points at a resized rendition while
Kontainer stores the focal point against the original, so the coordinates are
scaled into the rendition's dimensions before being written.

`kontainer_file_id` is what any future de-duplication or "the file changed in
Kontainer" re-sync will key on. Adding it to values that are already saved in
customer spaces would mean a Management API migration, which is why it is
written from the first release.

## How it works

1. The field renders a **Select from Kontainer** button, opening a modal iframe
   with Kontainer in CMS mode.
2. The editor authenticates (if needed) and picks a file.
3. Kontainer posts the file back:
   ```js
   { source: 'kontainer', action: 'kontainer-insert', data: { ...fileInfo, dataUrl } }
   ```
   The plugin only accepts this message from `https://<kontainerHost>`.
4. In `external` mode the Kontainer URL is stored and `dataUrl` is discarded.
   In `import` mode the bytes are uploaded to the Management API (signed upload
   → S3 → `finish_upload`) and the resulting Storyblok asset is stored.

> Kontainer currently base64-encodes the file into `dataUrl` on every pick, even
> in `external` mode where it is thrown away. Suppressing that for external
> fields is a worthwhile optimisation on the Kontainer side.

## Kontainer backend requirements

1. **Enable the Storyblok integration** for the client (admin toggle
   `switch_storyblok_integration_enabled`). This drives the CSP/cookie config
   below.
2. **CSP `frame-ancestors`** — Kontainer is framed two levels deep and the whole
   ancestor chain is checked, so the allowlist needs both the plugin serving
   origin and the editor:
   - `https://plugins.storyblok.com` — deployed field plugins
   - `https://plugin-sandbox.storyblok.com` — the sandbox, for development
   - `https://app.storyblok.com`, plus `https://app-us.storyblok.com`,
     `https://app-ca.storyblok.com`, `https://app-ap.storyblok.com` and
     `https://app.storyblokchina.cn` for non-EU customers

   Configured under `kontainer.integrations.storyblok.origins`. Note that the
   sandbox and the deployed origin differ — allowlisting only the sandbox
   produces a blank frame on the first real install.
3. **`connect-src` / CDN CORS** — the CMS-mode page fetches file bytes from the
   CDN to build the data URL; the Storyblok-enabled client gets the same CDN
   allowances as Figma.
4. **`SameSite=None`** cookies — so the embedded cross-site Kontainer iframe
   stays authenticated. Enabled when the integration is on.

## Develop

```sh
npm run dev          # vite dev server on :8080
npm test             # unit tests
npm run typecheck
npm run build
```

Open the [Sandbox](https://plugin-sandbox.storyblok.com/field-plugin/), point it
at the dev server, set the options, and exercise the picker.

## Deploy

Issue a [personal access token](https://app.storyblok.com/#/me/account?tab=token),
copy `.env.local.example` to `.env.local`, set `STORYBLOK_PERSONAL_ACCESS_TOKEN`,
then:

```sh
npm run deploy
```

There is no CI deployment: the repository lives on Bitbucket Server, so deploys
are run by hand from a checkout.

This deploys as `kontainer` at `--scope partner-portal`. **Never change the
`--name`**: it is the field type id stored in every customer's component
schema, so renaming it orphans their fields. Pass `--no-publish` to upload a
build without releasing it to installed spaces.

Distribution is then Partner Portal → **Extensions → New Extension**, attaching
this plugin under the Storyblok field types, filling in icon/intro/description/
author/website, and sharing the install link. Customers need space **admin**
rights to install.
