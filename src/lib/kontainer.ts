/**
 * Pure helpers shared by the field plugin.
 *
 * Everything in here is free of Vue and of the field-plugin SDK so it can be
 * unit tested directly — the SDK's test harness hardcodes an empty option list,
 * so option-dependent behaviour is not reachable through a mounted component.
 */

/**
 * The payload Kontainer's CMS mode posts back to the plugin.
 *
 * Kontainer sends its full FileInfo object; these are the fields we rely on.
 * `dataUrl` is only used in `import` mode — in `external` mode we drop it
 * without ever turning it into a Blob.
 */
export type KontainerFile = {
  url: string
  thumbnailUrl?: string
  urlBaseName?: string
  fileName?: string
  fileId?: number
  folderId?: number
  alt?: string | null
  description?: string | null
  type?: string
  extension?: string
  dataUrl?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  focalPointX?: number | null
  focalPointY?: number | null
  // Present only when a download template (CdnFileMask) applies, in which case
  // `url` points at an image of these dimensions rather than the original.
  customMaskWidth?: number | null
  customMaskHeight?: number | null
  [key: string]: unknown
}

/**
 * A Storyblok asset field value. In `external` mode `is_external_url` is true
 * and `filename` points at Kontainer's CDN; in `import` mode the bytes have
 * been uploaded and `filename` points at a.storyblok.com.
 */
export type StoryblokAsset = {
  id: number | null
  fieldtype: 'asset'
  filename: string
  name: string
  alt: string
  title: string
  copyright: string
  focus: string
  source: string
  is_external_url: boolean
  meta_data: Record<string, unknown>
}

export type KontainerMessage = {
  source: 'kontainer'
  action: 'kontainer-insert'
  data: KontainerFile
}

export type Mode = 'external' | 'import'

export type Region = 'eu' | 'us' | 'ca' | 'ap' | 'cn'

export type Preview =
  | { kind: 'image'; src: string; alt: string; badge: string }
  | { kind: 'file'; badge: string }

export const DEFAULT_MAX_IMPORT_MB = 50

const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'heif',
]

const MANAGEMENT_API_HOSTS: Record<Region, string> = {
  eu: 'mapi.storyblok.com',
  us: 'api-us.storyblok.com',
  ca: 'api-ca.storyblok.com',
  ap: 'api-ap.storyblok.com',
  cn: 'app.storyblokchina.cn',
}

export const isKontainerMessage = (
  value: unknown,
): value is KontainerMessage => {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  return (
    msg.source === 'kontainer' &&
    msg.action === 'kontainer-insert' &&
    !!msg.data &&
    typeof msg.data === 'object'
  )
}

