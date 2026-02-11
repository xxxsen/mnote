import { EditorPageClient } from "./components/EditorPageClient";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <EditorPageClient docId={id} />;
}
