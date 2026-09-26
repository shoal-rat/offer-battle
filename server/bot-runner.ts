import { Worker } from 'node:worker_threads';
import { BotWorkerClient, type BotWorkerPort } from '../src/workers/bot-client';
/** Node and browser use the identical observation-only strategy contract. */
export function createNodeBotRunner():BotWorkerClient {
  return new BotWorkerClient(()=>{
    const worker=new Worker(new URL('./bot-thread.mjs',import.meta.url));
    const port:BotWorkerPort={onmessage:null,onerror:null,postMessage:r=>worker.postMessage(r),terminate:()=>{void worker.terminate()}};
    worker.on('message',data=>port.onmessage?.({data} as MessageEvent));
    worker.on('error',()=>port.onerror?.(new Event('error') as ErrorEvent));
    return port;
  });
}
