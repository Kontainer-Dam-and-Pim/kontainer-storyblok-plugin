# Changelog

## 0.1.0 — 2026-09-24

First release prepared for Partner Portal distribution.

### Changed

- **External linking is now the default.** A picked file is stored as a
  Storyblok asset with `is_external_url: true` pointing at Kontainer's CDN.
  No Storyblok credential is involved, nothing is copied, and the file keeps
  updating in place. Byte import is still available behind `mode: import`.
- The saved value now carries the Kontainer reference (`kontainer_file_id`,
  `kontainer_url`, host, thumbnail, extension, type) in the asset's
  `meta_data`, which is what makes de-duplication and re-sync possible later.
- A focal point set in Kontainer is carried onto the Storyblok asset. `focus`
  gets Storyblok's `X1xY1:X2xY2` notation and `meta_data` keeps the raw pixel
  coordinates, since the image service does not transform an external URL.
  Coordinates are scaled when a download template serves a resized rendition.
- The Management API region is now an explicit `storyblokRegion` option.
  Origin sniffing remains only as a fallback — it does not work in Firefox or
  Safari, where non-EU spaces previously failed with an opaque 401.

### Fixed

- The picker modal can be closed again: close button, `Escape`, and clicking
  the backdrop. The close button was lost when byte import was added, leaving
  editors stuck in a full-screen iframe.
- Non-image assets no longer render as a broken `<img>`. Kontainer's thumbnail
  is used when present, otherwise a file card with an extension badge.
- Picker messages are rejected outright when no host is configured, instead of
  being accepted from any origin.
- Malformed stored values are rejected by `validateContent` rather than
  rendered as a broken asset.
- Byte import now enforces a size limit (`maxImportMb`, default 50) before
  allocating a Blob, and reports progress through each upload step.

### Added

- MIT `LICENSE`, package metadata, this changelog.
- Unit tests over the value mapping, option parsing, region resolution and
  preview logic.
