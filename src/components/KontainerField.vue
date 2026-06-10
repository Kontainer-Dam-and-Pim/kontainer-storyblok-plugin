<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useFieldPlugin } from '@storyblok/field-plugin/vue3'

// Subset of the Kontainer FileInfo payload we care about. Kontainer posts the
// full object; we persist it verbatim as the field value.
type KontainerAsset = {
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
  originalWidth?: number | null
  originalHeight?: number | null
  [key: string]: unknown
}

type KontainerMessage = {
  source: 'kontainer'
  action: 'kontainer-insert'
  data: KontainerAsset
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
      content && typeof content === 'object' ? (content as KontainerAsset) : null,
  }),
})

// Normalise the configured host: strip protocol and trailing slashes.
const host = computed(() => {
  if (plugin.type !== 'loaded') return ''
  const options = plugin.data.options as Record<string, string> | undefined
  return (options?.kontainerHost ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
})

const pickerUrl = computed(() => {
  if (!host.value) return ''
  const params = new URLSearchParams({
    cmsMode: '1',
    cmsPluginType: 'storyblok',
    cmsPluginId: 'storyblok',
  })
  return `https://${host.value}/login-cms-redirect?${params.toString()}`
})

const asset = computed<KontainerAsset | null>(() =>
  plugin.type === 'loaded' ? (plugin.data.content as KontainerAsset | null) : null,
)

const isModalOpen = computed(
  () => plugin.type === 'loaded' && plugin.data.isModalOpen,
)

const openPicker = () => {
  if (plugin.type === 'loaded') plugin.actions.setModalOpen(true)
}

const closePicker = () => {
  if (plugin.type === 'loaded') plugin.actions.setModalOpen(false)
}

const removeAsset = () => {
  if (plugin.type === 'loaded') plugin.actions.setContent(null)
}

const onMessage = (event: MessageEvent) => {
  if (plugin.type !== 'loaded') return
  // Only trust messages from the configured Kontainer origin.
  if (host.value && event.origin !== `https://${host.value}`) return
  if (!isKontainerMessage(event.data)) return
  plugin.actions.setContent(event.data.data)
  plugin.actions.setModalOpen(false)
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
        :src="asset.thumbnailUrl || asset.url"
        :alt="asset.alt || asset.fileName || 'Selected Kontainer asset'"
      >
      <p
        v-if="asset.fileName"
        class="kontainer-filename"
        :title="asset.fileName"
      >
        {{ asset.fileName }}
      </p>
      <button
        class="kontainer-btn"
        type="button"
        @click="openPicker"
      >
        Replace asset
      </button>
      <button
        class="kontainer-btn kontainer-btn--ghost"
        type="button"
        @click="removeAsset"
      >
        Remove asset
      </button>
    </template>

    <template v-else>
      <button
        class="kontainer-btn"
        type="button"
        :disabled="!host"
        @click="openPicker"
      >
        Select from Kontainer
      </button>
      <p
        v-if="!host"
        class="kontainer-hint"
      >
        Set the <code>kontainerHost</code> plugin option
        (e.g. <code>company.kontainer.com</code>) to enable the picker.
      </p>
    </template>

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
        <button
          class="kontainer-close"
          type="button"
          aria-label="Close picker"
          @click="closePicker"
        >
          ✕
        </button>
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

.kontainer-btn:hover {
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

.kontainer-btn--ghost:hover {
  background: #f1f2f6;
}

.kontainer-hint {
  margin: 0;
  font-size: 0.75rem;
  color: #6b7280;
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

.kontainer-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 1;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  background-color: #fff;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(16, 21, 37, 0.18);
}

.kontainer-close:hover {
  background-color: #f1f2f6;
}
</style>
