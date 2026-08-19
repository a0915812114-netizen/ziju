import { EditorApp } from "@/components/editor/EditorApp";

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditorApp projectId={id} />;
}
