// Mock demo seeder — produces realistic Indonesian sektoral inventory +
// well-shaped hunt with mixed-state DetectionRules per org so the F1+F2+H5
// release governance loop demos visibly.
//
// Idempotent: every write is MERGE-based + ON CREATE SET. Re-runnable
// without duplicating nodes. Existing data NOT deleted — additive.
//
// Run with: pnpm --filter @helyx/backend seed:mock

import { createHash, randomUUID } from 'node:crypto';
import { closeDriver, getSession } from '../db/neo4j.js';
import { buildHuntStixBundle, persistStixExport } from '../exporters/stix.js';

interface StakeholderDef {
  slug: string;
  name: string;
  city: string;
  sektor: string; // Sektor.name (resolved to id via lookup)
  aliases?: string[];
  assets: AssetDef[];
}

interface AssetDef {
  name: string;
  hostname?: string;
  kind: 'HOST' | 'APPLICATION' | 'CONTAINER' | 'VM' | 'K8S_POD';
  ipAddresses?: string[];
}

interface RuleDef {
  name: string;
  kind: 'YARA' | 'SURICATA' | 'SIGMA';
  description: string;
  content: string;
  tags: string[];
  // Governance state
  releaseTier: 'public' | 'cross-agency' | 'sectoral' | 'internal';
  // 'approved' = fresh approval; 'stale' = approved but content edited
  // post-approval; 'unapproved' = no approval
  approval: 'approved' | 'stale' | 'unapproved';
}

interface HuntDef {
  name: string;
  rules: RuleDef[];
}

interface OrgPlan {
  orgId: string;
  orgName: string;
  userId: string;
  stakeholders: StakeholderDef[];
  hunt: HuntDef;
}

// ─── Org plans ─────────────────────────────────────────────────────

