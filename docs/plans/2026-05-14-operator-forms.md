# Operator forms — Asset / Sensor / Artifact

3 missing forms blocking operator workflow. Build sequentially. Verify each end-to-end before next.

## 1. Add Asset (manual)

### User flow
1. Operator di `/assets` → klik tombol **"+ Add asset"** di header
2. Slide-over open dari kanan dengan form:
   - **Kind** (select, required) — HOST / HYPERVISOR / VM / CONTAINER / K8S_CLUSTER / K8S_NODE / K8S_POD / IMAGE / APPLICATION
   - **Name** (text, required) — operator-friendly identifier
   - **Hostname** (text, optional)
   - **IP addresses** (textarea, one per line, optional)
   - **Parent asset** (autocomplete by name+kind, optional) — buat tier hierarchy
3. Submit → toast "Added <name>" → modal close → list refresh
4. Click row → existing AssetDetailView

### Backend (already exists)
- `createAsset(input: CreateAssetInput!): Asset!` — assets/schema.ts:103
- Input: `{ kind, name, hostname?, ipAddresses?, parentId? }`
- Tenant-scoped via ctx.activeOrgId; ANALYST role per existing pattern

### Frontend pieces
- `useAssets.ts` — add `useCreateAsset()` composable (mutation + error ref)
- New `AddAssetSlide.vue` component di `components/asset/` — slide-over pattern (mirror CreateStakeholderSlide)
- Parent autocomplete — fetch `assets(search: "...")` debounced, render top 10
- Wire button + slide into `AssetsView.vue` header

### Verify
- Curl: createAsset returns id + persists
- Browse: button visible, fill form, submit, see in list, click → detail loads
- Audit log: ga ada audit (createAsset bukan sensitive op per existing audit set)

---

## 2. Sensor input form (per stakeholder)

### User flow
1. Operator di `/stakeholders/:id` → ada section "Sensor coverage" (sudah ada SensorStatusPill, sekarang clickable)
2. Click pill atau "+ Configure sensor" button → modal/slide
3. Form:
   - **Stack** (select) — WAZUH / SURICATA / ZEEK / OSQUERY / NONE (cek SensorStack enum)
   - **Status** (select) — ONLINE / DEGRADED / OFFLINE (per existing enum, NONE removed earlier)
   - **Agent count** (number, optional)
   - **Deployed at** (date input, optional)
   - **Notes** (textarea, optional)
4. Submit → toast "Sensor updated" → SensorStatusPill refreshes

### Backend (already exists)
- `setStakeholderSensor(id: ID!, input: SensorInput!): Stakeholder!` — stakeholders/schema.ts:77
- Input: `{ stack?, status?, agentCount?, deployedAt?, notes? }`
- Wraps existing setStakeholderSensor resolver; tenant-scoped

### Frontend pieces
- `useStakeholders.ts` — add `useSetStakeholderSensor()` composable
- New `SensorInputModal.vue` di `components/stakeholder/`
- Wire into `StakeholderDetailView.vue` — make existing SensorStatusPill clickable atau tambah edit button

### Verify
- Curl: setStakeholderSensor mutation returns updated stakeholder
- Browse: open stakeholder, click pill, fill form, submit, pill updates
- Cek pill di /stakeholders list refreshes

---

## 3. Add Artifact form (case-bound, IOC type only for v1)

### User flow
1. Operator di `/cases/:id` → tab "Artifacts" → ada section per type (Iocs / Files / Processes / etc.)
2. Section "Indicators (IOC)" header → "+ Add indicator" button
3. Modal opens dengan form (IOC-specific):
   - **IOC type** (select) — IPV4 / IPV6 / DOMAIN / URL / FILE_HASH / etc. (cek IocType enum)
   - **Value** (text, required)
   - **Direction** (select, optional) — INBOUND / OUTBOUND / INTERNAL
   - **First seen / last seen** (datetime, optional)
   - **Source** (text, optional) — "operator", "wazuh", etc.
   - **Notes** (textarea, optional, ArtifactBaseInput)
4. Submit → toast "Added <value>" → artifacts list refreshes

### Backend (already exists)
- `createIocArtifact(caseId: ID!, input: IocArtifactInput!): IocArtifact!`
- Input: `{ base: ArtifactBaseInput!, iocType: IocType!, value: String!, direction?, firstSeen?, lastSeen?, source? }`
- ArtifactBaseInput: `{ notes?, ttpHints?, source?, ... }` — cek shape lengkap

### Frontend pieces
- `useCase.ts` atau new `useArtifacts.ts` — `useCreateIocArtifact()` composable
- New `AddIocArtifactModal.vue` di `components/case/`
- Wire ke `CaseDetailView.vue` — di section IOC, tambah "+" button

### Verify
- Curl: createIocArtifact returns artifact + persists
- Browse: open case, click + on IOC section, fill form, submit, IOC appears
- Cek count di artifacts panel naik

### Other artifact types (future)
- File / Process / Network / Registry / Persistence / Account / LogFinding / Memory / DetectionHit / Note
- Each has own input shape — bikin generic ArtifactFormModal kalau pattern ke-reuse
- v1: IOC only (most common); rest follow as needed

---

## Build order
1. **Asset** — simplest, 5 fields. Build composable + slide + autocomplete + wire. Verify.
2. **Sensor** — second, single mutation no autocomplete. Modal embedded di stakeholder detail.
3. **Artifact (IOC)** — third, scoped to case. Modal in case detail.

Per feature: BE verify (curl) → FE build → typecheck → browser smoke → commit. **Tidak parallel** — biar satu-satu jelas.

## Out of scope this batch
- Other 10 artifact types (defer)
- Rule create/update form (operator currently uses generated rules)
- User invite / org membership UI
- CSV bulk import
- Object storage + presigned URL (no file blobs needed yet)
