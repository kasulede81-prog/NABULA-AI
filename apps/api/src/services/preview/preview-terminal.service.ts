import { Sandbox } from "e2b";
import { env } from "../../config/env";
import { previewService } from "../preview.service";

export class PreviewTerminalError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

type PtyHandle = {
  pid: number;
  disconnect: () => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  sendInput: (data: string) => Promise<void>;
};

export class PreviewTerminalService {
  async openSession(
    projectId: string,
    userId: string,
    opts: {
      cols: number;
      rows: number;
      onData: (data: string) => void;
    }
  ): Promise<PtyHandle> {
    if (!env.E2B_API_KEY) {
      throw new PreviewTerminalError(
        "E2B_NOT_CONFIGURED",
        "Preview terminal requires E2B_API_KEY",
        503
      );
    }

    const preview = await previewService.get(projectId, userId);
    if (!preview?.sandboxId || preview.status !== "ready") {
      throw new PreviewTerminalError(
        "PREVIEW_NOT_READY",
        "Start a preview before opening the terminal",
        409
      );
    }

    const sandbox = await Sandbox.connect(preview.sandboxId, {
      apiKey: env.E2B_API_KEY,
    });

    const decoder = new TextDecoder();
    const terminal = await sandbox.pty.create({
      cols: opts.cols,
      rows: opts.rows,
      cwd: "/home/user",
      timeoutMs: 0,
      onData: (data) => {
        const text =
          typeof data === "string"
            ? data
            : decoder.decode(data instanceof Uint8Array ? data : new Uint8Array());
        opts.onData(text);
      },
    });

    const pid = terminal.pid;

    return {
      pid,
      disconnect: () => terminal.disconnect(),
      resize: (cols, rows) => sandbox.pty.resize(pid, { cols, rows }),
      sendInput: async (data) => {
        await sandbox.pty.sendInput(pid, new TextEncoder().encode(data));
      },
    };
  }
}

export const previewTerminalService = new PreviewTerminalService();
