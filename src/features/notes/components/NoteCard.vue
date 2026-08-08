<script setup lang="ts">
import { Pin, PinOff, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import type { Note } from '@/db'
import { useNoteAge } from '../useNoteAge'

const { note } = defineProps<{ note: Note }>()

const emit = defineEmits<{
  togglePinned: []
  delete: []
}>()

const { t } = useI18n()

const age = useNoteAge(() => note.updatedAt)

// The domain returns data ({ unit, count }); only here does it become words.
// Plural-sensitive units pass the count as vue-i18n's plural argument.
const ageLabel = computed(() => {
  const current = age.value
  return current.unit === 'justNow'
    ? t('notes.age.justNow')
    : t(`notes.age.${current.unit}`, current.count)
})
</script>

<template>
  <article class="rounded-lg border bg-card p-4 shadow-xs">
    <div class="flex items-start gap-1">
      <div class="min-w-0 flex-1">
        <p v-if="note.pinned" class="text-xs font-medium text-primary">{{ t('notes.pinned') }}</p>
        <h3 class="truncate font-semibold">{{ note.title }}</h3>
        <p
          v-if="note.body"
          class="mt-1 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground"
        >
          {{ note.body }}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">{{ ageLabel }}</p>
      </div>
      <!-- Per-row actions carry the note title in their accessible name so
           screen-reader users can tell rows apart. -->
      <Button
        variant="ghost"
        size="icon"
        :aria-label="
          note.pinned
            ? t('notes.actions.unpin', { title: note.title })
            : t('notes.actions.pin', { title: note.title })
        "
        @click="emit('togglePinned')"
      >
        <PinOff v-if="note.pinned" />
        <Pin v-else />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('notes.actions.delete', { title: note.title })"
        @click="emit('delete')"
      >
        <Trash2 />
      </Button>
    </div>
  </article>
</template>
