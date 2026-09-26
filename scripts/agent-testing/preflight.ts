import {allowedTools,type RoleId} from './policy';

export interface RolePreflightInput {
 role:RoleId; browser:string; cliAvailable:boolean; browserAvailable:boolean;
 isolationVerified:boolean; hasStorageFixture:boolean; hasAccount:boolean;
 hasReferences:boolean; captureCount:number;
}
/** Readiness is evaluated per role; one missing fixture never blocks unrelated runs. */
export function rolePreflight(input:RolePreflightInput) {
 const blocked:string[]=[],partial:string[]=[];
 if(!input.cliAvailable)blocked.push('Codex CLI executable unavailable.');
 if(!input.browserAvailable)blocked.push(`Browser ${input.browser} unavailable.`);
 if(!input.isolationVerified)blocked.push('Current CLI tool isolation and MCP transport lack a matching successful non-sample smoke.');
 if(input.role==='A03'&&!input.hasStorageFixture)blocked.push('Own synthetic return-visit storage fixture is required.');
 if((input.role==='A05'||input.role==='A06')&&!input.hasAccount)blocked.push('A distinct sandbox account fixture is required; no automatic account creation or rate-limit bypass.');
 if(input.role==='A08'&&(!input.hasReferences||input.captureCount<2))blocked.push('Approved reference and two anonymous real captures are required.');
 if(input.role==='A09')partial.push('Normal-speed native model video observation is unavailable; actual timed-frame review may run, but full motion acceptance remains blocked.');
 return {role:input.role,status:blocked.length?'blocked':partial.length?'partial-ready':'ready',canLaunch:!blocked.length,tools:allowedTools(input.role),browser:input.browser,capabilities:{screenshots:true,coordinates:input.role!=='A08',sourceRead:input.role==='A07'||input.role==='A12',arbitraryJavaScript:false,arbitraryShell:false,nativeVideoObservation:false},blockedReasons:blocked,partialCoverage:partial};
}
