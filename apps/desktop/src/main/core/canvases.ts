import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import log from "electron-log/main.js";
import {
  type Canvas,
  type CanvasContentInput,
  CanvasContentSchema,
  CanvasIdSchema,
  type CanvasItem,
  CanvasSchema,
  type CanvasSnapshot,
  type CanvasSummary,
} from "../../shared/canvas-contracts";
import { readBundleJson, writeBundleJson } from "../lib/library-config";
import { resolvePaths } from "../paths";

const SAVE_WIDTH = 240;
const SAVE_HEIGHT = 220;
const GAP = 40;
const COLUMNS = 4;

function libraryRoot(): string {
  return resolvePaths().libraryRoot;
}

function canvasFile(root: string, id: string): string {
  return join(root, "canvases", `${CanvasIdSchema.parse(id)}.json`);
}

function summarize(canvas: Canvas): CanvasSummary {
  return {
    id: canvas.id,
    name: canvas.name,
    createdAt: canvas.createdAt,
    updatedAt: canvas.updatedAt,
    itemCount: canvas.items.length,
    saveIds: [
      ...new Set(
        canvas.items.flatMap((item) =>
          item.kind === "save" ? [item.saveId] : [],
        ),
      ),
    ],
  };
}

function write(root: string, canvas: Canvas): Canvas {
  const parsed = CanvasSchema.parse(canvas);
  writeBundleJson(canvasFile(root, parsed.id), parsed);
  return parsed;
}

function requireCanvas(id: string, root: string): Canvas {
  const canvas = readCanvas(id, root);
  if (!canvas) throw new Error("This canvas no longer exists.");
  return canvas;
}

function uniqueName(base: string, taken: readonly string[]): string {
  const names = new Set(taken.map((name) => name.toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

/** New Saves land in a grid to the right of everything already on the Canvas, so nothing overlaps. */
function placeSaves(canvas: Canvas, saveIds: readonly string[]): CanvasItem[] {
  const present = new Set(
    canvas.items.flatMap((item) => (item.kind === "save" ? [item.saveId] : [])),
  );
  const incoming = [...new Set(saveIds)].filter((id) => !present.has(id));
  const left = canvas.items.length
    ? Math.max(...canvas.items.map((item) => item.x + item.width)) + GAP
    : 0;
  const top = canvas.items.length
    ? Math.min(...canvas.items.map((item) => item.y))
    : 0;
  return incoming.map((saveId, index) => ({
    kind: "save",
    id: randomUUID(),
    saveId,
    x: left + (index % COLUMNS) * (SAVE_WIDTH + GAP),
    y: top + Math.floor(index / COLUMNS) * (SAVE_HEIGHT + GAP),
    width: SAVE_WIDTH,
    height: SAVE_HEIGHT,
  }));
}

export function readCanvas(id: string, root = libraryRoot()): Canvas | null {
  const file = canvasFile(root, id);
  const stored = readBundleJson<unknown>(file);
  if (!stored) {
    if (existsSync(file)) throw new Error("This canvas could not be read.");
    return null;
  }
  return CanvasSchema.parse(stored.data);
}

export function listCanvases(root = libraryRoot()): CanvasSummary[] {
  const directory = join(root, "canvases");
  if (!existsSync(directory)) return [];
  const summaries: CanvasSummary[] = [];
  for (const name of readdirSync(directory)) {
    const id = name.endsWith(".json") ? name.slice(0, -".json".length) : "";
    if (!CanvasIdSchema.safeParse(id).success) continue;
    try {
      const canvas = readCanvas(id, root);
      if (canvas) summaries.push(summarize(canvas));
    } catch (error) {
      log.warn("[pond canvases] skipped unreadable canvas", name, error);
    }
  }
  return summaries.sort(
    (left, right) =>
      left.createdAt - right.createdAt || left.name.localeCompare(right.name),
  );
}

export function createCanvas(
  input: { name?: string; saveIds?: readonly string[] },
  root = libraryRoot(),
  now = Date.now(),
): Canvas {
  const name = uniqueName(
    input.name?.trim() || "Untitled",
    listCanvases(root).map((canvas) => canvas.name),
  );
  const empty: Canvas = {
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    viewport: { x: 0, y: 0, zoom: 1 },
    items: [],
    connectors: [],
  };
  return write(root, {
    ...empty,
    items: placeSaves(empty, input.saveIds ?? []),
  });
}

export function renameCanvas(
  id: string,
  name: string,
  root = libraryRoot(),
  now = Date.now(),
): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the canvas a name.");
  write(root, { ...requireCanvas(id, root), name: trimmed, updatedAt: now });
}

export class CanvasConflictError extends Error {
  constructor() {
    super(
      "This Canvas changed in another window. Reload before saving your changes.",
    );
  }
}

export function canvasContentVersion(content: CanvasContentInput): string {
  return createHash("sha256")
    .update(JSON.stringify(CanvasContentSchema.parse(content)))
    .digest("hex");
}

export function canvasSnapshot(canvas: Canvas): CanvasSnapshot {
  return { ...canvas, contentVersion: canvasContentVersion(canvas) };
}

export function updateCanvas(
  id: string,
  content: CanvasContentInput,
  expectedContent: string,
  root = libraryRoot(),
  now = Date.now(),
) {
  const parsed = CanvasContentSchema.parse(content);
  const current = requireCanvas(id, root);
  if (canvasContentVersion(current) !== expectedContent)
    throw new CanvasConflictError();
  write(root, { ...current, ...parsed, updatedAt: now });
  return { updatedAt: now, contentVersion: canvasContentVersion(parsed) };
}

export function addSavesToCanvas(
  id: string,
  saveIds: readonly string[],
  root = libraryRoot(),
  now = Date.now(),
): Canvas {
  const canvas = requireCanvas(id, root);
  const added = placeSaves(canvas, saveIds);
  if (!added.length) return canvas;
  return write(root, {
    ...canvas,
    items: [...canvas.items, ...added],
    updatedAt: now,
  });
}

export function deleteCanvas(id: string, root = libraryRoot()): void {
  rmSync(canvasFile(root, id), { force: true });
}
