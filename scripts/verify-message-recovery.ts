/**
 * Verifies message.service pipeline scheduling after clarifier failure recovery.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyMessagePipelineScheduling } from "../apps/api/src/services/message.service";

const ROOT = resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

type MockBuild = {
  calls: string[];
  pipelineActive: boolean;
  builderActive: boolean;
};

function createMockBuild(
  options: { pipelineActive?: boolean; builderActive?: boolean } = {}
): MockBuild {
  const state: MockBuild = {
    calls: [],
    pipelineActive: options.pipelineActive ?? false,
    builderActive: options.builderActive ?? false,
  };

  return state;
}

function mockScheduler(state: MockBuild) {
  return {
    isPipelineActive: () => state.pipelineActive,
    isBuilderActive: () => state.builderActive,
    schedulePipeline: () => {
      state.calls.push("schedulePipeline");
    },
    schedulePipelineWhenIdle: () => {
      state.calls.push("schedulePipelineWhenIdle");
    },
    scheduleBuilder: () => {
      state.calls.push("scheduleBuilder");
    },
  };
}

console.log("Message Recovery Verification\n");

const source = readFileSync(
  resolve(ROOT, "apps/api/src/services/message.service.ts"),
  "utf8"
);

check(
  "draft + !specJson branch present",
  source.includes('project.status === "draft" && !project.specJson')
);
check(
  "draft recovery uses schedulePipeline",
  /project\.status === "draft" && !project\.specJson[\s\S]*schedulePipeline\(/.test(
    source
  )
);
check(
  "draft recovery uses schedulePipelineWhenIdle when active",
  /project\.status === "draft" && !project\.specJson[\s\S]*schedulePipelineWhenIdle\(/.test(
    source
  )
);
check(
  "create() delegates to applyMessagePipelineScheduling",
  source.includes("applyMessagePipelineScheduling(project, projectId, userId,")
);

const projectId = "proj-1";
const userId = "user-1";
const content = "Please try again";

// Scenario A: draft, no specJson -> schedulePipeline
{
  const mock = createMockBuild();
  applyMessagePipelineScheduling(
    { status: "draft", specJson: null },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "Scenario A: draft without specJson calls schedulePipeline",
    mock.calls.length === 1 && mock.calls[0] === "schedulePipeline"
  );
}

// Scenario A (active pipeline): schedulePipelineWhenIdle
{
  const mock = createMockBuild({ pipelineActive: true });
  applyMessagePipelineScheduling(
    { status: "draft", specJson: null },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "Scenario A: draft with active pipeline calls schedulePipelineWhenIdle",
    mock.calls.length === 1 && mock.calls[0] === "schedulePipelineWhenIdle"
  );
}

// Scenario B: clarifying -> schedulePipeline (unchanged)
{
  const mock = createMockBuild();
  applyMessagePipelineScheduling(
    { status: "clarifying", specJson: null },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "Scenario B: clarifying calls schedulePipeline",
    mock.calls.length === 1 && mock.calls[0] === "schedulePipeline"
  );
}

{
  const mock = createMockBuild({ pipelineActive: true });
  applyMessagePipelineScheduling(
    { status: "clarifying", specJson: null },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "Scenario B: clarifying with active pipeline calls schedulePipelineWhenIdle",
    mock.calls.length === 1 && mock.calls[0] === "schedulePipelineWhenIdle"
  );
}

// Scenario C: ready + specJson -> scheduleBuilder (unchanged)
{
  const mock = createMockBuild();
  applyMessagePipelineScheduling(
    { status: "ready", specJson: { appType: "crm" } },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "Scenario C: ready with specJson calls scheduleBuilder",
    mock.calls.length === 1 && mock.calls[0] === "scheduleBuilder"
  );
}

{
  const mock = createMockBuild({ builderActive: true });
  applyMessagePipelineScheduling(
    { status: "ready", specJson: { appType: "crm" } },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "Scenario C: ready skips scheduleBuilder when builder active",
    mock.calls.length === 0
  );
}

// Scenario D: failed + specJson -> scheduleBuilder (unchanged)
{
  const mock = createMockBuild();
  applyMessagePipelineScheduling(
    { status: "failed", specJson: { appType: "crm" } },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "Scenario D: failed with specJson calls scheduleBuilder",
    mock.calls.length === 1 && mock.calls[0] === "scheduleBuilder"
  );
}

{
  const mock = createMockBuild({ builderActive: true });
  applyMessagePipelineScheduling(
    { status: "failed", specJson: { appType: "crm" } },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "Scenario D: failed skips scheduleBuilder when builder active",
    mock.calls.length === 0
  );
}

// failed without specJson must not schedule builder (clarifier-failure semantics preserved)
{
  const mock = createMockBuild();
  applyMessagePipelineScheduling(
    { status: "failed", specJson: null },
    projectId,
    userId,
    { userMessage: content },
    mockScheduler(mock)
  );
  check(
    "failed without specJson does not call scheduleBuilder",
    mock.calls.length === 0
  );
}

console.log(`\n--- ${passed}/${passed + failed} checks passed ---`);

if (failed > 0) {
  process.exit(1);
}
