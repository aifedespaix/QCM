<script setup lang="ts">
/** Icônes au trait du site : même grille 24 px et même épaisseur que celles du bandeau. */
const PATHS = {
  back: 'M19 12H5M11 6l-6 6 6 6',
  play: 'M8 5v14l11-7z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  pencil: 'M4 20l1-4.5L16.5 4l3.5 3.5L8.5 19 4 20zM14 6.5l3.5 3.5',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5',
  copy: 'M9 9h10.5v11H9zM15 9V4.5H4.5v11H9',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  'eye-off': 'M4 4l16 16M9.9 9.9a3 3 0 0 0 4.2 4.2M7 7.3C5 8.5 3.5 10.3 2.5 12c1.8 3.2 5.2 6 9.5 6 1.4 0 2.7-.3 3.9-.8M11 6.100c.3 0 .7-.1 1-.1 4.3 0 7.7 2.8 9.5 6-.5.9-1.2 1.8-2 2.6',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.500M12 7.700v.1',
  star: 'M12 3.500l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  comment: 'M4.5 5h15v11h-8L7 19.500V16H4.500z',
  send: 'M20 4L3.5 10.500l6.5 3 3 6.500zM10 13.500L20 4',
  list: 'M9 7h10.500M9 12h10.500M9 17h10.500M4.5 7h.1M4.5 12h.1M4.5 17h.1',
  image: 'M4.5 5.500h15v13h-15zM4.5 15.500l4.5-4 4 3.5 2.5-2 4 3.500M15 9.500h.1',
  calendar: 'M4.5 6.500h15v13h-15zM4.5 10.500h15M8.5 4v4M15.5 4v4',
  shield: 'M12 3.500l7 2.500v5.500c0 4.2-2.8 7.3-7 9-4.2-1.7-7-4.8-7-9V6z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.8-3.5 3.8-5.5 7.5-5.500s6.7 2 7.5 5.5',
} as const

export type IconName = keyof typeof PATHS

withDefaults(defineProps<{ name: IconName; size?: number; stroke?: number; filled?: boolean }>(), { size: 22, stroke: 2.2, filled: false })
</script>

<template>
  <svg
    class="flex-none"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
