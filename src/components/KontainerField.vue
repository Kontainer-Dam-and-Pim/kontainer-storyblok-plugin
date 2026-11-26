<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useFieldPlugin } from '@storyblok/field-plugin/vue3'
import {
  approxBytesFromDataUrl,
  asStoryblokAsset,
  emptyAsset,
  externalAssetFromFile,
  fileNameOf,
  formatBytes,
  importedAssetFromFile,
  isKontainerMessage,
  kontainerPickerUrl,
  managementApiHost,
  normalizeHost,
  previewFromAsset,
  resolveMaxImportBytes,
  resolveMode,
  resolveRegion,
  storedAsset,
  type KontainerFile,
  type StoryblokAsset,
} from '../lib/kontainer'

const plugin = useFieldPlugin({
  enablePortalModal: true,
  validateContent: (content: unknown) => ({
    content: storedAsset(content),
  }),
})

const status = ref<'idle' | 'importing' | 'error'>('idle')
const progress = ref('')
const errorMessage = ref('')
const previewFailed = ref(false)

const options = computed(
  () =>
    (plugin.type === 'loaded'
      ? (plugin.data.options as Record<string, string>)
      : {}) ?? {},
)

const host = computed(() => normalizeHost(options.value.kontainerHost))
const mode = computed(() => resolveMode(options.value.mode))
const managementToken = computed(() =>
  (options.value.storyblokManagementToken ?? '').trim(),
)
const maxImportBytes = computed(() =>
  resolveMaxImportBytes(options.value.maxImportMb),
)

const pickerUrl = computed(() => kontainerPickerUrl(host.value))

const asset = computed<StoryblokAsset | null>(() =>
  plugin.type === 'loaded' ? asStoryblokAsset(plugin.data.content) : null,
)

const preview = computed(() =>
  asset.value ? previewFromAsset(asset.value) : null,
)

const isModalOpen = computed(
  () => plugin.type === 'loaded' && plugin.data.isModalOpen,
)

// External mode needs nothing but a host; only the import path needs a token.
const isConfigured = computed(
  () => !!host.value && (mode.value === 'external' || !!managementToken.value),
)

const isBusy = computed(() => status.value === 'importing')

const openPicker = () => {
  if (plugin.type !== 'loaded') return
  previewFailed.value = false
  errorMessage.value = ''
  status.value = 'idle'
  plugin.actions.setModalOpen(true)
}

const closePicker = () => {
  if (plugin.type === 'loaded') plugin.actions.setModalOpen(false)
}

const removeAsset = () => {
  if (plugin.type !== 'loaded') return
  previewFailed.value = false
  plugin.actions.setContent(emptyAsset())
}

const fail = (message: string) => {
  status.value = 'error'
  progress.value = ''
  errorMessage.value = message
  closePicker()
}

/** The editor origin, used only as a fallback for region detection. */
const appOrigin = (): string => {
  try {
    const ancestors = window.location.ancestorOrigins
    return document.referrer || (ancestors && ancestors[0]) || ''
  } catch {
    return ''
  }
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> =>
  (await fetch(dataUrl)).blob()

/**
 * Upload the file bytes into the space's asset library via the Management API
 * (signed upload -> S3 -> finish), producing a self-hosted Storyblok asset.
 *
 * Only reachable in `import` mode. The token is a plugin option, which means it
 * is delivered to every editor's browser — see the security note in the README
 * before enabling this.
 */
const uploadToStoryblok = async (
  file: KontainerFile,
): Promise<{ id: number; filename: string }> => {
  if (plugin.type !== 'loaded') throw new Error('Plugin not loaded.')
  const token = managementToken.value
  const spaceId = plugin.data.spaceId
  if (!token) throw new Error('Storyblok management token is not configured.')
  if (!spaceId) throw new Error('Could not determine the Storyblok space id.')
  if (!file.dataUrl) throw new Error('Kontainer did not return the file bytes.')

  const bytes = approxBytesFromDataUrl(file.dataUrl)
  if (bytes > maxImportBytes.value) {
    throw new Error(
      `That file is ${formatBytes(bytes)}, over the ${formatBytes(
        maxImportBytes.value,
      )} import limit. Switch this field to external mode to link it instead.`,
    )
  }

  const region = resolveRegion(options.value.storyblokRegion, appOrigin())
  const base = `https://${managementApiHost(region)}/v1/spaces/${spaceId}/assets`
  const filename = fileNameOf(file)

  // 1. Request a signed S3 upload.
  progress.value = 'Preparing upload…'
  const signBody: Record<string, unknown> = { filename }
  if (file.originalWidth && file.originalHeight) {
    signBody.size = `${file.originalWidth}x${file.originalHeight}`
  }
  const signRes = await fetch(base, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(signBody),
  })
  if (!signRes.ok) {
    throw new Error(
      signRes.status === 401
        ? 'Storyblok rejected the management token (401). Check the token and the region option.'
        : `Signed-upload request failed (${signRes.status}).`,
    )
  }
  const signed = await signRes.json()

  // 2. Upload the bytes to S3 (signed fields first, file last).
  progress.value = `Uploading ${formatBytes(bytes)}…`
  const blob = await dataUrlToBlob(file.dataUrl)
  const form = new FormData()
  Object.entries(signed.fields ?? {}).forEach(([key, value]) =>
    form.append(key, String(value)),
  )
  form.append('file', blob, filename)
  const s3Res = await fetch(signed.post_url, { method: 'POST', body: form })
  if (!s3Res.ok) throw new Error(`Upload failed (${s3Res.status}).`)

  // 3. Finalize. The finish response carries the region-correct public URL.
  progress.value = 'Finishing…'
  const finishRes = await fetch(`${base}/${signed.id}/finish_upload`, {
    method: 'GET',
    headers: { Authorization: token },
  })
  if (!finishRes.ok)
    throw new Error(`Finish upload failed (${finishRes.status}).`)
  const finished = await finishRes.json().catch(() => ({}))

  const publicUrl =
    finished.pretty_url ||
    finished.filename ||
    signed.public_url ||
    signed.pretty_url ||
    (signed.fields?.key
      ? `https://a.storyblok.com/${signed.fields.key}`
      : file.url)

  return { id: signed.id, filename: publicUrl }
}

