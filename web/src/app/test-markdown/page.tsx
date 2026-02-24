import MarkdownPreview from "@/components/markdown-preview";

const SAMPLE = `# Markdown Preview Test

<span style="color: #ef4444">Span Color</span>

<span style="font-size: 24px">Span Size</span>

<font color="green" size="3">Font Color and Size</font>

:::warning
这里是被包裹的内容
:::

:::error
**错误提示**: 这是一个错误信息
:::

:::info
这是一条 **信息提示**，支持 [链接](https://example.com)
:::

:::tip
这是一个 **小贴士** ✨
:::

\`\`\`lua [runnable]
-- Lua Sandbox Test
local function factorial(n)
  if n <= 1 then return 1 end
  return n * factorial(n - 1)
end

for i = 1, 10 do
  print(string.format("factorial(%d) = %d", i, factorial(i)))
end
\`\`\`
`;

export default function TestMarkdownPage() {
    return (
        <main className="h-screen">
            <MarkdownPreview content={SAMPLE} className="h-full" />
        </main>
    );
}
