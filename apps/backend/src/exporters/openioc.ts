import { randomUUID } from 'node:crypto';
import type { HuntIoc, IocKind } from './iocs.js';

// OpenIOC 1.1 (Mandiant schema) export. One <ioc> doc, a single OR
// Indicator holding one IndicatorItem per indicator. Search terms use
// the standard MIR contexts so the file ingests into FireEye/Mandiant
// + most OpenIOC-aware tooling.

// IocKind → [Context document, search term, Content type].
const TERM: Record<IocKind, [string, string, string]> = {
  md5:      ['FileItem', 'FileItem/Md5sum', 'md5'],
  sha1:     ['FileItem', 'FileItem/Sha1sum', 'string'],
  sha256:   ['FileItem', 'FileItem/Sha256sum', 'string'],
  ip:       ['PortItem', 'PortItem/remoteIP', 'IP'],
  domain:   ['Network', 'Network/DNS', 'string'],
  url:      ['UrlHistoryItem', 'UrlHistoryItem/URL', 'string'],
  email:    ['Email', 'Email/From', 'string'],
  process:  ['ProcessItem', 'ProcessItem/name', 'string'],
  registry: ['RegistryItem', 'RegistryItem/Path', 'string'],
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildOpenIoc(
  huntName: string,
  iocs: HuntIoc[],
  tlp: string,
): string {
  const now = new Date().toISOString();
  const docId = randomUUID();
  const indicatorId = randomUUID();

  const items = iocs.map((i) => {
    const [doc, search, ctype] = TERM[i.kind];
    return [
      `      <IndicatorItem id="${randomUUID()}" condition="is">`,
      `        <Context document="${doc}" search="${xmlEscape(search)}" type="mir"/>`,
      `        <Content type="${ctype}">${xmlEscape(i.value)}</Content>`,
      `      </IndicatorItem>`,
    ].join('\n');
  }).join('\n');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ioc xmlns="http://schemas.mandiant.com/2010/ioc" id="${docId}" last-modified="${now}">`,
    `  <short_description>${xmlEscape(`Helyx Hunt: ${huntName}`)}</short_description>`,
    `  <description>${xmlEscape(`${tlp} — exported from Helyx. ${iocs.length} indicators. Handle per marking.`)}</description>`,
    `  <authored_by>Helyx</authored_by>`,
    `  <authored_date>${now}</authored_date>`,
    `  <links/>`,
    `  <definition>`,
    `    <Indicator operator="OR" id="${indicatorId}">`,
    items,
    `    </Indicator>`,
    `  </definition>`,
    `</ioc>`,
    ``,
  ].join('\n');
}