const ACME: OrgPlan = {
  orgId: '5ea4b631-17bf-4c19-a469-20606b4d9ab7',
  orgName: 'Acme Corp',
  userId: '90f41d13-1635-430f-8756-7d70a04c7e4b', // alice@helyx.test
  stakeholders: [
    {
      slug: 'acme-mfg-surabaya',
      name: 'Acme Manufacturing Surabaya',
      city: 'Surabaya',
      sektor: 'Industri',
      assets: [
        { name: 'mfg-srv-01.acme.co.id', kind: 'HOST', ipAddresses: ['10.20.1.10'] },
        { name: 'scada-hmi.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.20.1.45'] },
        { name: 'plc-line-3.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.20.1.103'] },
      ],
    },
    {
      slug: 'acme-rd-bandung',
      name: 'Acme R&D Lab Bandung',
      city: 'Bandung',
      sektor: 'Industri',
      assets: [
        { name: 'gitlab.rd.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.30.1.5'] },
        { name: 'jenkins.rd.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.30.1.6'] },
      ],
    },
    {
      slug: 'acme-logistics-jakarta',
      name: 'Acme Logistics Jakarta',
      city: 'Jakarta',
      sektor: 'Transportasi',
      assets: [
        { name: 'tms.logistics.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.40.1.20'] },
        { name: 'wh-edge-01.acme.co.id', kind: 'HOST', ipAddresses: ['10.40.2.1'] },
      ],
    },
    {
      slug: 'acme-cloud',
      name: 'Acme Cloud Services',
      city: 'Jakarta',
      sektor: 'TIK',
      assets: [
        { name: 'k8s-prod-01.cloud.acme.co.id', kind: 'HOST', ipAddresses: ['10.50.1.1'] },
        { name: 'app-frontend', kind: 'K8S_POD' },
        { name: 'app-payments', kind: 'K8S_POD' },
        { name: 'app-orders', kind: 'K8S_POD' },
      ],
    },
    {
      slug: 'acme-finance',
      name: 'Acme Finance Office',
      city: 'Jakarta',
      sektor: 'Keuangan',
      assets: [
        { name: 'sap.finance.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.60.1.10'] },
        { name: 'bi.finance.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.60.1.15'] },
      ],
    },
    {
      slug: 'acme-retail-north',
      name: 'Acme Retail North',
      city: 'Medan',
      sektor: 'Perdagangan',
      assets: [
        { name: 'pos-medan.retail.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.70.1.5'] },
        { name: 'crm.retail.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.70.1.6'] },
      ],
    },
    {
      slug: 'acme-csirt',
      name: 'Acme CSIRT',
      city: 'Jakarta',
      sektor: 'TIK',
      assets: [
        { name: 'soc.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.80.1.1'] },
        { name: 'misp.csirt.acme.co.id', kind: 'APPLICATION', ipAddresses: ['10.80.1.2'] },
      ],
    },
  ],
  hunt: {
    name: 'Q2 Ransomware Garuda',
    rules: [
      {
        name: 'Garuda — known TOX C2 IP',
        kind: 'SURICATA',
        description: 'Outbound to known TOX C2 infrastructure observed in Garuda Q2 campaign.',
        content: 'alert tcp $HOME_NET any -> 185.220.101.50 443 (msg:"GARUDA C2 TOX outbound"; sid:1000010; rev:1;)',
        tags: ['campaign.garuda', 'c2', 'mitre.t1071.001'],
        releaseTier: 'public',
        approval: 'approved',
      },
      {
        name: 'Garuda — DGA pattern detection',
        kind: 'SURICATA',
        description: 'DGA-like DNS queries matching Garuda Q2 dropper.',
        content: 'alert dns any any -> any any (msg:"GARUDA DGA suspect"; dns_query; pcre:"/^[a-z]{12,18}\\.xyz$/"; sid:1000011; rev:1;)',
        tags: ['campaign.garuda', 'dga', 'mitre.t1568.002'],
        releaseTier: 'cross-agency',
        approval: 'approved',
      },
      {
        name: 'Garuda — encryptor binary YARA',
        kind: 'YARA',
        description: 'Detects the Garuda encryptor stub via unique constant + import set.',
        content: 'rule garuda_encryptor {\n  meta:\n    author = "acme-csirt"\n    family = "garuda"\n  strings:\n    $magic = "GARUDAv2" ascii\n    $imp = "CryptEncrypt" ascii\n  condition:\n    uint16(0) == 0x5A4D and all of them\n}',
        tags: ['campaign.garuda', 'ransomware', 'mitre.t1486'],
        releaseTier: 'cross-agency',
        approval: 'approved',
      },
      {
        name: 'Garuda — ransom note YARA',
        kind: 'YARA',
        description: 'Garuda ransom note pattern (Indonesian + English bilingual).',
        content: 'rule garuda_note {\n  strings:\n    $a = "GARUDA LOCKER" ascii\n    $b = "Hubungi kami via TOX" ascii\n  condition:\n    any of them\n}',
        tags: ['campaign.garuda', 'ransom-note'],
        releaseTier: 'sectoral',
        approval: 'stale',
      },
      {
        name: 'Garuda — SCADA HMI lateral movement (Sigma)',
        kind: 'SIGMA',
        description: 'Detects suspicious WMIC + service install pattern observed in Garuda lateral movement to OT segment.',
        content: 'title: Garuda lateral move via WMIC\nlogsource:\n  product: windows\n  service: process_creation\ndetection:\n  selection:\n    Image|endswith: "\\\\wmic.exe"\n    CommandLine|contains: "process call create"\n  condition: selection',
        tags: ['campaign.garuda', 'lateral-movement', 'mitre.t1047'],
        releaseTier: 'sectoral',
        approval: 'approved',
      },
      {
        name: 'Garuda — internal SOC pivot query',
        kind: 'SIGMA',
        description: 'Internal-only — pivots on SOC-specific allowlist; not for export.',
        content: 'title: Acme SOC pivot — Garuda\nlogsource:\n  product: zeek\ndetection:\n  selection:\n    src_ip: "10.80.1.1"\n  condition: selection',
        tags: ['campaign.garuda', 'internal', 'soc-pivot'],
        releaseTier: 'internal',
        approval: 'unapproved',
      },
      {
        name: 'Garuda — TOR exit node beacon',
        kind: 'SIGMA',
        description: 'Beacon pattern to TOR exit node observed in Garuda Q2 calls home.',
        content: 'title: Garuda TOR exit beacon\nlogsource:\n  product: zeek\ndetection:\n  selection:\n    dst_port: 9001\n  condition: selection',
        tags: ['campaign.garuda', 'tor', 'mitre.t1090.003'],
        releaseTier: 'cross-agency',
        approval: 'unapproved',
      },
    ],
  },
};

