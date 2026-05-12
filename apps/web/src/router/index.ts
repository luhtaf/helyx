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
    path: '/hunts/guess-actor',
    name: 'hunt-guess-actor',
    component: () => import('@/views/HuntGuessActorView.vue'),
    meta: { title: 'Guess actor by TTPs' },
  },
  {
    path: '/hunts/:id',
    name: 'hunt-detail',
    component: () => import('@/views/HuntDetailView.vue'),
    props: true,
    meta: { title: 'Hunt' },
  },
  {
    path: '/stakeholders',
    name: 'stakeholders',
    component: () => import('@/views/StakeholdersView.vue'),
    meta: { title: 'Stakeholders' },
  },
  {
    path: '/stakeholders/:id',
    name: 'stakeholder-detail',
    component: () => import('@/views/StakeholderDetailView.vue'),
    props: true,
    meta: { title: 'Stakeholder' },
  },
  {
    path: '/admin/stakeholders/inbox',
    name: 'reconciliation-inbox',
    component: () => import('@/views/ReconciliationInboxView.vue'),
    meta: { title: 'Reconciliation Inbox', requiresRole: 'ADMIN' },
  },
  {
    path: '/cases',
    name: 'cases',
    component: () => import('@/views/CasesView.vue'),
    meta: { title: 'Cases' },
  },
  {
    path: '/cases/new',
    name: 'case-new',
    component: () => import('@/views/CaseCreateView.vue'),
    meta: { title: 'New Case' },
  },
  {
    path: '/cases/:id',
    name: 'case-detail',
    component: () => import('@/views/CaseDetailView.vue'),
    props: true,
    meta: { title: 'Case' },
  },
  {
    path: '/sensors',
    name: 'sensors',
    component: () => import('@/views/SensorsView.vue'),
    meta: { title: 'Sensors' },
  },
  {
    path: '/rules',
    name: 'rules',
    component: () => import('@/views/RulesView.vue'),
    meta: { title: 'Rules' },
  },
  {
    path: '/rules/:id',
    name: 'rule-detail',
    component: () => import('@/views/RuleDetailView.vue'),
    props: true,
    meta: { title: 'Rule' },
  },
  {
    path: '/graph',
    name: 'graph',
    component: () => import('@/views/GraphView.vue'),
    meta: { title: 'Graph' },
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
    path: '/tactics/:id',
    name: 'tactic-detail',
    component: () => import('@/views/TacticDetailView.vue'),
    props: true,
    meta: { title: 'Tactic' },
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

  const ROLE_RANK: Record<string, number> = { OWNER: 4, ADMIN: 3, ANALYST: 2, VIEWER: 1 };

  router.beforeEach((to: RouteLocationNormalized) => {
    const auth = useAuthStore();
    if (to.meta.public) {
      if (auth.isAuthed && to.name === 'login') return { name: 'dashboard' };
      return true;
    }
    if (!auth.isAuthed) {
      return { name: 'login', query: { next: to.fullPath } };
    }
    const required = to.meta.requiresRole as string | undefined;
    if (required) {
      const have = auth.activeOrgRole;
      if (!have || (ROLE_RANK[have] ?? 0) < (ROLE_RANK[required] ?? 99)) {
        return { name: 'dashboard', query: { reason: 'forbidden' } };
      }
    }
    return true;
  });

  router.afterEach((to: RouteLocationNormalized) => {
    const t = (to.meta.title as string) || '';
    document.title = t ? `${t} · Helyx` : 'Helyx';
  });

  return router;
}
