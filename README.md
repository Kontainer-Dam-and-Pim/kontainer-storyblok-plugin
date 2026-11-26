# Kontainer Asset Picker for Storyblok

Pick images, videos and files from your [Kontainer](https://kontainer.com) DAM
directly in Storyblok's Visual Editor, without downloading and re-uploading
them.

The plugin adds a **Select from Kontainer** field to any block. Editors browse,
search and filter your Kontainer library as usual, optionally apply a download
template (crop, resize, format), and pick a file. Storyblok stores a standard
asset value that points at Kontainer's CDN, so Kontainer stays the single
source of truth: replace a file in Kontainer and it updates everywhere it is
used.

## Features

- **No copies.** Files are linked from Kontainer's CDN, not uploaded to
  Storyblok. File size does not matter and nothing goes out of sync.
- **Metadata travels with the file.** Alt text, title and the focal point set
  in Kontainer are carried onto the Storyblok asset.
- **Download templates.** Pick a crop or resized rendition in the picker; its
  CDN URL is what gets stored.
- **Works with every file type.** Images show a preview; PDFs, videos and other
  files show a card with their file type.
- **Standard asset value.** The field returns the same shape as Storyblok's own
  asset field, so your frontend code needs no special handling.
- **Optional import mode** for spaces that require every asset to live in
  Storyblok's own asset library.

## Requirements

- Admin rights on the Storyblok space you are installing into.
- A Kontainer account (`https://yourcompany.kontainer.com`) with the Storyblok
  integration enabled. Ask your Kontainer account manager to switch it on; the
  picker cannot open inside Storyblok without it.

Field plugins are available on every Storyblok plan.

## Installation

You add the plugin to your own Storyblok account once, then assign it to the
spaces that should use it.

1. **Download the plugin file:**
   [kontainer-storyblok-plugin.js](https://github.com/Kontainer-Dam-and-Pim/kontainer-storyblok-plugin/releases/latest/download/kontainer-storyblok-plugin.js).
   If it opens in your browser, right-click the link and choose **Save link as**.
2. In Storyblok, click your avatar and go to **My account → My plugins**, then
   click **New**.
3. Name the plugin, for example `yourcompany-kontainer`. Plugin names are
   unique across all of Storyblok, so include your company name.
4. Open the plugin, delete the example code in the editor, and paste in the
   entire contents of the downloaded file.
5. Click **Save**, then **Publish**.
6. Open **Settings & Details** and select your space under
   **Assigned Spaces**.

To update later, download the latest file again, paste it over the old code,
and publish.

## Add the field to a block

1. In your space, open **Block Library** and choose the block that should get
   the picker.
2. Add a new field, set its type to **Plugin**, and choose the plugin you
   created during installation.
3. Add the option `kontainerHost` and set it to your Kontainer domain, for
   example `yourcompany.kontainer.com`. The `https://` prefix is optional.

Storyblok stores plugin options per field, so set `kontainerHost` on every
field that uses the picker.

## Pick a file

Open a story that uses the block and click **Select from Kontainer**. The first
time, log in with your normal Kontainer username and password. Browse to a
file, optionally apply a download template, and select it.

The field then shows a preview and the file name. **Replace asset** picks a
different file; **Remove asset** clears the field.

## Field options

| Option                     | Required         | Value                                                                                                  |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `kontainerHost`            | Yes              | Your Kontainer domain, e.g. `yourcompany.kontainer.com`                                                |
| `mode`                     | No               | `external` (default) links the file from Kontainer. `import` copies it into Storyblok's asset library. |
| `storyblokRegion`          | Import mode only | `eu` (default), `us`, `ca`, `ap` or `cn`                                                               |
| `storyblokManagementToken` | Import mode only | A Storyblok personal access token with asset write access                                              |
| `maxImportMb`              | No               | Largest file import mode accepts, in MB. Default `50`.                                                 |

## Use the asset in your frontend

The field returns a standard Storyblok asset object:

```js
const { filename, alt, title, focus } = story.content.hero
```

Request the file from `filename`; it is served by Kontainer's CDN.

Storyblok's image service cannot transform an external URL. Control size and
format with a download template chosen in the picker, or with Kontainer's own
transformation parameters on the URL.

The full stored value looks like this:

```jsonc
{
  "id": null,
  "fieldtype": "asset",
  "filename": "https://yourcompany.kontainer.com/file/123/hero.jpg",
  "name": "hero.jpg",
  "alt": "A hero image",
  "title": "Campaign hero",
  "copyright": "",
  "focus": "400x300:401x301",
  "source": "kontainer",
  "is_external_url": true,
  "meta_data": {
    "kontainer_host": "yourcompany.kontainer.com",
    "kontainer_file_id": 123,
    "kontainer_folder_id": 7,
    "kontainer_url": "https://yourcompany.kontainer.com/file/123/hero.jpg",
    "kontainer_thumbnail_url": "https://yourcompany.kontainer.com/thumb/123.jpg",
    "kontainer_extension": "jpg",
    "kontainer_type": "image",
    "kontainer_focal_point_x": 400,
    "kontainer_focal_point_y": 300,
    "kontainer_picked_at": "2026-09-21T10:00:00.000Z",
  },
}
```

- `alt` and `title` come from the file's texts in Kontainer.
- `focus` is the Kontainer focal point in Storyblok's `X1xY1:X2xY2` notation.
  When a download template resizes the image, the point is scaled to the
  rendition. The raw pixel coordinates are also kept in `meta_data` for use
  with Kontainer's transformation parameters.
- `meta_data.kontainer_file_id` identifies the file in Kontainer.

## Import mode

Some teams require every asset to be hosted by Storyblok itself. Setting
`mode` to `import` copies the picked file into the space's asset library
instead of linking it. The file then becomes a normal Storyblok asset that
Storyblok's image service can transform.

Before switching a field to import mode:

- **The copy no longer follows Kontainer.** Replacing the file in Kontainer
  does not update the Storyblok copy.
- **The token reaches every editor's browser.** `storyblokManagementToken` is
  a field option, and Storyblok delivers field options to the browser of
  everyone who uses the field. Create a dedicated token with the **Assets**
  scope only, restricted to the one space that needs it. Never reuse a token
  with access to your whole account.
- **Set `storyblokRegion` for spaces outside the EU.** Without it the plugin
  can only guess the region, and in Firefox and Safari it falls back to the EU
  API, which rejects the token for a non-EU space.

## Troubleshooting

| Symptom                                                        | Cause                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| The **Select from Kontainer** button is greyed out             | `kontainerHost` is not set on this field, or the field is in import mode without a token. The field shows a hint saying which.                    |
| The picker opens but stays blank or says it refused to connect | The Storyblok integration is not enabled on your Kontainer account. Contact your account manager.                                                 |
| You pick a file and nothing happens                            | `kontainerHost` does not exactly match the Kontainer domain the picker runs on. Use the `yourcompany.kontainer.com` address, not a custom domain. |
| Import fails with a 401                                        | The token is wrong or expired, or `storyblokRegion` is missing for a non-EU space.                                                                |
| The preview shows a file card instead of an image              | Expected for PDFs, videos and other non-image files.                                                                                              |

Still stuck? Email [support@kontainer.com](mailto:support@kontainer.com).

## Development

The flake provides Node.js (the major version in `.nvmrc`), pnpm and the
GitHub CLI. Enter it with `nix develop`, or let direnv load it from `.envrc`.
Without Nix, use Node.js 24 and pnpm 11.

```sh
pnpm install
pnpm dev           # Vite dev server on http://localhost:8080
pnpm test          # unit tests
pnpm typecheck
pnpm build         # writes dist/index.js
nix build          # tests and builds result/kontainer-storyblok-plugin.js
```

To try the plugin while developing, open the
[Storyblok field plugin sandbox](https://plugin-sandbox.storyblok.com/field-plugin/),
point it at the dev server, and set the field options there.

When a dependency change alters `pnpm-lock.yaml`, `nix build` fails with a
hash mismatch. Copy the `got:` hash into `pnpmDeps.hash` in `nix/package.nix`.

### Releasing

1. Update `CHANGELOG.md` and the `version` in `package.json`.
2. Build with Nix and attach the bundle to a GitHub release. The installation
   link downloads the asset named `kontainer-storyblok-plugin.js` from the
   latest release, which is the file `nix build` produces:

   ```sh
   nix build
   gh release create "v$(node -p 'require("./package.json").version')" result/kontainer-storyblok-plugin.js
   ```

3. Kontainer maintainers also deploy to the Partner Portal with
   `pnpm run deploy`, which needs `STORYBLOK_PERSONAL_ACCESS_TOKEN` in
   `.env.local` (see `.env.local.example`). Never change the `--name` in that
   script: it is the field type id stored in every space that uses the plugin,
   so renaming it breaks their fields.

## License

[MIT](./LICENSE) © Kontainer
