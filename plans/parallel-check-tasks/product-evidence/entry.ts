import { installPopupDecision } from "/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/agent/popup/contract.ts";
import { appendEvent } from "/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/execution/run-manager.ts";
installPopupDecision((runId) => async (packet, signal) => {
  await appendEvent(runId, 'fixture:jev-started', { stage: packet.stage, at: Date.now() });
  try {
  await new Promise(r => setTimeout(r, packet.goal.includes('cancel') ? 3000 : 450));
  signal.throwIfAborted();
  if (packet.goal.includes('failure') && packet.goal.includes('viewport 0')) throw Error('fixed child decision failure');
  const candidate = packet.stage === 'target' ? undefined : packet.candidates.find(c => /Open details/.test(c.description));
  return { binding: packet.binding, choice: candidate?.id ?? 'handoff', confidence: 1 };
  } finally { await appendEvent(runId, 'fixture:jev-finished', { stage: packet.stage, at: Date.now() }); }
});
await import("/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel/src/server/index.ts");