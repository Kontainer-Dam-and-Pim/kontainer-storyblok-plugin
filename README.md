# Kontainer Asset Picker — Storyblok Field Plugin

A Storyblok [field plugin](https://www.storyblok.com/docs/plugins/field-plugins/introduction)
that opens Kontainer in CMS mode and lets editors pick a file straight into a
field. Mirrors the Kontainer Figma plugin: it embeds Kontainer
(`/login-cms-redirect?cmsMode=1`) in a modal iframe, the editor picks an asset,
and Kontainer posts the selected file back into the field value.

## How it works

1. The field renders a **Select from Kontainer** button.
2. Clicking it opens a portal modal containing an iframe:
   `https://<kontainerHost>/login-cms-redirect?cmsMode=1&cmsPluginType=storyblok&cmsPluginId=storyblok`
3. The editor authenticates (if needed) and picks a file inside Kontainer.
4. Kontainer's `cmsStoryblokCallback` posts a structured message to the parent:
   ```js
   { source: 'kontainer', action: 'kontainer-insert', data: <FileInfo> }
   ```
5. The plugin validates `event.origin` against `kontainerHost`, stores the full
   `FileInfo` object as the field value, and closes the modal.

The stored value is the complete Kontainer `FileInfo` object
(`url`, `thumbnailUrl`, `alt`, `fileName`, `fileId`, `originalWidth`,
`originalHeight`, …). Single-select.

## Configuration

Set the `kontainerHost` option on the field type (host only, no protocol):

```json
{
  "options": [
    { "name": "kontainerHost", "value": "company.kontainer.com" }
  ]
}
```

See `field-plugin.config.json`. In the Sandbox the option is applied
automatically; `npm run deploy` applies it in production.

## Kontainer backend requirements

The plugin relies on two things in the Kontainer app:

1. **Dedicated callback** — `CMSPluginType.STORYBLOK` enum value +
   `cmsStoryblokCallback` branch in `frontend/utils/cmsMode.ts`.
2. **CSP `frame-ancestors`** — Kontainer's `ContentSecurityPolicy` middleware
   gates iframe embedding per client. Both the **Storyblok field-plugin serving
   origin** and **`https://app.storyblok.com`** must be allowlisted in the
   client's `headerPolicies` (the browser checks the entire ancestor chain, and
   Kontainer is framed two levels deep: Storyblok editor → field-plugin iframe →
   Kontainer iframe). Without this, the browser blocks the iframe.

## Develop

```sh
npm run dev
```

Open the [Sandbox](https://plugin-sandbox.storyblok.com/field-plugin/), set the
`kontainerHost` option, and exercise the picker.

## Deploy

Issue a [personal access token](https://app.storyblok.com/#/me/account?tab=token),
copy `.env.local.example` to `.env.local`, set `STORYBLOK_PERSONAL_ACCESS_TOKEN`,
then:

```sh
npm run deploy
```
