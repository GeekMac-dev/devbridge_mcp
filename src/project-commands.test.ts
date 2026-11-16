import test from 'node:test';
import assert from 'node:assert/strict';
import { planProjectTask, runProjectTask, TASKS } from './project-commands.js';

test('only supported package tasks are exposed',()=>{
  assert.deepEqual(TASKS,['build','test','lint','typecheck','check','test:design','test:integrations','test:animation']);
});
test('rejects relative paths before command execution',async()=>{
  await assert.rejects(planProjectTask('.','build'),/Absolute project path/);
});
test('runner fails closed unless local opt-in exists',async()=>{
  const prior=process.env.BRIDGE_PROJECT_COMMANDS_ENABLED;
  delete process.env.BRIDGE_PROJECT_COMMANDS_ENABLED;
  try {
    await assert.rejects(runProjectTask('D:\\codex-history-bridge','build'),/disabled/);
  } finally {
    if(prior===undefined) delete process.env.BRIDGE_PROJECT_COMMANDS_ENABLED;
    else process.env.BRIDGE_PROJECT_COMMANDS_ENABLED=prior;
  }
});
