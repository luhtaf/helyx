import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { DefaultApolloClient } from '@vue/apollo-composable';
import App from './App.vue';
import { createAppRouter } from './router';
import { createApolloClient } from './api/apollo';
import { useAuthStore } from './stores/auth';
import './assets/main.css';

// Migrate from old localStorage Bearer auth to cookie auth (Phase 3).
// Safe to run every boot — clears stale token only if no session cookie present.
if (localStorage.getItem('token') && !document.cookie.includes('helyx_session=')) {
  localStorage.removeItem('token');
  localStorage.removeItem('helyx_token');
}

const pinia = createPinia();
const app = createApp(App);
app.use(pinia);

const auth = useAuthStore();
app.provide(DefaultApolloClient, createApolloClient(auth));

app.use(createAppRouter());
app.mount('#app');
