import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw,
} from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import DashboardView from '@/views/DashboardView.vue';
import LoginView from '@/views/LoginView.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { public: true, title: 'Sign in' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: { title: 'Overview' },
  },
  {
    path: '/assets',
    name: 'assets',
    component: () => import('@/views/AssetsView.vue'),
    meta: { title: 'Inventory' },
  },
  {
    path: '/assets/:id',
    name: 'asset-detail',
    component: () => import('@/views/AssetDetailView.vue'),
    props: true,
    meta: { title: 'Asset' },
  },
  {
    path: '/cves',
    name: 'cves',
    component: () => import('@/views/CvesView.vue'),
    meta: { title: 'Vulnerabilities' },
  },
  {
    path: '/cves/:id',
    name: 'cve-detail',
    component: () => import('@/views/CveDetailView.vue'),
    props: true,
    meta: { title: 'CVE' },
  },
  {
    path: '/hunts',
    name: 'hunts',
    component: () => import('@/views/HuntsView.vue'),
    meta: { title: 'Hunt' },
  },
  {
    path: '/hunts/new',
    name: 'hunt-new',
    component: () => import('@/views/HuntCreateView.vue'),
    meta: { title: 'New hunt' },
  },
  {
    path: '/hunts/:id',
    name: 'hunt-detail',
    component: () => import('@/views/HuntDetailView.vue'),
    props: true,
    meta: { title: 'Hunt' },
  },
  {
    path: '/threat-actors',
    name: 'threat-actors',
    component: () => import('@/views/ThreatActorsView.vue'),
    meta: { title: 'Actors' },
  },
  {
    path: '/threat-actors/:id',
    name: 'threat-actor-detail',
    component: () => import('@/views/ThreatActorDetailView.vue'),
    props: true,
    meta: { title: 'Threat actor' },
  },
  {
    path: '/techniques',
    name: 'techniques',
    component: () => import('@/views/MatrixView.vue'),
    meta: { title: 'Matrix' },
  },
  {
    path: '/techniques/:id',
    name: 'technique-detail',
    component: () => import('@/views/AttackPatternDetailView.vue'),
    props: true,
    meta: { title: 'Technique' },
  },
  {
    path: '/cwe/:id',
    name: 'cwe-detail',
    component: () => import('@/views/CweDetailView.vue'),
    props: true,
    meta: { title: 'CWE' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Not found' },
  },
];

export function createAppRouter() {
  const router = createRouter({ history: createWebHistory(), routes });

  router.beforeEach((to: RouteLocationNormalized) => {
    const auth = useAuthStore();
    if (to.meta.public) {
      if (auth.isAuthed && to.name === 'login') return { name: 'dashboard' };
      return true;
    }
    if (!auth.isAuthed) {
      return { name: 'login', query: { next: to.fullPath } };
    }
    return true;
  });

  router.afterEach((to: RouteLocationNormalized) => {
    const t = (to.meta.title as string) || '';
    document.title = t ? `${t} · Helyx` : 'Helyx';
  });

  return router;
}