const PAJAK: OrgPlan = {
  orgId: '4117e663-72ef-45dc-af9a-492f3e092d37',
  orgName: 'Direktorat Jenderal Pajak',
  userId: '90f41d13-1635-430f-8756-7d70a04c7e4b', // alice@helyx.test
  stakeholders: [
    {
      slug: 'djp-pusat-tik',
      name: 'DJP Pusat — Direktorat TIK',
      city: 'Jakarta',
      sektor: 'Administrasi Pemerintahan',
      assets: [
        { name: 'core.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.100.1.1'] },
        { name: 'efaktur.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.100.1.2'] },
        { name: 'djponline.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.100.1.3'] },
      ],
    },
    {
      slug: 'djp-kanwil-jakpus',
      name: 'Kanwil DJP Jakarta Pusat',
      city: 'Jakarta',
      sektor: 'Administrasi Pemerintahan',
      assets: [
        { name: 'kanwil-jakpus.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.101.1.10'] },
      ],
    },
    {
      slug: 'djp-kanwil-jabar1',
      name: 'Kanwil DJP Jawa Barat I',
      city: 'Bandung',
      sektor: 'Administrasi Pemerintahan',
      assets: [
        { name: 'kanwil-jabar1.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.102.1.10'] },
      ],
    },
    {
      slug: 'djp-kpp-sawah-besar',
      name: 'KPP Pratama Jakarta Sawah Besar',
      city: 'Jakarta',
      sektor: 'Administrasi Pemerintahan',
      assets: [
        { name: 'kpp-sawah-besar.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.103.1.5'] },
      ],
    },
    {
      slug: 'djp-pusdata',
      name: 'DJP Pusat — Pusat Data dan Informasi Perpajakan',
      city: 'Jakarta',
      sektor: 'Administrasi Pemerintahan',
      assets: [
        { name: 'pusdata.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.104.1.1'] },
        { name: 'dwh-srv-01.pajak.go.id', kind: 'HOST', ipAddresses: ['10.104.1.2'] },
      ],
    },
    {
      slug: 'djp-penegakan-hukum',
      name: 'DJP Pusat — Direktorat Penegakan Hukum',
      city: 'Jakarta',
      sektor: 'Administrasi Pemerintahan',
      assets: [
        { name: 'forensik.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.105.1.1'] },
      ],
    },
    {
      slug: 'djp-csirt',
      name: 'DJP CSIRT',
      city: 'Jakarta',
      sektor: 'Administrasi Pemerintahan',
      aliases: ['CSIRT-DJP', 'TIM CSIRT Pajak'],
      assets: [
        { name: 'csirt.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.106.1.1'] },
        { name: 'misp.pajak.go.id', kind: 'APPLICATION', ipAddresses: ['10.106.1.2'] },
      ],
    },
  ],
  hunt: {
    name: 'Operasi Pemilu — Forensik Phishing 2026',
    rules: [
      {
        name: 'Phishing — pajak-go-id lookalike domain',
        kind: 'SURICATA',
        description: 'TLS SNI matching known typosquats of pajak.go.id used in 2026 election-cycle phishing.',
        content: 'alert tls $EXTERNAL_NET any -> $HOME_NET any (msg:"PHISHING typosquat pajak.go.id"; tls.sni; content:"pajakgoid.com"; sid:2000010; rev:1;)',
        tags: ['operasi-pemilu', 'phishing', 'mitre.t1566.002'],
        releaseTier: 'public',
        approval: 'approved',
      },
      {
        name: 'Phishing — efaktur credential harvest',
        kind: 'SURICATA',
        description: 'POST to lookalike efaktur login forms.',
        content: 'alert http $HOME_NET any -> $EXTERNAL_NET any (msg:"PHISHING efaktur cred POST"; http.method; content:"POST"; http.uri; content:"/login"; http.host; content:"efakturpajak"; sid:2000011; rev:1;)',
        tags: ['operasi-pemilu', 'phishing', 'cred-harvest'],
        releaseTier: 'public',
        approval: 'approved',
      },
      {
        name: 'Phishing — Indonesian-language dropper YARA',
        kind: 'YARA',
        description: 'Macro dropper with bilingual Indonesian decoy referencing DJP.',
        content: 'rule pemilu_phish_dropper {\n  strings:\n    $a = "Direktorat Jenderal Pajak" ascii\n    $b = "AutoOpen" ascii\n    $c = "Shell" ascii\n  condition:\n    all of them\n}',
        tags: ['operasi-pemilu', 'dropper', 'macro'],
        releaseTier: 'cross-agency',
        approval: 'approved',
      },
      {
        name: 'Phishing — ZIP attachment with double extension',
        kind: 'YARA',
        description: 'ZIP-with-LNK pattern observed in DJP-themed lures.',
        content: 'rule pemilu_zip_lnk {\n  strings:\n    $z = { 50 4B 03 04 }\n    $name = ".pdf.lnk" ascii\n  condition:\n    $z at 0 and $name\n}',
        tags: ['operasi-pemilu', 'zip-lnk'],
        releaseTier: 'cross-agency',
        approval: 'stale',
      },
      {
        name: 'DJP internal — anomalous DWH query rate (Sigma)',
        kind: 'SIGMA',
        description: 'High-rate DWH query from non-analyst account.',
        content: 'title: DJP DWH anomalous rate\nlogsource:\n  product: dwh\ndetection:\n  selection:\n    queries_per_min: ">100"\n  condition: selection',
        tags: ['operasi-pemilu', 'insider', 'internal'],
        releaseTier: 'internal',
        approval: 'unapproved',
      },
      {
        name: 'Sektoral — gov-wide phishing kit pattern (Sigma)',
        kind: 'SIGMA',
        description: 'Web-server log signature for the kit reused across .go.id sektor.',
        content: 'title: Gov phishing kit fingerprint\nlogsource:\n  product: nginx\ndetection:\n  selection:\n    request|contains: "/kit/v2/login"\n  condition: selection',
        tags: ['operasi-pemilu', 'kit-fingerprint', 'sektoral'],
        releaseTier: 'sectoral',
        approval: 'approved',
      },
    ],
  },
};

