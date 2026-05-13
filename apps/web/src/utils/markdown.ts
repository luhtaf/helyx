// H4 — markdown render with HTML sanitization. Operator-authored
// content gets parsed by `marked` then sanitized via DOMPurify so
// untrusted markdown can't smuggle <script> / on* handlers / iframes.
//
// SoT for what tags survive — keep tight to text + lists + code + links.

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Marked options — disable mangle/headerIds (legacy, removed in v12+);
// breaks=true so single-newline becomes <br> like Slack/GH discussions.
marked.setOptions({
  breaks: true,
  gfm: true,
});

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'del', 's', 'sup', 'sub',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    'a', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
  ADD_ATTR: ['target', 'rel'],
  // RETURN_TRUSTED_TYPE off so we get a plain string, not TrustedHTML.
  RETURN_TRUSTED_TYPE: false as const,
};

export function renderMarkdown(source: string): string {
  if (!source) return '';
  const raw = marked.parse(source, { async: false }) as string;
  const clean = DOMPurify.sanitize(raw, SANITIZE_CONFIG) as unknown as string;
  // Post-process anchor tags so every link is target=_blank + rel=noopener
  // — DOMPurify allows them but doesn't enforce values.
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}
