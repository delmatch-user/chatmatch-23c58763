import React from 'react';

/**
 * Parses WhatsApp-style formatting and returns React elements.
 * Supports: *bold*, _italic_, ~strikethrough~, ```monospace```
 */
export function formatWhatsAppText(text: string): React.ReactNode {
  if (!text) return text;

  // Process ```monospace``` blocks first (they can contain other markers)
  const parts: React.ReactNode[] = [];
  const monoRegex = /```([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = monoRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...parseInline(text.slice(lastIndex, match.index)));
    }
    parts.push(
      <code key={`mono-${match.index}`} className="bg-muted px-1.5 py-0.5 rounded text-[0.85em] font-mono">
        {match[1]}
      </code>
    );
    lastIndex = monoRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...parseInline(text.slice(lastIndex)));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function parseInline(text: string): React.ReactNode[] {
  // Combined regex for *bold*, _italic_, ~strikethrough~
  // Uses negative lookbehind/ahead to avoid matching inside words for underscore
  const inlineRegex = /\*([^\s*](?:[^*]*[^\s*])?)\*|(?<!\w)_([^\s_](?:[^_]*[^\s_])?)_(?!\w)|~([^\s~](?:[^~]*[^\s~])?)~/g;
  
  const results: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = inlineRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      results.push(text.slice(lastIdx, m.index));
    }

    if (m[1] !== undefined) {
      results.push(<strong key={`b-${m.index}`}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      results.push(<em key={`i-${m.index}`}>{m[2]}</em>);
    } else if (m[3] !== undefined) {
      results.push(<s key={`s-${m.index}`}>{m[3]}</s>);
    }

    lastIdx = inlineRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    results.push(text.slice(lastIdx));
  }

  return results.length > 0 ? results : [text];
}
