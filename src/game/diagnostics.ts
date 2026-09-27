/** Local, explicit diagnostics only. No network transport and no arbitrary text fields. */
export const DIAGNOSTIC_EVENTS=['app_open','offer_saved','match_started','match_finished','invite_opened','migration_completed','save_failed','runtime_error'] as const;
export type DiagnosticEvent=typeof DIAGNOSTIC_EVENTS[number];
const routes=['home','create','collection','loadout','battle','account','invite'] as const;
const codes=['NETWORK_ERROR','AUTH_REQUIRED','PROFILE_REVISION_CONFLICT','OFFER_REVISION_CONFLICT','STORAGE_FULL','RATE_LIMITED','UNKNOWN'] as const;
const member=<T extends readonly string[]>(values:T,value:unknown)=>typeof value==='string'&&values.includes(value)?value as T[number]:undefined;
export function diagnosticEvent(event:DiagnosticEvent,input:unknown={}){
 if(!DIAGNOSTIC_EVENTS.includes(event))throw Error('Unknown diagnostic event');const value=input&&typeof input==='object'?input as Record<string,unknown>:{};
 return {schemaVersion:1,productVersion:'2.3.0',rulesVersion:'2.0.0',offerCompilerVersion:'2.1.0',artVersion:'2.2.0',event,...(member(routes,value.route)?{route:member(routes,value.route)}:{}),...(member(['bot','friend'] as const,value.mode)?{mode:value.mode}:{}),...(member(['easy','normal','hard','expert'] as const,value.difficulty)?{difficulty:value.difficulty}:{}),...(member(['win','lose','draw'] as const,value.result)?{result:value.result}:{}),...(member(codes,value.code)?{code:value.code}:{}),...(Number.isInteger(value.round)&&Number(value.round)>=0&&Number(value.round)<=99?{round:value.round}:{})};
}
export function sanitizedErrorReport(error:unknown,context:unknown={}){
 const value=error&&typeof error==='object'?error as Record<string,unknown>:{};
 return {...diagnosticEvent('runtime_error',context),code:member(codes,value.code)??'UNKNOWN',errorKind:member(['Error','TypeError','RangeError','ApiError','AbortError'] as const,value.name)??'Error',...(Number.isInteger(value.status)&&Number(value.status)>=400&&Number(value.status)<=599?{httpStatus:value.status}:{})};
}
export class LocalDiagnosticLog {
 private entries:ReturnType<typeof diagnosticEvent>[]=[];
 record(event:DiagnosticEvent,input?:unknown){this.entries.push(diagnosticEvent(event,input));this.entries=this.entries.slice(-100);}
 export(){return {source:'local-diagnostic' as const,entries:structuredClone(this.entries),realUserRetention:null,realUserSharingRate:null};}
 clear(){this.entries=[];}
}
