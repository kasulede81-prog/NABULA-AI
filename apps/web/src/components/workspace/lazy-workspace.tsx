import dynamic from "next/dynamic";

export const ChatPanel = dynamic(
  () => import("@/components/chat/ChatPanel").then((m) => ({ default: m.ChatPanel })),
  { ssr: false, loading: () => <PanelSkeleton label="Chat" /> }
);

export const PreviewPanel = dynamic(
  () =>
    import("@/components/workspace/PreviewPanel").then((m) => ({
      default: m.PreviewPanel,
    })),
  { ssr: false, loading: () => <PanelSkeleton label="Preview" /> }
);

export const GitHubExportPanel = dynamic(
  () =>
    import("@/components/workspace/GitHubExportPanel").then((m) => ({
      default: m.GitHubExportPanel,
    })),
  { ssr: false }
);

export const DeployModal = dynamic(
  () =>
    import("@/components/workspace/DeployModal").then((m) => ({
      default: m.DeployModal,
    })),
  { ssr: false }
);

export const MonacoEditorPanel = dynamic(
  () =>
    import("@/components/workspace/MonacoEditorPanel").then((m) => ({
      default: m.MonacoEditorPanel,
    })),
  { ssr: false, loading: () => <PanelSkeleton label="Editor" /> }
);

export const FileTree = dynamic(
  () =>
    import("@/components/workspace/FileTree").then((m) => ({
      default: m.FileTree,
    })),
  { ssr: false }
);

export type { EditorTab } from "@/components/workspace/MonacoEditorPanel";

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading {label}…
    </div>
  );
}
