import { describe, expect, it } from 'vitest'
import {
  approxBytesFromDataUrl,
  asStoryblokAsset,
  externalAssetFromFile,
  focusFromFile,
  formatBytes,
  importedAssetFromFile,
  isImageLike,
  isKontainerMessage,
  kontainerPickerUrl,
  managementApiHost,
  normalizeHost,
  previewFromAsset,
  resolveMaxImportBytes,
  resolveMode,
  resolveRegion,
  type KontainerFile,
} from './kontainer'

const file = (overrides: Partial<KontainerFile> = {}): KontainerFile => ({
  url: 'https://company.kontainer.com/file/123/hero.jpg',
  thumbnailUrl: 'https://company.kontainer.com/thumb/123.jpg',
  fileName: 'hero.jpg',
  fileId: 123,
  folderId: 7,
  alt: 'A hero image',
  description: 'Campaign hero',
  type: 'image',
  extension: 'jpg',
  originalWidth: 1600,
  originalHeight: 900,
  ...overrides,
})

const at = new Date('2026-09-21T10:00:00.000Z')

describe('normalizeHost', () => {
  it.each([
    ['company.kontainer.com', 'company.kontainer.com'],
    ['https://company.kontainer.com', 'company.kontainer.com'],
    ['http://company.kontainer.com/', 'company.kontainer.com'],
    ['  company.kontainer.com//  ', 'company.kontainer.com'],
    [undefined, ''],
  ])('normalises %s', (input, expected) => {
    expect(normalizeHost(input)).toBe(expected)
  })
})

describe('kontainerPickerUrl', () => {
  it('builds the CMS-mode URL', () => {
    expect(kontainerPickerUrl('company.kontainer.com')).toBe(
      'https://company.kontainer.com/login-cms-redirect?cmsMode=1&cmsPluginType=storyblok&cmsPluginId=storyblok',
    )
  })

  it('is empty without a host, so no iframe is rendered', () => {
    expect(kontainerPickerUrl('')).toBe('')
  })
})

describe('isKontainerMessage', () => {
  it('accepts a well-formed insert message', () => {
    expect(
      isKontainerMessage({
        source: 'kontainer',
        action: 'kontainer-insert',
        data: file(),
      }),
    ).toBe(true)
  })

  it.each([
    [
      'a different source',
      { source: 'other', action: 'kontainer-insert', data: {} },
    ],
    ['a different action', { source: 'kontainer', action: 'ping', data: {} }],
    ['no data', { source: 'kontainer', action: 'kontainer-insert' }],
    ['a string', 'kontainer-insert'],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isKontainerMessage(value)).toBe(false)
  })
})

describe('resolveMode', () => {
  it('defaults to external so no credential is required', () => {
    expect(resolveMode(undefined)).toBe('external')
    expect(resolveMode('')).toBe('external')
    expect(resolveMode('nonsense')).toBe('external')
  })

  it('opts into import only on an explicit value', () => {
    expect(resolveMode('import')).toBe('import')
    expect(resolveMode(' IMPORT ')).toBe('import')
  })
})

describe('resolveRegion', () => {
  it('prefers the configured option over detection', () => {
    expect(resolveRegion('us', 'https://app.storyblok.com')).toBe('us')
  })

  it.each([
    ['https://app-us.storyblok.com', 'us'],
    ['https://app-ca.storyblok.com', 'ca'],
    ['https://app-ap.storyblok.com', 'ap'],
    ['https://app.storyblokchina.cn', 'cn'],
    ['https://app.storyblok.com', 'eu'],
  ])('detects %s as %s when unconfigured', (origin, expected) => {
    expect(resolveRegion('', origin)).toBe(expected)
  })

  it('falls back to eu when the origin is unavailable', () => {
    // Firefox/Safari inside the sandboxed plugin iframe: no referrer, no
    // ancestorOrigins. The option is the reliable path.
    expect(resolveRegion(undefined, '')).toBe('eu')
  })

  it('ignores an invalid region option', () => {
    expect(resolveRegion('mars', 'https://app-ca.storyblok.com')).toBe('ca')
  })
})

describe('managementApiHost', () => {
  it.each([
    ['eu', 'mapi.storyblok.com'],
    ['us', 'api-us.storyblok.com'],
    ['ca', 'api-ca.storyblok.com'],
    ['ap', 'api-ap.storyblok.com'],
    ['cn', 'app.storyblokchina.cn'],
  ] as const)('maps %s', (region, expected) => {
    expect(managementApiHost(region)).toBe(expected)
  })
})

