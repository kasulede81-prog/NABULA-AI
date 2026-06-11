export interface DiffHunk {
  id: number;
  /** 1-based line number in the old content where the hunk starts. */
  oldStart: number;
  oldLines: string[];
  newLines: string[];
  /** Up to 2 lines of context shown before/after the hunk. */
  contextBefore: string[];
  contextAfter: string[];
}

type Op =
  | { type: "equal"; lines: string[] }
  | { type: "change"; oldLines: string[]; newLines: string[] };

const MAX_LCS_LINES = 2500;

/** Line-based diff producing accept/reject-able hunks (Cursor-style review). */
export function computeHunks(oldText: string, newText: string): DiffHunk[] {
  const oldAll = oldText.split("\n");
  const newAll = newText.split("\n");

  // Trim common prefix/suffix to keep LCS small.
  let start = 0;
  while (
    start < oldAll.length &&
    start < newAll.length &&
    oldAll[start] === newAll[start]
  ) {
    start++;
  }
  let endOld = oldAll.length;
  let endNew = newAll.length;
  while (
    endOld > start &&
    endNew > start &&
    oldAll[endOld - 1] === newAll[endNew - 1]
  ) {
    endOld--;
    endNew--;
  }

  const oldMid = oldAll.slice(start, endOld);
  const newMid = newAll.slice(start, endNew);

  if (oldMid.length === 0 && newMid.length === 0) return [];

  let ops: Op[];
  if (oldMid.length > MAX_LCS_LINES || newMid.length > MAX_LCS_LINES) {
    // Too large for LCS — treat the changed middle as one hunk.
    ops = [{ type: "change", oldLines: oldMid, newLines: newMid }];
  } else {
    ops = diffOps(oldMid, newMid);
  }

  const hunks: DiffHunk[] = [];
  let oldLine = start + 1;
  let id = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === "equal") {
      oldLine += op.lines.length;
      continue;
    }
    const prev = ops[i - 1];
    const next = ops[i + 1];
    const before =
      prev?.type === "equal"
        ? prev.lines.slice(-2)
        : start > 0 && i === 0
          ? oldAll.slice(Math.max(0, start - 2), start)
          : [];
    const after =
      next?.type === "equal"
        ? next.lines.slice(0, 2)
        : i === ops.length - 1
          ? oldAll.slice(endOld, Math.min(oldAll.length, endOld + 2))
          : [];
    hunks.push({
      id: id++,
      oldStart: oldLine,
      oldLines: op.oldLines,
      newLines: op.newLines,
      contextBefore: before,
      contextAfter: after,
    });
    oldLine += op.oldLines.length;
  }
  return hunks;
}

/** Rebuild file content keeping only the accepted hunks. */
export function applyHunkSelection(
  oldText: string,
  newText: string,
  hunks: DiffHunk[],
  acceptedIds: Set<number>
): string {
  if (hunks.every((h) => acceptedIds.has(h.id))) return newText;
  if (hunks.every((h) => !acceptedIds.has(h.id))) return oldText;

  const oldAll = oldText.split("\n");
  const out: string[] = [];
  let cursor = 0; // 0-based index into oldAll

  for (const hunk of hunks) {
    const hunkStart = hunk.oldStart - 1;
    out.push(...oldAll.slice(cursor, hunkStart));
    if (acceptedIds.has(hunk.id)) {
      out.push(...hunk.newLines);
    } else {
      out.push(...hunk.oldLines);
    }
    cursor = hunkStart + hunk.oldLines.length;
  }
  out.push(...oldAll.slice(cursor));
  return out.join("\n");
}

/** LCS-based diff into equal/change runs. */
function diffOps(oldLines: string[], newLines: string[]): Op[] {
  const n = oldLines.length;
  const m = newLines.length;
  // DP table of LCS lengths (n+1 x m+1), flat Uint32Array.
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        oldLines[i] === newLines[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  let pendingOld: string[] = [];
  let pendingNew: string[] = [];
  let pendingEqual: string[] = [];

  const flushChange = () => {
    if (pendingOld.length > 0 || pendingNew.length > 0) {
      ops.push({ type: "change", oldLines: pendingOld, newLines: pendingNew });
      pendingOld = [];
      pendingNew = [];
    }
  };
  const flushEqual = () => {
    if (pendingEqual.length > 0) {
      ops.push({ type: "equal", lines: pendingEqual });
      pendingEqual = [];
    }
  };

  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      flushChange();
      pendingEqual.push(oldLines[i]);
      i++;
      j++;
    } else {
      flushEqual();
      if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        pendingOld.push(oldLines[i]);
        i++;
      } else {
        pendingNew.push(newLines[j]);
        j++;
      }
    }
  }
  flushEqual();
  while (i < n) {
    pendingOld.push(oldLines[i++]);
  }
  while (j < m) {
    pendingNew.push(newLines[j++]);
  }
  flushChange();
  return ops;
}
