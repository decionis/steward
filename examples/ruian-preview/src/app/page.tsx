import { PreviewApp } from "@/features/preview/PreviewApp";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <PreviewApp
      agentAvailable={
        process.env.PREVIEW_LLM_ENABLED === "1" &&
        Boolean(process.env.AZURE_OPENAI_API_KEY)
      }
    />
  );
}