const TELKOM: OrgPlan = {
  orgId: 'ceaedd7d-de89-4c31-98dc-8d52c9cb15e6',
  orgName: 'PT Telkom Indonesia',
  userId: '0a1fd74c-fdd7-44c4-aa2a-af3ca2c3d6e1', // bob@helyx.test
  stakeholders: [
    {
      slug: 'telkom-witel-jakarta',
      name: 'Telkom Witel Jakarta',
      city: 'Jakarta',
      sektor: 'TIK',
      assets: [
        { name: 'witel-jkt.telkom.co.id', kind: 'APPLICATION', ipAddresses: ['10.200.1.1'] },
        { name: 'edge-jkt-01', kind: 'HOST', ipAddresses: ['10.200.1.10'] },
      ],
    },
    {
      slug: 'telkom-witel-surabaya',
      name: 'Telkom Witel Surabaya',
      city: 'Surabaya',
      sektor: 'TIK',
      assets: [
        { name: 'witel-sby.telkom.co.id', kind: 'APPLICATION', ipAddresses: ['10.201.1.1'] },
      ],
    },
    {
      slug: 'telkom-sigma-sentul',
      name: 'TelkomSigma — Data Center Sentul',
      city: 'Bogor',
      sektor: 'TIK',
      assets: [
        { name: 'dc-sentul.telkomsigma.co.id', kind: 'APPLICATION', ipAddresses: ['10.210.1.1'] },
        { name: 'k8s-sentul-01', kind: 'HOST', ipAddresses: ['10.210.1.10'] },
      ],
    },
    {
      slug: 'telkom-csirt',
      name: 'Telkom CSIRT',
      city: 'Jakarta',
      sektor: 'TIK',
      aliases: ['ID-CERT/Telkom', 'TLM-CSIRT'],
      assets: [
        { name: 'csirt.telkom.co.id', kind: 'APPLICATION', ipAddresses: ['10.220.1.1'] },
        { name: 'misp.telkom.co.id', kind: 'APPLICATION', ipAddresses: ['10.220.1.2'] },
      ],
    },
    {
      slug: 'indihome-customer-ops',
      name: 'IndiHome Customer Operations',
      city: 'Bandung',
      sektor: 'TIK',
      assets: [
        { name: 'crm.indihome.co.id', kind: 'APPLICATION', ipAddresses: ['10.230.1.1'] },
        { name: 'billing.indihome.co.id', kind: 'APPLICATION', ipAddresses: ['10.230.1.2'] },
      ],
    },
    {
      slug: 'telkomsel-noc',
      name: 'Telkomsel Network Operations',
      city: 'Jakarta',
      sektor: 'TIK',
      assets: [
        { name: 'noc.telkomsel.com', kind: 'APPLICATION', ipAddresses: ['10.240.1.1'] },
        { name: 'pcrf-jkt-01', kind: 'HOST', ipAddresses: ['10.240.1.10'] },
      ],
    },
    {
      slug: 'telkom-international',
      name: 'Telkom International',
      city: 'Singapore',
      sektor: 'TIK',
      assets: [
        { name: 'gw-sg-01.telin.net', kind: 'HOST', ipAddresses: ['10.250.1.1'] },
      ],
    },
  ],
  hunt: {
    name: 'Backbone Anomaly — Suspected APT41',
    rules: [
      {
        name: 'APT41 — known C2 ASN beacon',
        kind: 'SURICATA',
        description: 'Outbound TCP to ASN known to host APT41 infrastructure.',
        content: 'alert tcp $HOME_NET any -> [45.86.0.0/16,103.27.0.0/16] any (msg:"APT41 ASN C2"; sid:3000010; rev:1;)',
        tags: ['apt41', 'c2', 'mitre.t1071.001'],
        releaseTier: 'cross-agency',
        approval: 'approved',
      },
      {
        name: 'APT41 — Cobalt Strike default beacon',
        kind: 'SURICATA',
        description: 'Default CS beacon URI hash observed in APT41 staged loaders.',
        content: 'alert http any any -> any any (msg:"APT41 CS default beacon"; http.uri; content:"/CWoNaJLBo/"; sid:3000011; rev:1;)',
        tags: ['apt41', 'cobalt-strike', 'mitre.t1071.001'],
        releaseTier: 'public',
        approval: 'approved',
      },
      {
        name: 'APT41 — ScreenConnect lateral installer YARA',
        kind: 'YARA',
        description: 'Detect repackaged ScreenConnect installer used by APT41 for backbone lateral.',
        content: 'rule apt41_sc_installer {\n  strings:\n    $a = "ScreenConnect.ClientService" ascii\n    $b = "PromptForCredentials" ascii\n  condition:\n    all of them\n}',
        tags: ['apt41', 'lateral-movement', 'mitre.t1219'],
        releaseTier: 'cross-agency',
        approval: 'stale',
      },
      {
        name: 'APT41 — DustPan loader YARA',
        kind: 'YARA',
        description: 'DustPan in-memory loader signature.',
        content: 'rule apt41_dustpan {\n  strings:\n    $magic = "DUSTPAN_v1" ascii\n  condition:\n    $magic\n}',
        tags: ['apt41', 'loader'],
        releaseTier: 'sectoral',
        approval: 'approved',
      },
      {
        name: 'Telkom backbone — anomalous BGP route hijack (Sigma)',
        kind: 'SIGMA',
        description: 'Anomalous BGP announcement matching APT41 hijack pattern observed Q1 2026.',
        content: 'title: Telkom backbone BGP anomaly\nlogsource:\n  product: bgp\ndetection:\n  selection:\n    asn_origin_change: true\n  condition: selection',
        tags: ['apt41', 'bgp', 'sectoral'],
        releaseTier: 'sectoral',
        approval: 'approved',
      },
      {
        name: 'Telkom internal — NOC pivot query (Sigma)',
        kind: 'SIGMA',
        description: 'NOC-only pivot — references internal asset IDs.',
        content: 'title: Telkom NOC pivot APT41\nlogsource:\n  product: zeek\ndetection:\n  selection:\n    src_ip: "10.240.1.1"\n  condition: selection',
        tags: ['apt41', 'internal', 'noc-pivot'],
        releaseTier: 'internal',
        approval: 'unapproved',
      },
    ],
  },
};

