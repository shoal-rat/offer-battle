import { decideBotCommand } from '../game/ai/search';
import type { BotDecisionRequest } from '../game/ai/types';
const scope=globalThis as unknown as {onmessage:((e:MessageEvent<BotDecisionRequest>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=e=>{try{scope.postMessage({ok:true,decision:decideBotCommand(e.data)})}catch(error){scope.postMessage({ok:false,error:error instanceof Error?error.message:'bot worker failed'})}};
