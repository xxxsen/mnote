export type DiffType = "same" | "added" | "removed";

export interface DiffLine {
  type: DiffType;
  value: string;
}

export interface DiffRow {
  left?: { value: string; type: DiffType };
  right?: { value: string; type: DiffType };
}

function buildDpTable(lines1: string[], lines2: string[]): number[][] {
  const n = lines1.length;
  const m = lines2.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (lines1[i - 1] === lines2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

function traceback(dp: number[][], lines1: string[], lines2: string[]): DiffLine[] {
  const linearDiff: DiffLine[] = [];
  let i = lines1.length;
  let j = lines2.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
      linearDiff.unshift({ type: "same", value: lines1[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      linearDiff.unshift({ type: "added", value: lines2[j - 1] });
      j--;
    } else if (i > 0) {
      linearDiff.unshift({ type: "removed", value: lines1[i - 1] });
      i--;
    }
  }
  return linearDiff;
}

function diffLineToRow(item: DiffLine): DiffRow {
  if (item.type === "same") {
    return {
      left: { value: item.value, type: "same" },
      right: { value: item.value, type: "same" },
    };
  }
  if (item.type === "removed") {
    return {
      left: { value: item.value, type: "removed" },
      right: undefined,
    };
  }
  return {
    left: undefined,
    right: { value: item.value, type: "added" },
  };
}

export function computeDiff(text1: string, text2: string): DiffRow[] {
  const lines1 = text1.split("\n");
  const lines2 = text2.split("\n");
  const dp = buildDpTable(lines1, lines2);
  const linearDiff = traceback(dp, lines1, lines2);
  return linearDiff.map(diffLineToRow);
}