// ─── Seeder primitives ─────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

async function getSektorIdByName(name: string): Promise<string> {
  const session = getSession();
  try {
    const r = await session.run(`MATCH (s:Sektor {name: $name}) RETURN s.id AS id`, { name });
    if (r.records.length === 0) throw new Error(`Sektor not found: ${name}`);
    return r.records[0]!.get('id') as string;
  } finally {
    await session.close();
  }
}

async function seedStakeholderAndAssets(plan: OrgPlan, def: StakeholderDef): Promise<void> {
  const sektorId = await getSektorIdByName(def.sektor);
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      // Stakeholder MERGE on (tenantId, slug). Bumps name/city/sektor/aliases on every run.
      await tx.run(
        `MERGE (s:Stakeholder {tenantId: $tenantId, slug: $slug})
         ON CREATE SET s.id = randomUUID(), s.createdAt = datetime(), s.status = 'ACTIVE',
                       s.sensorStatus = 'NONE', s.sensorAgentCount = 0
         SET s.name = $name, s.city = $city, s.aliases = $aliases, s.updatedAt = datetime()
         WITH s
         MATCH (sk:Sektor {id: $sektorId})
         MERGE (s)-[:IN_SEKTOR]->(sk)`,
        {
          tenantId: plan.orgId,
          slug: def.slug,
          name: def.name,
          city: def.city,
          aliases: def.aliases ?? [],
          sektorId,
        },
      );

      // Assets — MERGE on (tenantId, name). OWNS edge from stakeholder.
      for (const a of def.assets) {
        await tx.run(
          `MATCH (s:Stakeholder {tenantId: $tenantId, slug: $slug})
           MERGE (a:Asset {tenantId: $tenantId, name: $name})
           ON CREATE SET a.id = randomUUID(), a.createdAt = datetime()
           SET a.kind = $kind, a.hostname = $hostname, a.ipAddresses = $ipAddresses,
               a.updatedAt = datetime()
           MERGE (s)-[:OWNS]->(a)`,
          {
            tenantId: plan.orgId,
            slug: def.slug,
            name: a.name,
            kind: a.kind,
            hostname: a.hostname ?? a.name,
            ipAddresses: a.ipAddresses ?? [],
          },
        );
      }
    });
  } finally {
    await session.close();
  }
}

