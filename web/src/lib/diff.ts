export type DiffType = "same" | "added" | "removed";

export interface DiffLine {
  type: DiffType;
  value: string;
}

export interface DiffRow {
  left?: { value: string; type: DiffType };
  right?: { value: string; type: DiffType };
}

export function computeDiff(text1: string, text2: string): DiffRow[] {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');
  const n = lines1.length;
  const m = lines2.length;
  
  const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
  
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (lines1[i-1] === lines2[j-1]) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }
  
  const linearDiff: DiffLine[] = [];
  let i = n, j = m;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && lines1[i-1] === lines2[j-1]) {
      linearDiff.unshift({ type: 'same', value: lines1[i-1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      linearDiff.unshift({ type: 'added', value: lines2[j-1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j-1] < dp[i-1][j])) {
      linearDiff.unshift({ type: 'removed', value: lines1[i-1] });
      i--;
    }
  }
  
  const rows: DiffRow[] = [];
  
  for (const item of linearDiff) {
    if (item.type === 'same') {
      rows.push({
        left: { value: item.value, type: 'same' },
        right: { value: item.value, type: 'same' }
      });
    } else if (item.type === 'removed') {
      rows.push({
        left: { value: item.value, type: 'removed' },
        right: undefined 
      });
    } else if (item.type === 'added') {
      rows.push({
        left: undefined, 
        right: { value: item.value, type: 'added' }
      });
    }
  }
  
  return rows;
}
