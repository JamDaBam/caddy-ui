/** Guided editor schema for the narrow reverse-proxy entry shape the form can round-trip safely. */
export interface StructuredEntryFields {
  hostnames: string[];
  acmeDirectoryUrl: string;
  tlsEmail: string;
  trustedRootCaPath: string;
  reverseProxyTarget: string;
  tlsInsecureSkipVerify: boolean;
}

/** Parser result reports whether an entry can stay in guided mode or must fall back to raw editing. */
export interface StructuredEntryParseResult {
  supported: boolean;
  fields: StructuredEntryFields | null;
  errors: string[];
}

/** Builder result used when the guided form regenerates raw directives for storage. */
export interface BuildStructuredRawResult {
  valid: boolean;
  label: string;
  raw: string;
  errors: string[];
}

export const emptyStructuredEntryFields: StructuredEntryFields = {
  hostnames: [],
  acmeDirectoryUrl: "",
  tlsEmail: "",
  trustedRootCaPath: "",
  reverseProxyTarget: "",
  tlsInsecureSkipVerify: false
};

/** Shared blank state for new guided entries and unsupported-entry recovery paths. */
function createEmptyFields(): StructuredEntryFields {
  return {
    hostnames: [],
    acmeDirectoryUrl: "",
    tlsEmail: "",
    trustedRootCaPath: "",
    reverseProxyTarget: "",
    tlsInsecureSkipVerify: false
  };
}

function normalizeHostnames(label: string): { hostnames: string[]; errors: string[] } {
  const trimmed = label.trim();
  if (!trimmed) {
    return { hostnames: [], errors: [] };
  }

  const parts = label.split(",").map((part) => part.trim());
  const hostnames = parts.filter((part) => part.length > 0);
  const errors = hostnames.length === parts.length ? [] : ["Hostnames must be comma-separated values."];
  return { hostnames, errors };
}

function stripComments(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      let inQuote = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === "\"" && line[index - 1] !== "\\") {
          inQuote = !inQuote;
        }
        if (char === "#" && !inQuote) {
          return line.slice(0, index);
        }
      }

      return line;
    })
    .join("\n");
}

function countBraces(value: string): number {
  let depth = 0;
  let inQuote = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"" && value[index - 1] !== "\\") {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
    }
  }

  return depth;
}

/** Splits only top-level directives; nested or unbalanced shapes are rejected back to raw editing. */
function splitTopLevelDirectives(raw: string): { chunks: string[]; error?: string } {
  const stripped = stripComments(raw);
  const lines = stripped
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { chunks: [] };
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let depth = 0;

  for (const line of lines) {
    current.push(line);
    depth += countBraces(line);
    if (depth < 0) {
      return { chunks: [], error: "Unbalanced braces." };
    }
    if (depth === 0) {
      chunks.push(current.join("\n"));
      current = [];
    }
  }

  if (depth !== 0 || current.length > 0) {
    return { chunks: [], error: "Unbalanced braces." };
  }

  return { chunks };
}

