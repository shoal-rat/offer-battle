/** Lets the in-browser practice bot wait for the table to finish showing its last move,
 * the way a card-game opponent waits for the previous attack to land.
 * Rules, deadlines and servers never read this: friend matches keep their own clocks. */
const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
let busy=false,busySince=0,idleSince=-Infinity;

export function setBattlePresentationBusy(value:boolean){
 if(value===busy)return;
 busy=value;
 if(value)busySince=clock();else idleSince=clock();
}
/** True once the table has been still for `quietMs`. A stuck presentation never blocks play longer than `maxBusyMs`. */
export function battlePresentationSettled(quietMs=700,maxBusyMs=12000){
 const now=clock();
 if(busy)return now-busySince>=maxBusyMs;
 return now-idleSince>=quietMs;
}
export function resetBattlePresentation(){busy=false;busySince=0;idleSince=-Infinity}