async function seedHuntAndRules(plan: OrgPlan): Promise<{ huntId: string; ruleIds: string[] }> {
  const session = getSession();
  try {
    // Hunt MERGE on (tenantId, name). Returns id.
    const huntRes = await session.executeWrite(async (tx) => {
      const r = await tx.run(
        `MERGE (h:Hunt {tenantId: $tenantId, name: $name})
         ON CREATE SET h.id = randomUUID(), h.createdAt = datetime(),
                       h.status = 'ACTIVE'
         SET h.releaseTier = coalesce(h.releaseTier, 'cross-agency'),
             h.updatedAt = datetime()
         RETURN h.id AS id`,
        { tenantId: plan.orgId, name: plan.hunt.name },
      );
      return r.records[0]!.get('id') as string;
    });

    // Rules — MERGE on (tenantId, name). Set governance state.
    const ruleIds: string[] = [];
    for (const ruleDef of plan.hunt.rules) {
      const id = await session.executeWrite(async (tx) => {
        // Decide the persisted content + approval state.
        // For 'stale': we approve against the original content, then mutate
        // it post-approval so sha256(current) != approvalContentHash.
        const isApproved = ruleDef.approval === 'approved' || ruleDef.approval === 'stale';
        const approvedAt = isApproved ? new Date(Date.now() - 86400 * 1000).toISOString() : null;
        const approvalContentHash = isApproved ? sha256(ruleDef.content) : null;
        const persistedContent = ruleDef.approval === 'stale'
          ? ruleDef.content + '\n# refined ' + new Date().toISOString().slice(0, 10)
          : ruleDef.content;

        const r = await tx.run(
          `MERGE (r:DetectionRule {tenantId: $tenantId, name: $name})
           ON CREATE SET r.id = randomUUID(), r.createdAt = datetime(),
                         r.source = 'GENERATED', r.status = 'ACTIVE'
           SET r.kind = $kind, r.description = $description,
               r.content = $content, r.tags = $tags,
               r.releaseTier = $releaseTier,
               r.approvedByUserId = $approvedByUserId,
               r.approvedAt = CASE WHEN $approvedAt IS NULL THEN null ELSE datetime($approvedAt) END,
               r.approvalContentHash = $approvalContentHash,
               r.updatedAt = datetime()
           WITH r
           MATCH (h:Hunt {tenantId: $tenantId, id: $huntId})
           MERGE (h)-[:GENERATED]->(r)
           RETURN r.id AS id`,
          {
            tenantId: plan.orgId,
            huntId: huntRes,
            name: ruleDef.name,
            kind: ruleDef.kind,
            description: ruleDef.description,
            content: persistedContent,
            tags: ruleDef.tags,
            releaseTier: ruleDef.releaseTier,
            approvedByUserId: isApproved ? plan.userId : null,
            approvedAt,
            approvalContentHash,
          },
        );
        return r.records[0]!.get('id') as string;
      });
      ruleIds.push(id);
    }

    return { huntId: huntRes, ruleIds };
  } finally {
    await session.close();
  }
}

