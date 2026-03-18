import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileUrl, fileName } = await req.json();

    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "fileUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = (fileName || fileUrl).split('.').pop()?.toLowerCase() || '';
    
    // Download the file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }

    let content = '';

    if (ext === 'txt' || ext === 'md' || ext === 'csv') {
      // Plain text files - read directly
      content = await response.text();
    } else if (ext === 'pdf') {
      // PDF - extract text using basic parsing
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      
      // Extract readable text between stream markers
      const textParts: string[] = [];
      
      // Method 1: Extract text between parentheses in PDF text objects (Tj/TJ operators)
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let match;
      while ((match = tjRegex.exec(text)) !== null) {
        const decoded = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/\\t/g, ' ')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (decoded.trim()) textParts.push(decoded);
      }

      // Method 2: TJ arrays
      const tjArrayRegex = /\[((?:\([^)]*\)|[^])*?)\]\s*TJ/g;
      while ((match = tjArrayRegex.exec(text)) !== null) {
        const inner = match[1];
        const partRegex = /\(([^)]*)\)/g;
        let partMatch;
        let line = '';
        while ((partMatch = partRegex.exec(inner)) !== null) {
          line += partMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\');
        }
        if (line.trim()) textParts.push(line);
      }

      // Method 3: BT...ET blocks with plain text
      if (textParts.length === 0) {
        const btRegex = /BT\s([\s\S]*?)ET/g;
        while ((match = btRegex.exec(text)) !== null) {
          const block = match[1];
          const innerTj = /\(([^)]+)\)/g;
          let innerMatch;
          while ((innerMatch = innerTj.exec(block)) !== null) {
            if (innerMatch[1].trim()) textParts.push(innerMatch[1]);
          }
        }
      }

      if (textParts.length > 0) {
        content = textParts.join(' ').replace(/\s+/g, ' ').trim();
      } else {
        // Fallback: extract any readable ASCII sequences
        const readable: string[] = [];
        let current = '';
        for (let i = 0; i < bytes.length; i++) {
          const byte = bytes[i];
          if (byte >= 32 && byte < 127) {
            current += String.fromCharCode(byte);
          } else {
            if (current.length > 20) readable.push(current.trim());
            current = '';
          }
        }
        if (current.length > 20) readable.push(current.trim());
        content = readable.join(' ').substring(0, 50000);
      }
    } else {
      // Unsupported format - try as text
      content = await response.text();
    }

    // Limit content size (max ~50k chars to avoid huge DB entries)
    if (content.length > 50000) {
      content = content.substring(0, 50000) + '\n\n[... conteúdo truncado - arquivo muito grande]';
    }

    return new Response(JSON.stringify({ content, chars: content.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error("extract-file-content error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
