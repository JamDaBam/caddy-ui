import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { BackendError } from "./backendTypes.js";
import { CommandExecutionError, runCommand, summarizeCommandOutput } from "./commandRunner.js";

export interface ValidationResult {
  output: string;
}

export interface ConfigValidator {
  validate(candidate: string, sourcePath: string): Promise<ValidationResult>;
}

function isMissingCommandError(error: CommandExecutionError, commandName: string) {
  return (
    error.message.includes("ENOENT") &&
    (error.message.includes(`spawn ${commandName}`) || error.message.includes(`"${commandName}"`))
  );
}

export class CommandConfigValidator implements ConfigValidator {
  private commandTemplate: string;

  constructor(commandTemplate: string) {
    this.commandTemplate = commandTemplate;
  }

  async validate(candidate: string, sourcePath: string): Promise<ValidationResult> {
    const tempDir = await mkdtemp(join(tmpdir(), "caddy-ui-validate-"));
    const tempConfigPath = join(tempDir, basename(sourcePath));

    try {
      await writeFile(tempConfigPath, candidate, "utf8");
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