describe('approxBytesFromDataUrl', () => {
  it('approximates the decoded size', () => {
    // "hello" -> aGVsbG8= (8 chars, 1 pad) -> 5 bytes
    expect(approxBytesFromDataUrl('data:text/plain;base64,aGVsbG8=')).toBe(5)
  })

  it('handles a bare base64 string and an empty payload', () => {
    expect(approxBytesFromDataUrl('aGVsbG8=')).toBe(5)
    expect(approxBytesFromDataUrl('data:text/plain;base64,')).toBe(0)
  })
})

describe('resolveMaxImportBytes', () => {
  it('defaults to 50 MB', () => {
    expect(resolveMaxImportBytes(undefined)).toBe(50 * 1024 * 1024)
    expect(resolveMaxImportBytes('')).toBe(50 * 1024 * 1024)
    expect(resolveMaxImportBytes('-5')).toBe(50 * 1024 * 1024)
  })

  it('honours a configured limit', () => {
    expect(resolveMaxImportBytes('10')).toBe(10 * 1024 * 1024)
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('isImageLike', () => {
  it('recognises images by extension and by type', () => {
    expect(isImageLike('jpg', undefined)).toBe(true)
    expect(isImageLike('.PNG', undefined)).toBe(true)
    expect(isImageLike(undefined, 'image/webp')).toBe(true)
  })

  it('does not treat documents or video as images', () => {
    expect(isImageLike('pdf', 'document')).toBe(false)
    expect(isImageLike('mp4', 'video')).toBe(false)
    expect(isImageLike(undefined, undefined)).toBe(false)
  })
})

describe('focusFromFile', () => {
  it('expresses the focal point as a 1px rect in Storyblok notation', () => {
    expect(focusFromFile(file({ focalPointX: 400, focalPointY: 300 }))).toBe(
      '400x300:401x301',
    )
  })

  it('is empty when Kontainer set no focal point', () => {
    expect(focusFromFile(file())).toBe('')
  })

  it('accepts a focal point at the origin', () => {
    expect(focusFromFile(file({ focalPointX: 0, focalPointY: 0 }))).toBe(
      '0x0:1x1',
    )
  })

  it('scales into the download template dimensions', () => {
    // The URL points at the 800x450 rendition, but the focal point is stored
    // against the 1600x900 original.
    expect(
      focusFromFile(
        file({
          focalPointX: 400,
          focalPointY: 300,
          customMaskWidth: 800,
          customMaskHeight: 450,
        }),
      ),
    ).toBe('200x150:201x151')
  })

  it('yields no focus rather than a wrong one when mask dimensions are unusable', () => {
    expect(
      focusFromFile(
        file({
          focalPointX: 400,
          focalPointY: 300,
          customMaskWidth: null,
          customMaskHeight: null,
        }),
      ),
    ).toBe('')
  })

  it('clamps a point that falls outside the frame', () => {
    expect(focusFromFile(file({ focalPointX: 5000, focalPointY: 5000 }))).toBe(
      '1599x899:1600x900',
    )
  })

  it('is empty when the source dimensions are missing', () => {
    expect(
      focusFromFile(
        file({
          focalPointX: 400,
          focalPointY: 300,
          originalWidth: null,
          originalHeight: null,
        }),
      ),
    ).toBe('')
  })
})

describe('externalAssetFromFile', () => {
  it('links the Kontainer URL without copying bytes', () => {
    const asset = externalAssetFromFile(file(), 'company.kontainer.com', at)

    expect(asset).toMatchObject({
      id: null,
      fieldtype: 'asset',
      filename: 'https://company.kontainer.com/file/123/hero.jpg',
      name: 'hero.jpg',
      alt: 'A hero image',
      title: 'Campaign hero',
      source: 'kontainer',
      is_external_url: true,
    })
  })

  it('keeps the Kontainer reference so re-sync and dedup stay possible', () => {
    const asset = externalAssetFromFile(file(), 'company.kontainer.com', at)

    expect(asset.meta_data).toEqual({
      kontainer_host: 'company.kontainer.com',
      kontainer_url: 'https://company.kontainer.com/file/123/hero.jpg',
      kontainer_picked_at: '2026-09-21T10:00:00.000Z',
      kontainer_file_id: 123,
      kontainer_folder_id: 7,
      kontainer_thumbnail_url: 'https://company.kontainer.com/thumb/123.jpg',
      kontainer_extension: 'jpg',
      kontainer_type: 'image',
    })
  })

  it('carries the focal point onto the asset and into meta_data', () => {
    const asset = externalAssetFromFile(
      file({ focalPointX: 400, focalPointY: 300 }),
      'company.kontainer.com',
      at,
    )

    expect(asset.focus).toBe('400x300:401x301')
    expect(asset.meta_data).toMatchObject({
      kontainer_focal_point_x: 400,
      kontainer_focal_point_y: 300,
    })
  })

  it('leaves focus empty when no focal point was set', () => {
    expect(
      externalAssetFromFile(file(), 'company.kontainer.com', at).focus,
    ).toBe('')
  })

  it('never carries the base64 payload into the stored value', () => {
    const asset = externalAssetFromFile(
      file({ dataUrl: 'data:image/jpeg;base64,AAAA' }),
      'company.kontainer.com',
      at,
    )

    expect(JSON.stringify(asset)).not.toContain('base64')
  })

  it('falls back to urlBaseName, then a generic name', () => {
    expect(
      externalAssetFromFile(
        file({ fileName: undefined, urlBaseName: 'report' }),
        'company.kontainer.com',
      ).name,
    ).toBe('report')
    expect(
      externalAssetFromFile(
        file({ fileName: undefined, urlBaseName: undefined }),
        'company.kontainer.com',
      ).name,
    ).toBe('asset')
  })

  it('derives the extension from the filename when Kontainer omits it', () => {
    const asset = externalAssetFromFile(
      file({ extension: undefined, fileName: 'handbook.PDF' }),
      'company.kontainer.com',
      at,
    )

    expect(asset.meta_data.kontainer_extension).toBe('pdf')
  })
})

describe('importedAssetFromFile', () => {
  it('points at the uploaded Storyblok asset but keeps the Kontainer id', () => {
    const asset = importedAssetFromFile(
      file(),
      'company.kontainer.com',
      { id: 999, filename: 'https://a.storyblok.com/f/1/hero.jpg' },
      at,
    )

    expect(asset).toMatchObject({
      id: 999,
      filename: 'https://a.storyblok.com/f/1/hero.jpg',
      is_external_url: false,
    })
    expect(asset.meta_data.kontainer_file_id).toBe(123)
  })
})

describe('asStoryblokAsset', () => {
  it('accepts a saved asset', () => {
    const asset = externalAssetFromFile(file(), 'company.kontainer.com', at)
    expect(asStoryblokAsset(asset)).toBe(asset)
  })

  it.each([
    ['null', null],
    ['a string', 'https://example.com/a.jpg'],
    ['a foreign object', { fieldtype: 'text', filename: 'a.jpg' }],
    ['an asset with no filename', { fieldtype: 'asset' }],
    ['an asset with an empty filename', { fieldtype: 'asset', filename: '' }],
  ])('rejects %s', (_label, value) => {
    expect(asStoryblokAsset(value)).toBeNull()
  })
})

describe('previewFromAsset', () => {
  it('prefers the Kontainer thumbnail, which also covers documents', () => {
    const asset = externalAssetFromFile(
      file({ extension: 'pdf', type: 'document', fileName: 'handbook.pdf' }),
      'company.kontainer.com',
      at,
    )

    expect(previewFromAsset(asset)).toEqual({
      kind: 'image',
      src: 'https://company.kontainer.com/thumb/123.jpg',
      alt: 'A hero image',
      badge: 'PDF',
    })
  })

  it('falls back to the asset itself for images', () => {
    const asset = externalAssetFromFile(
      file({ thumbnailUrl: undefined }),
      'company.kontainer.com',
      at,
    )

    expect(previewFromAsset(asset)).toEqual({
      kind: 'image',
      src: 'https://company.kontainer.com/file/123/hero.jpg',
      alt: 'A hero image',
      badge: 'JPG',
    })
  })

  it('renders a badge instead of a broken image for non-images', () => {
    const asset = externalAssetFromFile(
      file({
        thumbnailUrl: undefined,
        extension: 'pdf',
        type: 'document',
        fileName: 'handbook.pdf',
      }),
      'company.kontainer.com',
      at,
    )

    expect(previewFromAsset(asset)).toEqual({ kind: 'file', badge: 'PDF' })
  })

  it('copes with a value that has no meta_data at all', () => {
    expect(
      previewFromAsset({
        id: null,
        fieldtype: 'asset',
        filename: 'https://company.kontainer.com/file/1/x.bin',
        name: 'x.bin',
        alt: '',
        title: '',
        copyright: '',
        focus: '',
        source: 'kontainer',
        is_external_url: true,
        meta_data: {},
      }),
    ).toEqual({ kind: 'file', badge: 'FILE' })
  })
})
