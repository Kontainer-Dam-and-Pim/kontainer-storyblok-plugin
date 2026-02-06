<script setup lang="ts">
import './example.css'
import ModalToggle from './ModalToggle.vue'
import Counter from './Counter.vue'
import AssetSelector from './AssetSelector.vue'
import { useFieldPlugin } from '@storyblok/field-plugin/vue3'

const plugin = useFieldPlugin({
  enablePortalModal: true,
  validateContent: (content: unknown) => ({
    content: typeof content === 'number' ? content : 0,
  }),
})
</script>

<template>
  <div v-if="plugin.type === 'loaded'">
    <teleport
      v-if="plugin.data.isModalOpen"
      to="body"
    >
      <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Kontainer selector"
      >
          <iframe
            class="modal-iframe"
            src="https://kontainer.test/login-cms-redirect?cmsMode=1"
            title="Kontainer media"
          ></iframe>
        </div>
    </teleport>
    <div class="container">
      <Counter
        :count="plugin.data.content"
        @on-increase="plugin.actions.setContent(plugin.data.content + 1)"
      />
      <hr />
      <ModalToggle
        :is-modal-open="plugin.data.isModalOpen"
        :set-modal-open="plugin.actions.setModalOpen"
      />
      <hr />
      <AssetSelector :select-asset="plugin.actions.selectAsset" />
    </div>
  </div>
</template>
