// cytoscape-fcose ships no type declarations. Minimal shim so the import
// + cytoscape.use() call type-checks. The actual layout options are passed
// as `Record<string, unknown>` (see useCytoscape.ts INCREMENTAL_LAYOUT_OPTS)
// and validated at runtime by fcose itself.
declare module 'cytoscape-fcose' {
  import type { Ext } from 'cytoscape';
  const fcose: Ext;
  export default fcose;
}