// H5.5 — Seed 1 historical :StixExport per demo hunt so the export
// history panel is populated on first visit. Uses the real export
// pipeline (lazy-creates the org keypair if missing). Idempotent:
// skip if any :StixExport already exists for this hunt.
async function seedHistoricalExport(plan: OrgPlan, huntId: string): Promise<string | null> {
  const session = getSession();
  let alreadyHasExport = false;
  try {
    const r = await session.run(
      `MATCH (e:StixExport {tenantId: $tenantId, huntId: $huntId})
       RETURN count(e) AS n`,
      { tenantId: plan.orgId, huntId },
    );
    alreadyHasExport = (r.records[0]!.get('n') as { toString: () => string }).toString() !== '0';
  } finally {
    await session.close();
  }
  if (alreadyHasExport) return 'exists';

  // Real export path — produces signed bundle + persists :StixExport.
  // Will throw if CTI_SIGNING_MASTER_KEY missing (loud/actionable).
  const built = await buildHuntStixBundle(plan.orgId, huntId);
  if (!built.ok) return `skipped (${built.reason})`;
  const record = await persistStixExport(plan.orgId, huntId, built.result, built.result.sourceRuleIds);
  return `exported ${record.indicatorCount} indicators · TLP:${record.tlp}`;
}

async function seedOrg(plan: OrgPlan): Promise<void> {
  console.log(`\n=== ${plan.orgName} ===`);
  console.log(`  → ${plan.stakeholders.length} stakeholders + assets…`);
  for (const def of plan.stakeholders) {
    await seedStakeholderAndAssets(plan, def);
  }
  console.log(`  → hunt "${plan.hunt.name}" + ${plan.hunt.rules.length} rules…`);
  const { huntId, ruleIds } = await seedHuntAndRules(plan);
  const approvedCount = plan.hunt.rules.filter((r) => r.approval === 'approved').length;
  const staleCount = plan.hunt.rules.filter((r) => r.approval === 'stale').length;
  const tierBreakdown = plan.hunt.rules.reduce<Record<string, number>>((acc, r) => {
    acc[r.releaseTier] = (acc[r.releaseTier] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`     hunt id: ${huntId}`);
  console.log(`     rules: ${ruleIds.length} total · ${approvedCount} approved (fresh) · ${staleCount} stale · ${ruleIds.length - approvedCount - staleCount} unapproved`);
  console.log(`     tiers : ${JSON.stringify(tierBreakdown)}`);
  console.log(`  → seeding historical STIX export…`);
  try {
    const result = await seedHistoricalExport(plan, huntId);
    console.log(`     ${result}`);
  } catch (e) {
    console.log(`     skipped: ${(e as Error).message}`);
  }
}

async function main(): Promise<void> {
  console.log('Seeding mock demo data (idempotent, additive)…');
  for (const plan of [ACME, PAJAK, TELKOM]) {
    await seedOrg(plan);
  }
  console.log('\nDone. Browse /stakeholders, /rules, /graph?hunt=<id>.');
  await closeDriver();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await closeDriver();
  process.exit(1);
});
