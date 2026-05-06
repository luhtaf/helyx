export const artifactTypeDefs = /* GraphQL */ `
  enum ArtifactType { IOC FILE PROCESS NETWORK REGISTRY PERSISTENCE ACCOUNT LOG_FINDING MEMORY DETECTION_HIT NOTE }
  enum Severity { INFO LOW MEDIUM HIGH CRITICAL }
  enum Confidence { LOW MEDIUM HIGH }
  enum IocType { IP DOMAIN URL EMAIL HASH }
  enum Direction { INBOUND OUTBOUND BOTH LATERAL }
  enum NetProtocol { TCP UDP ICMP HTTP DNS }
  enum RegistryHive { HKLM HKCU HKCR HKU HKCC }
  enum RegistryAction { CREATED MODIFIED DELETED }
  enum PersistenceMechanism { SCHEDULED_TASK SERVICE STARTUP_FOLDER RUN_KEY WMI CRON SYSTEMD LAUNCHD OTHER }
  enum AccountAction { CREATED PRIVILEGE_ESCALATED DISABLED PASSWORD_CHANGED LOGIN_ANOMALY }
  enum MemoryFinding { PROCESS_INJECTION HOLLOWING SHELLCODE UNBACKED_MEMORY STRINGS_MATCH OTHER }
  enum RuleSource { SIGMA YARA WAZUH ELASTIC CUSTOM }

  interface Artifact {
    id: ID!
    caseId: ID!
    type: ArtifactType!
    observedAt: String!
    host: Asset
    severity: Severity!
    confidence: Confidence!
    notes: String
    tags: [String!]!
    addedAt: String!
  }

  type IocArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    iocType: IocType!
    value: String!
    direction: Direction
    firstSeen: String
    lastSeen: String
    source: String
  }

  type FileArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    filename: String!
    filepath: String
    md5: String
    sha1: String
    sha256: String
    sizeBytes: Int
    mime: String
    signed: Boolean
    signer: String
    behavior: [String!]!
  }

  type ProcessArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    name: String!
    pid: Int
    commandLine: String
    parentName: String
    user: String
    startedAt: String
    ttpHints: [String!]!
  }

  type NetworkArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    protocol: NetProtocol!
    srcIp: String!
    srcPort: Int
    dstIp: String!
    dstPort: Int
    direction: Direction
    bytes: Int
    connectionStartedAt: String
  }

  type RegistryArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    hive: RegistryHive!
    keyPath: String!
    valueName: String
    valueData: String
    action: RegistryAction!
  }

  type PersistenceArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    mechanism: PersistenceMechanism!
    name: String!
    target: String
    user: String
    createdAtSrc: String
  }

  type AccountArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    username: String!
    domain: String
    action: AccountAction!
    privileges: [String!]!
    sourceIp: String
  }

  type LogFindingArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    logSource: String!
    eventId: String
    timestamp: String!
    rawLine: String
    observation: String!
  }

  type MemoryArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    processName: String!
    pid: Int
    finding: MemoryFinding!
    evidence: String
    toolUsed: String
  }

  type DetectionHitArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    ruleSource: RuleSource!
    ruleId: String!
    ruleName: String!
    firedAt: String!
    count: Int
  }

  type NoteArtifact implements Artifact {
    id: ID! caseId: ID! type: ArtifactType! observedAt: String! host: Asset
    severity: Severity! confidence: Confidence! notes: String tags: [String!]! addedAt: String!
    title: String
    body: String!
    author: String!
  }

  # Inputs (one per type — verbose but explicit)
  input ArtifactBaseInput {
    observedAt: String!
    hostAssetId: ID
    severity: Severity!
    confidence: Confidence!
    notes: String
    tags: [String!]
  }

  input IocArtifactInput { base: ArtifactBaseInput!, iocType: IocType!, value: String!, direction: Direction, firstSeen: String, lastSeen: String, source: String }
  input FileArtifactInput { base: ArtifactBaseInput!, filename: String!, filepath: String, md5: String, sha1: String, sha256: String, sizeBytes: Int, mime: String, signed: Boolean, signer: String, behavior: [String!] }
  input ProcessArtifactInput { base: ArtifactBaseInput!, name: String!, pid: Int, commandLine: String, parentName: String, user: String, startedAt: String, ttpHints: [String!] }
  input NetworkArtifactInput { base: ArtifactBaseInput!, protocol: NetProtocol!, srcIp: String!, srcPort: Int, dstIp: String!, dstPort: Int, direction: Direction, bytes: Int, connectionStartedAt: String }
  input RegistryArtifactInput { base: ArtifactBaseInput!, hive: RegistryHive!, keyPath: String!, valueName: String, valueData: String, action: RegistryAction! }
  input PersistenceArtifactInput { base: ArtifactBaseInput!, mechanism: PersistenceMechanism!, name: String!, target: String, user: String, createdAtSrc: String }
  input AccountArtifactInput { base: ArtifactBaseInput!, username: String!, domain: String, action: AccountAction!, privileges: [String!], sourceIp: String }
  input LogFindingArtifactInput { base: ArtifactBaseInput!, logSource: String!, eventId: String, timestamp: String!, rawLine: String, observation: String! }
  input MemoryArtifactInput { base: ArtifactBaseInput!, processName: String!, pid: Int, finding: MemoryFinding!, evidence: String, toolUsed: String }
  input DetectionHitArtifactInput { base: ArtifactBaseInput!, ruleSource: RuleSource!, ruleId: String!, ruleName: String!, firedAt: String!, count: Int }
  input NoteArtifactInput { base: ArtifactBaseInput!, title: String, body: String!, author: ID! }

  extend type Mutation {
    createIocArtifact(caseId: ID!, input: IocArtifactInput!): IocArtifact!
    createFileArtifact(caseId: ID!, input: FileArtifactInput!): FileArtifact!
    createProcessArtifact(caseId: ID!, input: ProcessArtifactInput!): ProcessArtifact!
    createNetworkArtifact(caseId: ID!, input: NetworkArtifactInput!): NetworkArtifact!
    createRegistryArtifact(caseId: ID!, input: RegistryArtifactInput!): RegistryArtifact!
    createPersistenceArtifact(caseId: ID!, input: PersistenceArtifactInput!): PersistenceArtifact!
    createAccountArtifact(caseId: ID!, input: AccountArtifactInput!): AccountArtifact!
    createLogFindingArtifact(caseId: ID!, input: LogFindingArtifactInput!): LogFindingArtifact!
    createMemoryArtifact(caseId: ID!, input: MemoryArtifactInput!): MemoryArtifact!
    createDetectionHitArtifact(caseId: ID!, input: DetectionHitArtifactInput!): DetectionHitArtifact!
    createNoteArtifact(caseId: ID!, input: NoteArtifactInput!): NoteArtifact!

    bulkCreateIocArtifacts(caseId: ID!, base: ArtifactBaseInput!, values: [String!]!): [IocArtifact!]!
    importWazuhAlert(caseId: ID!, alertJson: String!): [Artifact!]!

    deleteArtifact(id: ID!): Boolean!
  }
`;
