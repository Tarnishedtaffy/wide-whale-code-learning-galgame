<template>
  <div
    id="plusDrawer"
    class="plus-drawer"
    :class="{ show: nav.activeDrawer === 'plus' }"
  >
    <div class="pd-title">选择发送内容</div>
    <div class="pd-items">
      <button
        type="button"
        class="pd-item"
        data-type="file"
        @click="chat.sendAttachmentPlaceholder('file')"
      >
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M6 3h8l4 4v14H6z" stroke="#4a3548" stroke-width="1.8" fill="#f9dce4" />
          <path d="M14 3v4h4" stroke="#4a3548" stroke-width="1.8" />
        </svg>
        文件
      </button>
      <button type="button" class="pd-item" data-type="voice" @click="startCall(false)">
        <svg viewBox="0 0 24 24" fill="none">
          <rect
            x="9"
            y="3"
            width="6"
            height="11"
            rx="3"
            stroke="#4a3548"
            stroke-width="1.8"
            fill="#f9dce4"
          />
          <path d="M6 11a6 6 0 0012 0M12 17v4" stroke="#4a3548" stroke-width="1.8" />
        </svg>
        语音
      </button>
      <button type="button" class="pd-item" data-type="video" @click="startCall(true)">
        <svg viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="6"
            width="13"
            height="12"
            rx="2"
            stroke="#4a3548"
            stroke-width="1.8"
            fill="#f9dce4"
          />
          <path
            d="M16 10l5-3v10l-5-3z"
            stroke="#4a3548"
            stroke-width="1.8"
            fill="#f9dce4"
          />
        </svg>
        视频
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNavigationStore } from "@/stores/navigation";
import { useChatStore } from "@/stores/chat";

const nav = useNavigationStore();
const chat = useChatStore();

function startCall(withVideo: boolean) {
  nav.closeAllDrawers();
  nav.openVoiceCall({ video: withVideo, fromPage: "chat" });
}
</script>
