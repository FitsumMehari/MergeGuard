/** Maps a needle in added patch lines to the corresponding new-file line number. */
export function lineFromPatch(patch: string | undefined, needle: string): number | undefined {
  if (!patch) return undefined;
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (line.includes(needle)) return newLine;
      newLine++;
    } else if (!line.startsWith("-")) {
      newLine++;
    }
  }
  return undefined;
}

export function addedLineRanges(patch?: string): Array<[number, number]> {
  if (!patch) return [];
  const lines: number[] = [];
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)?/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      lines.push(newLine);
      newLine++;
    } else if (!line.startsWith("-")) {
      newLine++;
    }
  }
  if (!lines.length) return [];
  const ranges: Array<[number, number]> = [];
  let start = lines[0]!;
  let end = lines[0]!;
  for (const n of lines.slice(1)) {
    if (n === end + 1) {
      end = n;
    } else {
      ranges.push([start, end]);
      start = end = n;
    }
  }
  ranges.push([start, end]);
  return ranges;
}

export function addedText(patch: string | undefined, fallback = ""): string {
  if (!patch) return fallback;
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}