/** Tokenizer is intentionally small and supports only whitespace, quotes, and brace-aware guided parsing. */
function tokenize(body: string): string[] {
  const tokens: string[] = [];
  const source = stripComments(body);
  let current = "";
  let inQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (char === "\"" && source[index - 1] !== "\\") {
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (!inQuote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    if (!inQuote && (char === "{" || char === "}")) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      tokens.push(char);
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/** Supports only `tls { issuer acme { ... } }`, which matches the current guided form fields. */
function parseTlsChunk(chunk: string, fields: StructuredEntryFields): string[] {
  const match = chunk.match(/^tls\s*\{([\s\S]*)\}$/);
  if (!match) {
    return ["Unsupported tls block shape."];
  }

  const tokens = tokenize(match[1]);
  if (tokens.length === 0) {
    return [];
  }

  let index = 0;
  if (tokens[index] !== "issuer" || tokens[index + 1] !== "acme" || tokens[index + 2] !== "{") {
    return ["Only tls issuer acme blocks are supported in the guided editor."];
  }
  index += 3;

  while (index < tokens.length && tokens[index] !== "}") {
    const name = tokens[index];
    const value = tokens[index + 1];
    if (!value || value === "{" || value === "}") {
      return ["Unsupported tls issuer directive."];
    }

    if (name === "dir") {
      fields.acmeDirectoryUrl = value;
    } else if (name === "email") {
      fields.tlsEmail = value;
    } else if (name === "trusted_roots") {
      fields.trustedRootCaPath = value;
    } else {
      return ["Only dir, email, and trusted_roots are supported inside tls issuer acme blocks."];
    }
    index += 2;
  }

  if (tokens[index] !== "}" || index !== tokens.length - 1) {
    return ["Unsupported tls block shape."];
  }

  return [];
}

/** Supports only a single upstream plus the optional `transport http { tls_insecure_skip_verify }` block. */
function parseReverseProxyChunk(chunk: string, fields: StructuredEntryFields): string[] {
  const match = chunk.match(/^reverse_proxy\s+(\S+)(?:\s*\{([\s\S]*)\})?$/);
  if (!match) {
    return ["Unsupported reverse_proxy block shape."];
  }

  fields.reverseProxyTarget = match[1];
  const blockBody = match[2]?.trim();
  if (!blockBody) {
    return [];
  }

  const tokens = tokenize(blockBody);
  if (
    tokens.length === 5 &&
    tokens[0] === "transport" &&
    tokens[1] === "http" &&
    tokens[2] === "{" &&
    tokens[3] === "tls_insecure_skip_verify" &&
    tokens[4] === "}"
  ) {
    fields.tlsInsecureSkipVerify = true;
    return [];
  }

  return ["Only transport http { tls_insecure_skip_verify } is supported inside reverse_proxy blocks."];
}

/** Attempts a lossless parse into guided fields and deliberately rejects patterns the form cannot preserve. */
export function parseStructuredEntry(label: string, raw: string): StructuredEntryParseResult {
  const fields = createEmptyFields();
  const { hostnames, errors: hostnameErrors } = normalizeHostnames(label);
  fields.hostnames = hostnames;

  const { chunks, error } = splitTopLevelDirectives(raw);
  if (error) {
    return { supported: false, fields: null, errors: [error] };
  }

  const errors = [...hostnameErrors];
  let seenTls = false;
  let seenReverseProxy = false;

  for (const chunk of chunks) {
    if (chunk.startsWith("tls")) {
      if (seenTls) {
        return { supported: false, fields: null, errors: ["Multiple tls blocks are not supported in the guided editor."] };
      }
      seenTls = true;
      const parseErrors = parseTlsChunk(chunk, fields);
      if (parseErrors.length > 0) {
        return { supported: false, fields: null, errors: parseErrors };
      }
      continue;
    }

    if (chunk.startsWith("reverse_proxy")) {
      if (seenReverseProxy) {
        return {
          supported: false,
          fields: null,
          errors: ["Multiple reverse_proxy directives are not supported in the guided editor."]
        };
      }
      seenReverseProxy = true;
      const parseErrors = parseReverseProxyChunk(chunk, fields);
      if (parseErrors.length > 0) {
        return { supported: false, fields: null, errors: parseErrors };
      }
      continue;
    }

    return {
      supported: false,
      fields: null,
      errors: ["This entry contains directives outside the supported guided pattern."]
    };
  }

  return {
    supported: true,
    fields,
    errors
  };
}

/** Rebuilds the supported directive shape from form fields so saved entries still store raw Caddyfile text. */
export function buildStructuredRaw(fields: StructuredEntryFields): BuildStructuredRawResult {
  const hostnames = fields.hostnames.map((hostname) => hostname.trim()).filter((hostname) => hostname.length > 0);
  const acmeDirectoryUrl = fields.acmeDirectoryUrl.trim();
  const tlsEmail = fields.tlsEmail.trim();
  const trustedRootCaPath = fields.trustedRootCaPath.trim();
  const reverseProxyTarget = fields.reverseProxyTarget.trim();
  const tlsInsecureSkipVerify = Boolean(fields.tlsInsecureSkipVerify && reverseProxyTarget);

  const errors: string[] = [];
  if (hostnames.length === 0) {
    errors.push("At least one hostname is required.");
  }
  if (!acmeDirectoryUrl) {
    errors.push("ACME directory URL is required.");
  }
  if (!reverseProxyTarget) {
    errors.push("Reverse proxy target is required.");
  }

  const directives: string[] = [];
  if (acmeDirectoryUrl || tlsEmail || trustedRootCaPath) {
    const issuerLines = [`dir ${acmeDirectoryUrl}`];
    if (tlsEmail) {
      issuerLines.push(`email ${tlsEmail}`);
    }
    if (trustedRootCaPath) {
      issuerLines.push(`trusted_roots ${trustedRootCaPath}`);
    }

    directives.push([
      "tls {",
      "  issuer acme {",
      ...issuerLines.map((line) => `    ${line}`),
      "  }",
      "}"
    ].join("\n"));
  }

  if (reverseProxyTarget) {
    if (tlsInsecureSkipVerify) {
      directives.push([
        `reverse_proxy ${reverseProxyTarget} {`,
        "  transport http {",
        "    tls_insecure_skip_verify",
        "  }",
        "}"
      ].join("\n"));
    } else {
      directives.push(`reverse_proxy ${reverseProxyTarget}`);
    }
  }

  return {
    valid: errors.length === 0,
    label: hostnames.join(", "),
    raw: directives.join("\n\n"),
    errors
  };
}
