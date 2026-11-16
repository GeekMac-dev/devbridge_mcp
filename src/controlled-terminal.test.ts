import test from 'node:test';
import assert from 'node:assert/strict';
import {TERMINAL_ACTIONS,terminalPlan,terminalRun} from './controlled-terminal.js';

test('fixed terminal actions are present',()=>{
  assert.ok(TERMINAL_ACTIONS.includes('git-status'));
  assert.ok(TERMINAL_ACTIONS.includes('gradle-assemble-debug'));
  assert.ok(!TERMINAL_ACTIONS.includes('arbitrary-shell' as never));
});
test('relative project paths are rejected',async()=>{
  await assert.rejects(terminalPlan('.','git-status'),/Absolute project path/);
});
test('invalid script traversal is rejected at validation',async()=>{
  const previous=process.env.BRIDGE_WRITE_ROOTS;
  process.env.BRIDGE_WRITE_ROOTS='D:\\';
  try{
    await assert.rejects(terminalPlan('D:\\codex-history-bridge','powershell-script','../unsafe.ps1'),/traversal/);
  }finally{
    if(previous===undefined)delete process.env.BRIDGE_WRITE_ROOTS;else process.env.BRIDGE_WRITE_ROOTS=previous;
  }
});
test('command execution is disabled by default',async()=>{
  const previous=process.env.BRIDGE_TERMINAL_ENABLED;
  delete process.env.BRIDGE_TERMINAL_ENABLED;
  try{
    await assert.rejects(terminalRun('D:\\codex-history-bridge','git-status'),/Terminal disabled/);
  }finally{
    if(previous===undefined)delete process.env.BRIDGE_TERMINAL_ENABLED;else process.env.BRIDGE_TERMINAL_ENABLED=previous;
  }
});
