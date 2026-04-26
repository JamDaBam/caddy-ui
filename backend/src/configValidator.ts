import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { BackendError } from "./backendTypes.js";
import { CommandExecutionError, runCommand, summarizeCommandOutput } from "./commandRunner.js";

/** Validation output is passed through so the UI can show Caddy's explanation directly. */
export interface ValidationResult {
  output: string;
}

/** Validator abstraction keeps apply orchestration independent from how config checks are performed. */
export interface ConfigValidator {
  validate(candidate: string, sourcePath: string): Promise<ValidationResult>;
}

/**
 * Some deployments reference trusted root files that only exist on the live host.
 * A short-lived placeholder keeps `caddy validate` focused on syntax and structure in remote setups.
 */
const dummyTrustedRootCertificate = `-----BEGIN CERTIFICATE-----
MIIDCzCCAfOgAwIBAgIUWCLIxcJKbBzuwUK2/tDqtAnE9Y0wDQYJKoZIhvcNAQEL
BQAwFTETMBEGA1UEAwwKZHVtbXktcm9vdDAeFw0yNjA0MjYwOTQyMDVaFw0yNjA0
MjcwOTQyMDVaMBUxEzARBgNVBAMMCmR1bW15LXJvb3QwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQC7OXO/wt51+kLXcDm2lFGDwBjB3hzvkMmHwpNH5ZbW
ugRUmh3FtW7fRzm9DTy3iZ3xNLtLAx47PpZ1zvtk0yxWXVOaN+NyRgYPuSQ+EjHa
5yIoHSLH47PLGGDvlDHy2EXZy8MlFI06C0+z/HB3MLiUl+hJJZfwQm6ILWFTBm6T
HDbkbryfHkMCeeXg+s2ZPxXpaaHxSucHSyeJE88Vnr/9K0CyZvjaFNAwg4vW7vU8
/Rj30x9W4DvSMZ4wC/oZ35v4taC2gHAGI+ZYBQ6pTasmiCV+nVYyrQXJ1sfWKyTz
z6n4G1nWhskmfL5b0IO9PraTsOHyUg36xC4okbMSMry7AgMBAAGjUzBRMB0GA1Ud
DgQWBBSp31QUnNWsqNS8b8L1f0fsAA1ukjAfBgNVHSMEGDAWgBSp31QUnNWsqNS8
b8L1f0fsAA1ukjAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQA5
ZGVbQ7bXQ5rmCGcVZon43+vpyzoVmOQLEpHqEZzlbwR4sdST44vhuiDWpi4NQnEn
u3hfgFuB0yPlU2utq72E95ONWfW1M33ddUZ87bQPwU1qoKhKy2VeyQkY5nd9qr6i
Rz3zf978DD0ciVaWevK+6zHLeDNBFVKnbvpkHcSayeEJaHnUd6xxHV660d6mimo7
iY139BKUa1g7HiY0OAvyrNrexRurSb8xa/yNMrjYO2TNjV06momp+UX1ftegPB5H
0/VsXZ/unDns04i/gJamprdnG4nW8odAQE2H6Uw+dS5UjfNsK/8GjbdSymDyoT5G
hXF3MN9LkLbUGZMyTF8b
-----END CERTIFICATE-----
`;

function isMissingCommandError(error: CommandExecutionError, commandName: string) {
  return (
    error.message.includes("ENOENT") &&
    (error.message.includes(`spawn ${commandName}`) || error.message.includes(`"${commandName}"`))
  );
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Rewrites missing trusted_roots paths to temporary placeholder files so validation can still run locally. */
async function materializeMissingTrustedRoots(candidate: string, tempDir: string) {
  const replacements = new Map<string, string>();
  const lines = await Promise.all(
    candidate.split("\n").map(async (line, index) => {
      const match = line.match(/^(\s*trusted_roots\s+)(?:"([^"\n]+)"|([^\s#]+))(.*)$/);
      if (!match) {
        return line;
      }

      const [, prefix, quotedPath, barePath, suffix] = match;
      const originalPath = quotedPath ?? barePath;
      if (!originalPath || await pathExists(originalPath)) {
        return line;
      }

      let replacementPath = replacements.get(originalPath);
      if (!replacementPath) {
        replacementPath = join(tempDir, `trusted-root-${index}.pem`);
        await writeFile(replacementPath, dummyTrustedRootCertificate, "utf8");
        replacements.set(originalPath, replacementPath);
      }

      return `${prefix}${replacementPath}${suffix}`;
    })
  );

  return lines.join("\n");
}

/** Default validator that shells out to `caddy validate` against a temporary candidate file. */
export class CommandConfigValidator implements ConfigValidator {
  private commandTemplate: string;

  constructor(commandTemplate: string) {
    this.commandTemplate = commandTemplate;
  }

  async validate(candidate: string, sourcePath: string): Promise<ValidationResult> {
    const tempDir = await mkdtemp(join(tmpdir(), "caddy-ui-validate-"));
    const tempConfigPath = join(tempDir, basename(sourcePath));

    try {
      const preparedCandidate = await materializeMissingTrustedRoots(candidate, tempDir);
      await writeFile(tempConfigPath, preparedCandidate, "utf8");
      const result = await runCommand(this.commandTemplate, tempConfigPath);
      return { output: summarizeCommandOutput(result.stdout, result.stderr) };
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        if (isMissingCommandError(error, "caddy")) {
          throw new BackendError(
            "VALIDATION_COMMAND_MISSING",
            "Validation could not start because the Caddy executable is not available. Install Caddy in the container or set CADDY_VALIDATE_COMMAND to the correct path."
          );
        }

        const output = summarizeCommandOutput(error.stdout, error.stderr);
        throw new BackendError("VALIDATION_FAILED", output ? `Validation failed. ${output}` : "Validation failed.");
      }

      throw new BackendError(
        "VALIDATION_FAILED",
        error instanceof Error ? error.message : "Validation failed."
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
