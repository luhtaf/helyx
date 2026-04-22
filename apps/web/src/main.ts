import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { DefaultApolloClient } from '@vue/apollo-composable';
import App from './App.vue';
import { createAppRouter } from './router';
import { createApolloClient } from './api/apollo';
import { useAuthStore } from './stores/auth';
import './assets/main.css';

const pinia = createPinia();
const app = createApp(App);
app.use(pinia);

const auth = useAuthStore();
app.provide(DefaultApolloClient, createApolloClient(auth));

app.use(createAppRouter());
app.mount('#app');
