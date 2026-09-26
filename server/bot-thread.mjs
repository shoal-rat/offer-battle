import { parentPort } from 'node:worker_threads';
import { register } from 'tsx/esm/api';
register();
const { decideBotCommand } = await import('../src/game/ai/search.ts');
parentPort.on('message', request => {
  try { parentPort.postMessage({ ok: true, decision: decideBotCommand(request) }); }
  catch (error) { parentPort.postMessage({ ok: false, error: String(error) }); }
});