const onMessage = async (event: MessageEvent) => {
  if (plugin.type !== 'loaded') return
  // Never accept a picker message while unconfigured — without a host there is
  // no origin to check against.
  if (!host.value) return
  if (event.origin !== `https://${host.value}`) return
  if (!isKontainerMessage(event.data)) return

  const file = event.data.data
  previewFailed.value = false
  errorMessage.value = ''

  // External mode: reference the file on Kontainer's CDN. No credential, no
  // byte transfer, and the file keeps updating in place.
  if (mode.value === 'external') {
    if (!file.url) {
      fail('Kontainer did not return a file URL.')
      return
    }
    await plugin.actions.setContent(externalAssetFromFile(file, host.value))
    status.value = 'idle'
    closePicker()
    return
  }

  status.value = 'importing'
  try {
    const uploaded = await uploadToStoryblok(file)
    await plugin.actions.setContent(
      importedAssetFromFile(file, host.value, uploaded),
    )
    status.value = 'idle'
    progress.value = ''
    closePicker()
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Import failed.')
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
})
</script>

<template>
  <div
    v-if="plugin.type === 'loaded'"
    class="kontainer-field"
  >
    <template v-if="asset && preview">
      <img
        v-if="preview.kind === 'image' && !previewFailed"
        class="kontainer-preview"
        :src="preview.src"
        :alt="preview.alt"
        @error="previewFailed = true"
      />
      <div
        v-else
        class="kontainer-file"
      >
        <span class="kontainer-file__badge">
          {{ preview.badge }}
        </span>
      </div>

      <p
        v-if="asset.name"
        class="kontainer-filename"
        :title="asset.name"
      >
        {{ asset.name }}
      </p>
      <p
        v-if="asset.is_external_url"
        class="kontainer-hint"
      >
        Linked from Kontainer
      </p>

      <button
        class="kontainer-btn"
        type="button"
        :disabled="!isConfigured || isBusy"
        @click="openPicker"
      >
        Replace asset
      </button>
      <button
        class="kontainer-btn kontainer-btn--ghost"
        type="button"
        :disabled="isBusy"
        @click="removeAsset"
      >
        Remove asset
      </button>
    </template>

    <template v-else>
      <button
        class="kontainer-btn"
        type="button"
        :disabled="!isConfigured || isBusy"
        @click="openPicker"
      >
        {{ isBusy ? 'Importing…' : 'Select from Kontainer' }}
      </button>
    </template>

    <p
      v-if="isBusy && progress"
      class="kontainer-hint"
      role="status"
    >
      {{ progress }}
    </p>
    <p
      v-if="!host"
      class="kontainer-hint"
    >
      Set the <code>kontainerHost</code> plugin option (e.g.
      <code>company.kontainer.com</code>).
    </p>
    <p
      v-else-if="mode === 'import' && !managementToken"
      class="kontainer-hint"
    >
      This field is in <code>import</code> mode, which needs the
      <code>storyblokManagementToken</code> option. Leave <code>mode</code>
      unset to link files from Kontainer instead.
    </p>
    <p
      v-if="status === 'error'"
      class="kontainer-error"
      role="alert"
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

.kontainer-file {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 7rem;
  border: 1px solid #e1e2e8;
  border-radius: 0.3125rem;
  background: #f7f8fa;
}

.kontainer-file__badge {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #4b5563;
  padding: 0.25rem 0.625rem;
  border-radius: 0.25rem;
  background: #e1e2e8;
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
}

.kontainer-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background-color: #fff;
}
</style>
