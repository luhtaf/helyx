import type { StylesheetStyle } from 'cytoscape';

// Hard-coded hex values mirror :root tokens in src/assets/main.css. Cytoscape
// renders to canvas, not DOM, so it can't read CSS custom properties. If the
// design tokens shift, update both places (or migrate to a runtime lookup
// later — premature optimization for a 5-color palette).
const C = {
  base:        '#14120e',
  surface:     '#1d1a14',
  ink:         '#e8e3d6',
  inkMid:      '#b3a994',
  inkDim:      '#8a8273',
  inkFaint:    '#5a5447',
  rule:        '#1d1a14',
  ruleStrong:  '#2a2519',
  signal:      '#c8b07a',
  sevCrit:     '#e07254',
  sevHigh:     '#d49656',
  sevMed:      '#c5b572',
  sevLow:      '#7d9474',
  sevNone:     '#5a5447',
} as const;

/**
 * Stylesheet keyed by data.type and data.severity (for CVE/Case nodes).
 * Cytoscape selectors use brackets: `[type = "Stakeholder"]`.
 *
 * Conventions:
 *   - Node body color = type color
 *   - Border = signal gold for selected, ruleStrong otherwise
 *   - Label = monospace, ink for primary, inkFaint at zoom-out
 *   - Edge stroke = severity-tinted for AFFECTED_BY/ATTRIBUTED_CVE, neutral for structural
 */
export const HELYX_STYLESHEET: StylesheetStyle[] = [
  // ---------- node defaults ----------
  {
    selector: 'node',
    style: {
      'background-color': C.surface,
      'border-width': 1,
      'border-color': C.ruleStrong,
      label: 'data(label)',
      'font-family': "'JetBrains Mono', monospace",
      'font-size': 11,
      color: C.ink,
      'text-valign': 'bottom',
      'text-margin-y': 6,
      'text-wrap': 'ellipsis',
      'text-max-width': '140px',
      width: 32,
      height: 32,
    },
  },
  // ---------- per-type ----------
  {
    selector: 'node[type = "Stakeholder"]',
    style: {
      shape: 'round-rectangle',
      'background-color': C.signal,
      width: 38,
      height: 32,
    },
  },
  {
    selector: 'node[type = "Asset"]',
    style: {
      shape: 'hexagon',
      'background-color': C.inkMid,
      color: C.ink,
    },
  },
  {
    selector: 'node[type = "CVE"]',
    style: {
      shape: 'diamond',
      'background-color': C.sevNone,
      width: 30,
      height: 30,
    },
  },
  {
    selector: 'node[type = "CVE"][severity = "CRITICAL"]',
    style: { 'background-color': C.sevCrit },
  },
  {
    selector: 'node[type = "CVE"][severity = "HIGH"]',
    style: { 'background-color': C.sevHigh },
  },
  {
    selector: 'node[type = "CVE"][severity = "MEDIUM"]',
    style: { 'background-color': C.sevMed },
  },
  {
    selector: 'node[type = "CVE"][severity = "LOW"]',
    style: { 'background-color': C.sevLow },
  },
  {
    selector: 'node[type = "Case"]',
    style: {
      shape: 'round-rectangle',
      'background-color': C.inkFaint,
    },
  },
  {
    selector: 'node[type = "Case"][status = "ACTIVE"]',
    style: { 'background-color': C.sevHigh },
  },
  {
    selector: 'node[type = "Sektor"]',
    style: {
      shape: 'round-rectangle',
      'background-color': C.inkFaint,
      color: C.inkMid,
    },
  },
  {
    selector: 'node[type = "CWE"]',
    style: {
      shape: 'tag',
      'background-color': C.inkFaint,
      color: C.inkMid,
    },
  },
  // ---------- selection ----------
  {
    selector: 'node:selected',
    style: {
      'border-width': 2,
      'border-color': C.signal,
      'overlay-opacity': 0,
    },
  },
  {
    selector: 'node:locked',
    style: {
      'border-style': 'dashed',
      'border-color': C.signal,
    },
  },
  // ---------- edge defaults ----------
  {
    selector: 'edge',
    style: {
      width: 1,
      'line-color': C.ruleStrong,
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': C.ruleStrong,
      'arrow-scale': 0.8,
      label: '',
      'font-size': 9,
      color: C.inkFaint,
      'font-family': "'JetBrains Mono', monospace",
    },
  },
  // ---------- per-edge-type ----------
  {
    selector: 'edge[edgeType = "OWNS"]',
    style: { 'line-color': C.inkFaint, 'target-arrow-color': C.inkFaint },
  },
  {
    selector: 'edge[edgeType = "IN_SEKTOR"]',
    style: { 'line-color': C.inkFaint, 'target-arrow-color': C.inkFaint, 'line-style': 'dashed' },
  },
  {
    selector: 'edge[edgeType = "AFFECTED_BY"]',
    style: { 'line-color': C.sevHigh, 'target-arrow-color': C.sevHigh, width: 1.5 },
  },
  {
    selector: 'edge[edgeType = "ATTRIBUTED_CVE"]',
    style: { 'line-color': C.sevMed, 'target-arrow-color': C.sevMed, 'line-style': 'dashed', width: 1.2 },
  },
  {
    selector: 'edge[edgeType = "TARGETED_BY"]',
    style: { 'line-color': C.signal, 'target-arrow-color': C.signal },
  },
  // ---------- hover label reveal ----------
  {
    selector: 'edge:active, edge:selected',
    style: { label: 'data(label)' },
  },
];
