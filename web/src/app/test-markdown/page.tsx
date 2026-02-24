import MarkdownPreview from "@/components/markdown-preview";

const SAMPLE = `# Markdown Preview Test

<span style="color: #ef4444">Span Color</span>

<span style="font-size: 24px">Span Size</span>

<font color="green" size="3">Font Color and Size</font>

:::warning
这里是被包裹的内容
:::
`;

export default function TestMarkdownPage() {
    return (
        <main className="h-screen">
            <MarkdownPreview content={SAMPLE} className="h-full" />
        </main>
    );
}
