import { decideBotCommand } from '../game/ai/search';
import { BOT_BUDGETS } from '../game/ai/config';
import type { BotDecision, BotDecisionRequest } from '../game/ai/types';
export interface BotWorkerPort {onmessage:((e:MessageEvent)=>void)|null;onerror:((e:ErrorEvent)=>void)|null;postMessage:(message:BotDecisionRequest)=>void;terminate:()=>void}
export const matchesBotDecision=(request:BotDecisionRequest,result:BotDecision)=>result.requestId===request.requestId&&result.matchId===request.view.matchId&&result.stateVersion===request.view.version;
/** One owned worker per active request; cancellation terminates CPU work too. */
export class BotWorkerClient {
  private current?:{worker:BotWorkerPort;timer:ReturnType<typeof setTimeout>;resolve:(value:BotDecision|null)=>void};
  constructor(private factory:()=>BotWorkerPort=()=>new Worker(new URL('./bot.worker.ts',import.meta.url),{type:'module'})){}
  cancel(){if(!this.current)return;const c=this.current;this.current=undefined;clearTimeout(c.timer);c.worker.terminate();c.resolve(null)}
  request(request:BotDecisionRequest):Promise<BotDecision|null>{
    this.cancel();
    return new Promise(resolve=>{
      const fallback=(reason:'worker-error'|'worker-timeout')=>{const result=decideBotCommand({...request,difficulty:'easy',budget:{maxNodes:80,maxMs:25}});result.reasonCode='BUDGET_FALLBACK';result.fallbackReason=reason;return result};
      let worker:BotWorkerPort;
      try{worker=this.factory()}catch{resolve(fallback('worker-error'));return}
      const finish=(result:BotDecision|null)=>{if(this.current?.worker!==worker)return;const c=this.current;this.current=undefined;clearTimeout(c.timer);worker.terminate();resolve(result)};
      const timer=setTimeout(()=>finish(fallback('worker-timeout')),(request.budget?.maxMs??BOT_BUDGETS[request.difficulty].maxMs)+500);
      this.current={worker,timer,resolve};
      worker.onmessage=e=>{if(e.data?.ok&&matchesBotDecision(request,e.data.decision))finish(e.data.decision);else finish(fallback('worker-error'))};
      worker.onerror=()=>finish(fallback('worker-error'));
      try{worker.postMessage(request)}catch{finish(fallback('worker-error'))}
    });
  }
}
