import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

import "./styles/legacy-core.css";
import "./styles/mobile-adapt.css";
import "./styles/ux-polish.css";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
