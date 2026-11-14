<template>
  <div
    v-for="t in nav.toasts"
    :key="t.id"
    class="toast"
    :class="{ show: t.show }"
  >
    {{ t.text }}
  </div>
</template>

<script setup lang="ts">
import { useNavigationStore } from "@/stores/navigation";

const nav = useNavigationStore();
</script>
