import type { CaddyEntry, EntryWarning } from "@caddy-ui/shared";

export interface SiteSegment {
  type: "site";
  id: string;
  header: string;
  body: string;
  entry: CaddyEntry;
}

export interface RawSegment {
  type: "raw";
  raw: string;
}

export type CaddySegment = SiteSegment | RawSegment;

export interface ParsedCaddyfile {
  segments: CaddySegment[];
  entries: CaddyEntry[];
  warnings: EntryWarning[];
}

function isWhitespaceOnly(value: string): boolean {
  return value.trim().length === 0;
}

function countUnescapedQuotes(line: string): number {
  let quotes = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && line[i - 1] !== "\\") {
      quotes += 1;
    }
  }
  return quotes;
}

function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith("#");
}

function looksLikeTopLevelDirective(header: string): boolean {
  const trimmed = header.trim();
  if (!trimmed) {
    return false;
  }

  const firstToken = trimmed.split(/\s+/)[0];
  return (
    firstToken.startsWith("(") ||
    firstToken === "import" ||
    firstToken === "handle_errors" ||
    firstToken === "log" ||
    firstToken === "storage" ||
    firstToken === "admin" ||
    firstToken === "acme_ca" ||
    firstToken === "email" ||
    firstToken === "servers" ||
    firstToken === "grace_period" ||
    firstToken === "shutdown_delay" ||
    firstToken === "auto_https" ||
    firstToken === "http_port" ||
    firstToken === "https_port" ||
    firstToken === "default_bind" ||
    firstToken === "default_sni"
  );
}

function normalizeBody(body: string): string {
  const trimmed = body.replace(/^\n+/, "").replace(/\s+$/, "");
  return trimmed.length > 0 ? `${trimmed}\n` : "";
}

function stripCommonIndent(body: string): string {
  const normalized = normalizeBody(body).replace(/\n$/, "");
  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  const indentLengths = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match = line.match(/^[\t ]*/);
      return match?.[0].length ?? 0;
    });

  const commonIndent = indentLengths.length > 0 ? Math.min(...indentLengths) : 0;
  if (commonIndent === 0) {
    return normalized;
  }

  return lines.map((line) => line.slice(commonIndent)).join("\n");
}

export function renderSiteBlock(header: string, body: string): string {
  const normalizedHeader = header.trim();
  const normalizedBody = normalizeBody(body);
  if (normalizedBody.length === 0) {
    return `${normalizedHeader} {\n}\n`;
  }

  const indentedBody = normalizedBody
    .split("\n")
    .filter((line, index, lines) => !(index === lines.length - 1 && line === ""))
    .map((line) => `\t${line}`)
    .join("\n");

  return `${normalizedHeader} {\n${indentedBody}\n}\n`;
}

function parseHeaderLine(header: string): { label: string; matcher: string } {
  const trimmed = header.trim();
  return {
    label: trimmed,
    matcher: trimmed
  };
}

function buildEntry(id: string, order: number, header: string, body: string): CaddyEntry {
  const parsedHeader = parseHeaderLine(header);
  return {
    id,
    label: parsedHeader.label,
    matcher: parsedHeader.matcher,
    raw: stripCommonIndent(body),
    order,
    isValidParse: true,
    warnings: []
  };
}

export function parseCaddyfile(source: string): ParsedCaddyfile {
  const segments: CaddySegment[] = [];
  const warnings: EntryWarning[] = [];
  let rawBuffer = "";
  let i = 0;
  let siteIndex = 0;

  while (i < source.length) {
    const lineStart = i;
    const nextNewline = source.indexOf("\n", i);
    const lineEnd = nextNewline === -1 ? source.length : nextNewline + 1;
    const line = source.slice(lineStart, lineEnd);
    const trimmed = line.trim();

    if (trimmed === "" || isCommentLine(line)) {
      rawBuffer += line;
      i = lineEnd;
      continue;
    }

    if (trimmed === "{") {
      const blockStart = lineStart;
      let depth = 1;
      i = lineEnd;
      while (i < source.length && depth > 0) {
        const nestedNewline = source.indexOf("\n", i);
        const nestedEnd = nestedNewline === -1 ? source.length : nestedNewline + 1;
        const nestedLine = source.slice(i, nestedEnd);
        if (!isCommentLine(nestedLine)) {
          depth += (nestedLine.match(/{/g) ?? []).length;
          depth -= (nestedLine.match(/}/g) ?? []).length;
        }
        i = nestedEnd;
      }
      rawBuffer += source.slice(blockStart, i);
      continue;
    }

    let headerStart = lineStart;
    let headerEnd = lineEnd;
    let headerText = line;
    let quoteBalance = countUnescapedQuotes(line) % 2;

    while (
      i < source.length &&
      !headerText.includes("{") &&
      (quoteBalance === 1 || headerText.trimEnd().endsWith(","))
    ) {
      i = headerEnd;
      const continuedNewline = source.indexOf("\n", i);
      headerEnd = continuedNewline === -1 ? source.length : continuedNewline + 1;
      const continuedLine = source.slice(i, headerEnd);
      headerText += continuedLine;
      quoteBalance = (quoteBalance + countUnescapedQuotes(continuedLine)) % 2;
    }

    if (!headerText.includes("{")) {
      rawBuffer += source.slice(headerStart, headerEnd);
      i = headerEnd;
      continue;
    }

    const braceIndex = headerText.indexOf("{");
    const header = headerText.slice(0, braceIndex).trim();
    if (!header || looksLikeTopLevelDirective(header)) {
      let depth = 1;
      i = headerStart + braceIndex + 1;
      while (i < source.length && depth > 0) {
        const char = source[i];
        if (char === "{") {
          depth += 1;
        } else if (char === "}") {
          depth -= 1;
        }
        i += 1;
      }
      while (i < source.length && source[i] !== "\n") {
        i += 1;
      }
      if (i < source.length) {
        i += 1;
      }
      rawBuffer += source.slice(headerStart, i);
      continue;
    }

    if (!isWhitespaceOnly(rawBuffer)) {
      segments.push({ type: "raw", raw: rawBuffer });
      rawBuffer = "";
    } else if (rawBuffer.length > 0) {
      segments.push({ type: "raw", raw: rawBuffer });
      rawBuffer = "";
    }

    let bodyStart = headerStart + braceIndex + 1;
    let depth = 1;
    let cursor = bodyStart;
    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      cursor += 1;
    }

    const body = source.slice(bodyStart, cursor - 1);
    while (cursor < source.length && source[cursor] !== "\n") {
      cursor += 1;
    }
    if (cursor < source.length) {
      cursor += 1;
    }

    const id = `entry-${siteIndex + 1}`;
    const entry = buildEntry(id, siteIndex, header, body);
    segments.push({
      type: "site",
      id,
      header: entry.label,
      body: entry.raw,
      entry
    });
    siteIndex += 1;
    i = cursor;
  }

  if (rawBuffer.length > 0) {
    segments.push({ type: "raw", raw: rawBuffer });
  }

  return {
    segments,
    entries: segments
      .filter((segment): segment is SiteSegment => segment.type === "site")
      .map((segment) => segment.entry),
    warnings
  };
}

export function rebuildCaddyfile(segments: CaddySegment[]): string {
  const rendered = segments.map((segment) => {
    if (segment.type === "raw") {
      return segment.raw;
    }

    return renderSiteBlock(segment.header, segment.body);
  });

  return rendered.join("").replace(/\s+$/, "\n");
}
