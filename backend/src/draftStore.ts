import { readFile } from "node:fs/promises";

import type { CaddyEntry, EntryInput } from "@caddy-ui/shared";

import { parseCaddyfile, rebuildCaddyfile, type CaddySegment } from "./caddyfile.js";

export interface DraftSnapshot {
  entries: CaddyEntry[];
  segments: CaddySegment[];
  dirty: boolean;
  sourcePath: string;
}

export class DraftStore {
  private sourcePath: string;
  private draftSegments: CaddySegment[] | null = null;
  private dirty = false;

  constructor(sourcePath: string) {
    this.sourcePath = sourcePath;
  }

  async getSnapshot(): Promise<DraftSnapshot> {
    if (this.draftSegments) {
      return {
        entries: this.draftSegments
          .filter((segment): segment is Extract<CaddySegment, { type: "site" }> => segment.type === "site")
          .map((segment) => segment.entry),
        segments: this.draftSegments,
        dirty: this.dirty,
        sourcePath: this.sourcePath
      };
    }

    const parsed = parseCaddyfile(await readFile(this.sourcePath, "utf8"));
    return {
      entries: parsed.entries,
      segments: parsed.segments,
      dirty: false,
      sourcePath: this.sourcePath
    };
  }

  private async ensureDraftSegments(): Promise<CaddySegment[]> {
    if (this.draftSegments) {
      return this.draftSegments;
    }

    const parsed = parseCaddyfile(await readFile(this.sourcePath, "utf8"));
    this.draftSegments = parsed.segments;
    return this.draftSegments;
  }

  private syncEntries(segments: CaddySegment[]): void {
    let order = 0;
    for (const segment of segments) {
      if (segment.type === "site") {
        segment.entry.order = order;
        segment.entry.id = `entry-${order + 1}`;
        segment.id = segment.entry.id;
        order += 1;
      }
    }
  }

  async create(input: EntryInput): Promise<DraftSnapshot> {
    const segments = await this.ensureDraftSegments();
    const nextId = `entry-${segments.filter((segment) => segment.type === "site").length + 1}`;
    segments.push({
      type: "site",
      id: nextId,
      header: input.label,
      body: input.raw,
      entry: {
        id: nextId,
        label: input.label,
        matcher: input.matcher ?? input.label,
        raw: input.raw,
        order: 0,
        isValidParse: true,
        warnings: []
      }
    });
    this.syncEntries(segments);
    this.dirty = true;
    return this.getSnapshot();
  }

  async update(id: string, input: EntryInput): Promise<DraftSnapshot | null> {
    const segments = await this.ensureDraftSegments();
    const segment = segments.find(
      (item): item is Extract<CaddySegment, { type: "site" }> => item.type === "site" && item.id === id
    );
    if (!segment) {
      return null;
    }

    segment.header = input.label;
    segment.body = input.raw;
    segment.entry.label = input.label;
    segment.entry.matcher = input.matcher ?? input.label;
    segment.entry.raw = input.raw;
    this.syncEntries(segments);
    this.dirty = true;
    return this.getSnapshot();
  }

  async remove(id: string): Promise<DraftSnapshot | null> {
    const segments = await this.ensureDraftSegments();
    const index = segments.findIndex((item) => item.type === "site" && item.id === id);
    if (index === -1) {
      return null;
    }

    segments.splice(index, 1);
    this.syncEntries(segments);
    this.dirty = true;
    return this.getSnapshot();
  }

  async renderDraft(): Promise<string> {
    const snapshot = await this.getSnapshot();
    return rebuildCaddyfile(snapshot.segments);
  }

  clearDraft(): void {
    this.draftSegments = null;
    this.dirty = false;
  }

  isDirty(): boolean {
    return this.dirty;
  }
}

