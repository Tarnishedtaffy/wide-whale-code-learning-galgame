<script setup lang="ts">
import { ASSETS } from "@/assets/manifest";
import { useNavigationStore } from "@/stores/navigation";

const nav = useNavigationStore();
</script>

<template>
  <section id="welcome" class="page" :class="{ on: nav.currentPage === 'welcome' }">
    <div class="bg-layer"></div>
    <div class="inner">
      <div class="wgirl"><img :src="ASSETS.welcomeGirl" alt="" /></div>
      <div class="wt">Mnk study loop</div>
      <div class="gogo-wrap">
        <button id="gogoBtn" class="gogo-btn" type="button" @click="nav.go('home')">
          <span><i>G</i><i>O</i><i>G</i><i>O</i><i>G</i><i>O</i></span>
        </button>
      </div>
    </div>
  </section>
</template>
