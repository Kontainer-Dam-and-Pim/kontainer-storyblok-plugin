<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useFieldPlugin } from '@storyblok/field-plugin/vue3'

// What Kontainer posts back: the FileInfo plus a base64 data URL of the bytes.
type KontainerFile = {
  url: string
  dataUrl?: string | null
  fileName?: string
  urlBaseName?: string
  alt?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  [key: string]: unknown
}

// A real Storyblok asset (what we store after uploading to the asset library).
type StoryblokAsset = {
  id: number
  fieldtype: 'asset'
  filename: string
  name: string
  alt: string
  title: string
  copyright: string
  focus: string
  is_external_url: false
}

type KontainerMessage = {
  source: 'kontainer'
  action: 'kontainer-insert'
  data: KontainerFile
}

const isKontainerMessage = (value: unknown): value is KontainerMessage => {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  return (
    msg.source === 'kontainer' &&
    msg.action === 'kontainer-insert' &&
    !!msg.data &&
    typeof msg.data === 'object'
  )
}

const plugin = useFieldPlugin({
  enablePortalModal: true,
  validateContent: (content: unknown) => ({
    content:
      content && typeof content === 'object' ? (content as StoryblokAsset) : null,
  }),
})

const status = ref<'idle' | 'uploading' | 'error'>('idle')
const errorMessage = ref('')

const options = computed(
  () =>
    (plugin.type === 'loaded'
      ? (plugin.data.options as Record<string, string>)
      : {}) ?? {},
)

// Normalise the configured Kontainer host: strip protocol and trailing slashes.
const host = computed(() =>
  (options.value.kontainerHost ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, ''),
)

const managementToken = computed(() =>
  (options.value.storyblokManagementToken ?? '').trim(),
)

const pickerUrl = computed(() => {
  if (!host.value) return ''
  const params = new URLSearchParams({
    cmsMode: '1',
    cmsPluginType: 'storyblok',
    cmsPluginId: 'storyblok',
  })
  return `https://${host.value}/login-cms-redirect?${params.toString()}`
})

const asset = computed<StoryblokAsset | null>(() =>
  plugin.type === 'loaded' ? (plugin.data.content as StoryblokAsset | null) : null,
)

const isModalOpen = computed(
  () => plugin.type === 'loaded' && plugin.data.isModalOpen,
)

const isConfigured = computed(() => !!host.value && !!managementToken.value)

const openPicker = () => {
  if (plugin.type === 'loaded') plugin.actions.setModalOpen(true)
}
const removeAsset = () => {
  if (plugin.type === 'loaded') plugin.actions.setContent(null)
}

// Storyblok regions are served from region-specific Management API hosts.
// Derive the host from the editor (parent frame) origin, default to EU.
const managementHost = (): string => {
  let appOrigin = ''
  try {
    const ancestors = window.location.ancestorOrigins
    appOrigin = document.referrer || (ancestors && ancestors[0]) || ''
  } catch {
    appOrigin = ''
  }
  const map: Record<string, string> = {
    'app-us.storyblok.com': 'api-us.storyblok.com',
    'app-ca.storyblok.com': 'api-ca.storyblok.com',
    'app-ap.storyblok.com': 'api-ap.storyblok.com',
    storyblokchina: 'app.storyblokchina.cn',
    'app.storyblok.com': 'mapi.storyblok.com',
  }
  for (const [appHost, mapiHost] of Object.entries(map)) {
    if (appOrigin.includes(appHost)) return mapiHost
  }
  return 'mapi.storyblok.com'
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> =>
  (await fetch(dataUrl)).blob()

/**
 * Upload the file bytes into the Storyblok space's asset library via the
 * Management API (signed upload -> S3 -> finish). Produces a real, self-hosted
 * Storyblok asset (a.storyblok.com), not an external link.
 */
const uploadToStoryblok = async (file: KontainerFile): Promise<StoryblokAsset> => {
  if (plugin.type !== 'loaded') throw new Error('Plugin not loaded.')
  const token = managementToken.value
  const spaceId = plugin.data.spaceId
  if (!token) throw new Error('Storyblok management token is not configured.')
  if (!spaceId) throw new Error('Could not determine the Storyblok space id.')
  if (!file.dataUrl) throw new Error('Kontainer did not return the file bytes.')

  const base = `https://${managementHost()}/v1/spaces/${spaceId}/assets`
  const filename = file.fileName || file.urlBaseName || 'asset'

  // 1. Request a signed S3 upload.
  const signBody: Record<string, unknown> = { filename }
  if (file.originalWidth && file.originalHeight) {
    signBody.size = `${file.originalWidth}x${file.originalHeight}`
  }
  const signRes = await fetch(base, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(signBody),
  })
  if (!signRes.ok) throw new Error(`Signed-upload request failed (${signRes.status}).`)
  const signed = await signRes.json()

  // 2. Upload the bytes to S3 (signed fields first, file last).
  const blob = await dataUrlToBlob(file.dataUrl)
  const form = new FormData()
  Object.entries(signed.fields ?? {}).forEach(([key, value]) =>
    form.append(key, String(value)),
  )
  form.append('file', blob, filename)
  const s3Res = await fetch(signed.post_url, { method: 'POST', body: form })
  if (!s3Res.ok) throw new Error(`S3 upload failed (${s3Res.status}).`)

  // 3. Finalize. The finish response returns the completed asset object,
  // whose url is region-correct — prefer it over guessing the CDN host.
  const finishRes = await fetch(`${base}/${signed.id}/finish_upload`, {
    method: 'GET',
    headers: { Authorization: token },
  })
  if (!finishRes.ok) throw new Error(`Finish upload failed (${finishRes.status}).`)
  const finished = await finishRes.json().catch(() => ({}))

  const publicUrl =
    finished.pretty_url ||
    finished.filename ||
    signed.public_url ||
    signed.pretty_url ||
    (signed.fields?.key ? `https://a.storyblok.com/${signed.fields.key}` : file.url)

  return {
    id: signed.id,
    fieldtype: 'asset',
    filename: publicUrl,
    name: filename,
    alt: file.alt || '',
    title: '',
    copyright: '',
    focus: '',
    is_external_url: false,
  }
}