/** Strip protocol and trailing slashes so the option is forgiving about format. */
export const normalizeHost = (raw: string | undefined): string =>
  (raw ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')

export const kontainerPickerUrl = (host: string): string => {
  if (!host) return ''
  const params = new URLSearchParams({
    cmsMode: '1',
    cmsPluginType: 'storyblok',
    cmsPluginId: 'storyblok',
  })
  return `https://${host}/login-cms-redirect?${params.toString()}`
}

/** `external` is the default: it needs no Storyblok credential. */
export const resolveMode = (raw: string | undefined): Mode =>
  (raw ?? '').trim().toLowerCase() === 'import' ? 'import' : 'external'

export const resolveMaxImportBytes = (raw: string | undefined): number => {
  const parsed = Number.parseFloat((raw ?? '').trim())
  const mb =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IMPORT_MB
  return Math.round(mb * 1024 * 1024)
}

/**
 * Work out which regional Management API to talk to.
 *
 * The configured option wins. Detection from the editor origin is only a
 * fallback: `document.referrer` is usually empty inside the sandboxed plugin
 * iframe and `ancestorOrigins` does not exist outside Chromium, so a non-EU
 * customer on Firefox would otherwise silently get the EU host and a 401.
 */
export const resolveRegion = (
  option: string | undefined,
  appOrigin: string | undefined,
): Region => {
  const configured = (option ?? '').trim().toLowerCase()
  if (configured in MANAGEMENT_API_HOSTS) return configured as Region

  const origin = appOrigin ?? ''
  if (origin.includes('storyblokchina')) return 'cn'
  if (origin.includes('app-us.')) return 'us'
  if (origin.includes('app-ca.')) return 'ca'
  if (origin.includes('app-ap.')) return 'ap'
  return 'eu'
}

export const managementApiHost = (region: Region): string =>
  MANAGEMENT_API_HOSTS[region]

/** Approximate the decoded size of a base64 data URL without decoding it. */
export const approxBytesFromDataUrl = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(',')
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
  if (base64.length === 0) return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`
  return `${mb.toFixed(1)} MB`
}

export const fileNameOf = (file: KontainerFile): string =>
  file.fileName || file.urlBaseName || 'asset'

const extensionOf = (file: KontainerFile): string => {
  if (file.extension) return file.extension.replace(/^\./, '').toLowerCase()
  const name = fileNameOf(file)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export const isImageLike = (
  extension: string | undefined,
  type: string | undefined,
): boolean => {
  if ((type ?? '').toLowerCase().startsWith('image')) return true
  const ext = (extension ?? '').replace(/^\./, '').toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext)
}

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

/**
 * Translate Kontainer's focal point into Storyblok's `focus` string.
 *
 * Both sides use pixel coordinates: Kontainer stores `FocalPoint` as int x/y,
 * and Storyblok's focal point filter takes `X1xY1:X2xY2` in the same notation
 * as its crop operation, so a focus point is expressed as a 1px rect.
 *
 * The coordinates must belong to the image the URL actually points at. When a
 * download template applies, that is a resized image (`customMaskWidth` /
 * `customMaskHeight`) while the stored focal point is still in the original's
 * coordinates, so it has to be scaled — the same thing FocalPointSpec::scaledBy
 * does server-side for downloads. A masked file whose dimensions are unusable
 * yields no focus rather than a confidently wrong one.
 */
export const focusFromFile = (file: KontainerFile): string => {
  const x = finiteNumber(file.focalPointX)
  const y = finiteNumber(file.focalPointY)
  if (x === null || y === null) return ''

  const sourceWidth = positiveNumber(file.originalWidth)
  const sourceHeight = positiveNumber(file.originalHeight)
  if (sourceWidth === null || sourceHeight === null) return ''

  const isMasked = 'customMaskWidth' in file || 'customMaskHeight' in file
  const targetWidth = isMasked
    ? positiveNumber(file.customMaskWidth)
    : sourceWidth
  const targetHeight = isMasked
    ? positiveNumber(file.customMaskHeight)
    : sourceHeight
  if (targetWidth === null || targetHeight === null) return ''

  const scaledX = Math.round(x * (targetWidth / sourceWidth))
  const scaledY = Math.round(y * (targetHeight / sourceHeight))

  // Leave room for the second corner, and absorb a focal point that sits
  // outside the frame (a rotated original is stored unrotated, so the point
  // can land beyond the rotated dimensions reported here).
  const pointX = clamp(scaledX, 0, targetWidth - 1)
  const pointY = clamp(scaledY, 0, targetHeight - 1)

  return `${pointX}x${pointY}:${pointX + 1}x${pointY + 1}`
}

/**
 * Provenance for the saved value. Keeping the Kontainer id on the asset is what
 * makes de-duplication and "the file changed in Kontainer" re-sync possible
 * later — backfilling it onto already-saved content would mean a Management API
 * migration across every installed space.
 */
export const kontainerMetaData = (
  file: KontainerFile,
  host: string,
  now: Date = new Date(),
): Record<string, unknown> => {
  const meta: Record<string, unknown> = {
    kontainer_host: host,
    kontainer_url: file.url,
    kontainer_picked_at: now.toISOString(),
  }
  if (file.fileId !== undefined) meta.kontainer_file_id = file.fileId
  if (file.folderId !== undefined) meta.kontainer_folder_id = file.folderId
  if (file.thumbnailUrl) meta.kontainer_thumbnail_url = file.thumbnailUrl
  const extension = extensionOf(file)
  if (extension) meta.kontainer_extension = extension
  if (file.type) meta.kontainer_type = file.type
  // Kept raw alongside the derived `focus`: these are usable directly with
  // Kontainer's own transformation parameters, which is the only thing that
  // applies to an externally linked file.
  const focalX = finiteNumber(file.focalPointX)
  const focalY = finiteNumber(file.focalPointY)
  if (focalX !== null && focalY !== null) {
    meta.kontainer_focal_point_x = focalX
    meta.kontainer_focal_point_y = focalY
  }
  return meta
}

const baseAsset = (
  file: KontainerFile,
  host: string,
  now?: Date,
): Omit<StoryblokAsset, 'id' | 'filename' | 'is_external_url'> => ({
  fieldtype: 'asset',
  name: fileNameOf(file),
  alt: file.alt || '',
  title: file.description || '',
  copyright: '',
  focus: focusFromFile(file),
  source: 'kontainer',
  meta_data: kontainerMetaData(file, host, now),
})

/** Reference the file in place on Kontainer's CDN. Needs no credential. */
export const externalAssetFromFile = (
  file: KontainerFile,
  host: string,
  now?: Date,
): StoryblokAsset => ({
  id: null,
  ...baseAsset(file, host, now),
  filename: file.url,
  is_external_url: true,
})

/** Reference a copy that has been uploaded into the space's asset library. */
export const importedAssetFromFile = (
  file: KontainerFile,
  host: string,
  uploaded: { id: number; filename: string },
  now?: Date,
): StoryblokAsset => ({
  id: uploaded.id,
  ...baseAsset(file, host, now),
  filename: uploaded.filename,
  is_external_url: false,
})

/** Reject malformed stored values rather than rendering a broken asset. */
export const asStoryblokAsset = (content: unknown): StoryblokAsset | null => {
  if (!content || typeof content !== 'object') return null
  const candidate = content as Record<string, unknown>
  if (candidate.fieldtype !== 'asset') return null
  if (typeof candidate.filename !== 'string' || candidate.filename === '') {
    return null
  }
  return content as StoryblokAsset
}

/**
 * Decide how to render the saved asset. Kontainer is a DAM, so most files are
 * not images — a PDF or a video rendered into an `<img>` is just a broken icon.
 *
 * Kontainer's own thumbnail is preferred when there is one, but it is often
 * absent: CmsController returns `thumbnailUrl: null` for any non-image behind
 * a download template, and only a stored large thumbnail otherwise. The badge
 * is therefore the normal rendering for documents, not an edge case.
 */
export const previewFromAsset = (asset: StoryblokAsset): Preview => {
  const meta = asset.meta_data ?? {}
  const thumbnail = meta.kontainer_thumbnail_url
  const extension =
    typeof meta.kontainer_extension === 'string'
      ? meta.kontainer_extension
      : undefined
  const type =
    typeof meta.kontainer_type === 'string' ? meta.kontainer_type : undefined
  const alt = asset.alt || asset.name
  // Carried on the image variant too: if the thumbnail 404s, the component
  // falls back to the badge, and "PDF" beats a generic "FILE".
  const badge = (extension || 'file').toUpperCase().slice(0, 5)

  if (typeof thumbnail === 'string' && thumbnail !== '') {
    return { kind: 'image', src: thumbnail, alt, badge }
  }
  if (isImageLike(extension, type)) {
    return { kind: 'image', src: asset.filename, alt, badge }
  }
  return { kind: 'file', badge }
}
