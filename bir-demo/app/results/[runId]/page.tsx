import { ResultsPageClient } from "@/components/ResultsPageClient";

export default async function ResultsPage(props: { params: Promise<{ runId: string }> }) {
  const { runId } = await props.params;
  return <ResultsPageClient runId={runId} />;
}