const onMessage = async (event: MessageEvent) => {
  if (plugin.type !== 'loaded') return
  // Only trust messages from the configured Kontainer origin.
  if (host.value && event.origin !== `https://${host.value}`) return
  if (!isKontainerMessage(event.data)) return

  status.value = 'uploading'
  errorMessage.value = ''
  try {
    const uploaded = await uploadToStoryblok(event.data.data)
    await plugin.actions.setContent(uploaded)
    status.value = 'idle'
    plugin.actions.setModalOpen(false)
  } catch (error) {
    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : 'Upload failed.'
    plugin.actions.setModalOpen(false)
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div
    v-if="plugin.type === 'loaded'"
    class="kontainer-field"
  >
    <template v-if="asset">
      <img
        class="kontainer-preview"
        :src="asset.filename"
        :alt="asset.alt || asset.name"
      >
      <p
        v-if="asset.name"
        class="kontainer-filename"
        :title="asset.name"
      >
        {{ asset.name }}
      </p>
      <button
        class="kontainer-btn"
        type="button"
        :disabled="!isConfigured || status === 'uploading'"
        @click="openPicker"
      >
        Replace asset
      </button>
      <button
        class="kontainer-btn kontainer-btn--ghost"
        type="button"
        :disabled="status === 'uploading'"
        @click="removeAsset"
      >
        Remove asset
      </button>
    </template>

    <template v-else>
      <button
        class="kontainer-btn"
        type="button"
        :disabled="!isConfigured || status === 'uploading'"
        @click="openPicker"
      >
        {{ status === 'uploading' ? 'Importing…' : 'Select from Kontainer' }}
      </button>
    </template>

    <p
      v-if="!host"
      class="kontainer-hint"
    >
      Set the <code>kontainerHost</code> plugin option
      (e.g. <code>company.kontainer.com</code>).
    </p>
    <p
      v-else-if="!managementToken"
      class="kontainer-hint"
    >
      Set the <code>storyblokManagementToken</code> plugin option so files can be
      imported into this space's asset library.
    </p>
    <p
      v-if="status === 'error'"
      class="kontainer-error"
    >
      {{ errorMessage }}
    </p>

    <teleport
      v-if="isModalOpen"
      to="body"
    >
      <div
        class="kontainer-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Kontainer asset picker"
      >
        <iframe
          v-if="pickerUrl"
          class="kontainer-iframe"
          :src="pickerUrl"
          title="Kontainer media"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.kontainer-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 22rem;
}

.kontainer-preview {
  width: 100%;
  display: block;
  border-radius: 0.3125rem;
  border: 1px solid #e1e2e8;
}

.kontainer-filename {
  margin: 0;
  font-size: 0.8125rem;
  color: #4b5563;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kontainer-btn {
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.6875rem 1rem;
  width: 100%;
  background: #1b243f;
  color: #fff;
  border: 1px solid #1b243f;
  border-radius: 0.3125rem;
  cursor: pointer;
  transition: background-color 0.15s ease-in-out;
}

.kontainer-btn:hover:not(:disabled) {
  background: #2b3656;
}

.kontainer-btn:disabled {
  background: #c7cad6;
  border-color: #c7cad6;
  cursor: not-allowed;
}

.kontainer-btn--ghost {
  background: transparent;
  color: #1b243f;
  border-color: #c7cad6;
}

.kontainer-btn--ghost:hover:not(:disabled) {
  background: #f1f2f6;
}

.kontainer-hint {
  margin: 0;
  font-size: 0.75rem;
  color: #6b7280;
}

.kontainer-error {
  margin: 0;
  font-size: 0.75rem;
  color: #c0341d;
}

.kontainer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(16, 21, 37, 0.6);
  backdrop-filter: blur(2px);
}

.kontainer-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background-color: #fff;
}
</style>
