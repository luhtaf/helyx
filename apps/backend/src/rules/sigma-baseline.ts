// Curated baseline of 30 SigmaHQ-style rules covering MITRE techniques most
// relevant to BSSN/SOC pre-assessment. Each entry maps to one or more
// MITRE ATT&CK techniqueId (T-codes) for auto-link via :DETECTS at import.
//
// In Phase H6 this gets supplemented by live SigmaHQ fetch; in Phase H7 by
// OTX/STIX imports. For H1 demo, hand-curated set is sufficient.

import type { CreateRuleInput, RuleSource } from './types.js';

export interface SigmaSeed extends Omit<CreateRuleInput, 'derivedFromArtifactIds'> {
  source: RuleSource;
  sourceRef: string;
  detectsTechniqueIds: string[];
}

export const SIGMA_BASELINE: SigmaSeed[] = [
  {
    kind: 'SIGMA',
    name: 'Suspicious PowerShell Encoded Command',
    description: 'Detects PowerShell processes invoked with -EncodedCommand or -enc flag — common obfuscation technique used by ransomware loaders.',
    content: `title: Suspicious PowerShell Encoded Command
id: helyx-sigma-001
status: stable
description: PowerShell with -EncodedCommand invocation
references: [https://attack.mitre.org/techniques/T1059/001/]
tags: [attack.execution, attack.t1059.001, attack.defense_evasion, attack.t1027]
logsource: { category: process_creation, product: windows }
detection:
  selection:
    Image|endswith: '\\powershell.exe'
    CommandLine|contains:
      - ' -enc '
      - ' -EncodedCommand '
      - ' -e '
  condition: selection
level: high`,
    tags: ['attack.t1059.001', 'attack.t1027', 'powershell', 'execution'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-001',
    detectsTechniqueIds: ['T1059.001', 'T1027'],
  },
  {
    kind: 'SIGMA',
    name: 'Mass File Encryption — Ransomware Indicator',
    description: 'Many file write+rename operations in short window — typical ransomware encryption pattern.',
    content: `title: Mass File Encryption Pattern
id: helyx-sigma-002
description: >100 file rename ops to non-standard extensions in 60s
tags: [attack.impact, attack.t1486]
logsource: { category: file_event, product: windows }
detection:
  selection:
    EventType: 'FileRename'
    TargetFilename|endswith:
      - '.locked'
      - '.encrypted'
      - '.crypt'
      - '.enc'
  timeframe: 60s
  condition: selection | count() > 100
level: critical`,
    tags: ['attack.t1486', 'ransomware', 'impact'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-002',
    detectsTechniqueIds: ['T1486'],
  },
  {
    kind: 'SIGMA',
    name: 'LOLBin — Rundll32 with Suspicious Args',
    description: 'rundll32.exe used to proxy execution of malicious DLLs — common LOLBins technique.',
    content: `title: Rundll32 Suspicious Invocation
id: helyx-sigma-003
tags: [attack.defense_evasion, attack.t1218.011]
logsource: { category: process_creation, product: windows }
detection:
  selection:
    Image|endswith: '\\rundll32.exe'
    CommandLine|contains:
      - 'javascript:'
      - 'shell32.dll,Control_RunDLL'
      - 'mshtml,RunHTMLApplication'
  condition: selection
level: high`,
    tags: ['attack.t1218.011', 'lolbin', 'defense_evasion'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-003',
    detectsTechniqueIds: ['T1218.011'],
  },
  {
    kind: 'SIGMA',
    name: 'Credential Access — LSASS Memory Dump',
    description: 'Process accessing LSASS memory — Mimikatz / credential theft pattern.',
    content: `title: LSASS Memory Access
id: helyx-sigma-004
tags: [attack.credential_access, attack.t1003.001]
logsource: { category: process_access, product: windows }
detection:
  selection:
    TargetImage|endswith: '\\lsass.exe'
    GrantedAccess|contains:
      - '0x1010'
      - '0x1410'
      - '0x143A'
  condition: selection
level: critical`,
    tags: ['attack.t1003.001', 'credential_access', 'mimikatz'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-004',
    detectsTechniqueIds: ['T1003.001'],
  },
  {
    kind: 'SIGMA',
    name: 'Persistence — New Scheduled Task',
    description: 'Scheduled task created via schtasks.exe — common persistence mechanism.',
    content: `title: New Scheduled Task Created
id: helyx-sigma-005
tags: [attack.persistence, attack.t1053.005]
logsource: { category: process_creation, product: windows }
detection:
  selection:
    Image|endswith: '\\schtasks.exe'
    CommandLine|contains: '/create'
  condition: selection
level: medium`,
    tags: ['attack.t1053.005', 'persistence', 'scheduled_task'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-005',
    detectsTechniqueIds: ['T1053.005'],
  },
  {
    kind: 'SIGMA',
    name: 'Lateral Movement — PsExec Service Install',
    description: 'PSEXESVC service install — psexec.exe lateral movement.',
    content: `title: PsExec Service Install
id: helyx-sigma-006
tags: [attack.lateral_movement, attack.t1021.002]
logsource: { product: windows, service: system }
detection:
  selection:
    EventID: 7045
    ServiceName: 'PSEXESVC'
  condition: selection
level: high`,
    tags: ['attack.t1021.002', 'lateral_movement', 'psexec'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-006',
    detectsTechniqueIds: ['T1021.002'],
  },
  {
    kind: 'SIGMA',
    name: 'Discovery — Net User Enumeration',
    description: 'net.exe user/group/share enumeration — recon pattern.',
    content: `title: Network Discovery via net.exe
id: helyx-sigma-007
tags: [attack.discovery, attack.t1087.001, attack.t1135]
logsource: { category: process_creation, product: windows }
detection:
  selection:
    Image|endswith: '\\net.exe'
    CommandLine|contains:
      - ' user'
      - ' group'
      - ' localgroup'
      - ' share'
  condition: selection
level: low`,
    tags: ['attack.t1087.001', 'discovery'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-007',
    detectsTechniqueIds: ['T1087.001', 'T1135'],
  },
  {
    kind: 'SIGMA',
    name: 'Defense Evasion — Disable Windows Defender',
    description: 'Tampering with Windows Defender via PowerShell or registry.',
    content: `title: Windows Defender Disabled
id: helyx-sigma-008
tags: [attack.defense_evasion, attack.t1562.001]
logsource: { product: windows, service: powershell }
detection:
  selection:
    CommandLine|contains:
      - 'Set-MpPreference -DisableRealtimeMonitoring'
      - 'Add-MpPreference -ExclusionPath'
  condition: selection
level: high`,
    tags: ['attack.t1562.001', 'defense_evasion', 'defender'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-008',
    detectsTechniqueIds: ['T1562.001'],
  },
  {
    kind: 'SIGMA',
    name: 'Command & Control — Suspicious DNS to TOR',
    description: 'DNS queries to known TOR exit nodes / .onion resolution attempts.',
    content: `title: TOR DNS Query
id: helyx-sigma-009
tags: [attack.command_and_control, attack.t1090.003]
logsource: { product: zeek, service: dns }
detection:
  selection:
    query|endswith: '.onion'
  condition: selection
level: medium`,
    tags: ['attack.t1090.003', 'c2', 'tor'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-009',
    detectsTechniqueIds: ['T1090.003'],
  },
  {
    kind: 'SIGMA',
    name: 'Initial Access — Suspicious Office Macro',
    description: 'Office app spawning powershell/cmd/wscript — macro-based initial access.',
    content: `title: Office App Suspicious Child Process
id: helyx-sigma-010
tags: [attack.initial_access, attack.t1566.001, attack.execution]
logsource: { category: process_creation, product: windows }
detection:
  parent_office:
    ParentImage|endswith:
      - '\\winword.exe'
      - '\\excel.exe'
      - '\\powerpnt.exe'
      - '\\outlook.exe'
  child_suspicious:
    Image|endswith:
      - '\\powershell.exe'
      - '\\cmd.exe'
      - '\\wscript.exe'
      - '\\cscript.exe'
      - '\\mshta.exe'
  condition: parent_office and child_suspicious
level: high`,
    tags: ['attack.t1566.001', 'initial_access', 'office_macro'],
    source: 'sigma-community',
    sourceRef: 'helyx-sigma-010',
    detectsTechniqueIds: ['T1566.001'],
  },
];
