import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const TOOL_NAMES={
 A01:['screenshot','click','scroll','keyboard','currentUrl'],A02:['screenshot','tap','touchScroll','keyboard','currentUrl'],
 A03:['browser','accessibilityTree','ownSeededStorage'],A04:['browser','accessibilityTree','syntheticFixture','sandboxFaults'],
 A05:['browser','ownAccount','publicInviteOutbox'],A06:['browser','ownAccount','publicInviteInbox'],
 A07:['browser','repoRead','engineFixtures','testRunner'],A08:['screenshot','approvedReferences','blindedCaptures'],
 A09:['browser','video','timelineFrames','eventTiming'],A10:['browser','performanceTrace','networkTrace','testRunner'],
 A11:['browser','accessibilityTree','keyboard','touchEmulation','mediaEmulation'],A12:['browser','sandboxFaults','repoRead','testRunner'],
} as const;
export type RoleId=keyof typeof TOOL_NAMES;
export const ROLES=Object.keys(TOOL_NAMES) as RoleId[];
export function allowedTools(role:string):readonly string[]{if(!Object.hasOwn(TOOL_NAMES,role))throw Error('Unknown role');return TOOL_NAMES[role as RoleId];}
export function assertTool(role:RoleId,name:string){if(!allowedTools(role).includes(name))throw Error('ROLE_TOOL_DENIED');}
export function safeTarget(value:string,origins:string[]=[]){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Target must be an HTTP(S) URL without credentials');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!origins.includes(url.origin))throw Error('Non-local target needs an explicit allowed origin');if(/(?:^|\/)(?:api|src|server|cloudflare|tests|work|node_modules|\.git)(?:\/|$)/.test(url.pathname)||/\.(?:ts|tsx|json|env|map)$/.test(url.pathname))throw Error('Target must be the public app page');if(url.searchParams.has('token'))throw Error('Target cannot contain credentials');return url;}
export function navigationAllowed(value:string,target:string){const url=new URL(value,target),base=new URL(target);if(url.origin!==base.origin||url.pathname.replace(/\/$/,'')!==base.pathname.replace(/\/$/,''))throw Error('Navigation outside the tested application is denied');return url.href;}
export function publicInvite(value:string,target:string){const code=/^[A-Fa-f0-9]{6}$/.test(value.trim())?value.trim().toUpperCase():new URL(navigationAllowed(value,target)).searchParams.get('room');if(!code||!/^[A-Fa-f0-9]{6}$/.test(code))throw Error('Only a public six-character invitation is allowed');return {code:code.toUpperCase(),url:new URL('?room='+code.toUpperCase(),target).href};}
export const hashFile=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
export function redact(value:unknown,secrets:string[]=[]):any {
 if(Array.isArray(value))return value.map(x=>redact(x,secrets));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(password|token|cookie|authorization|recovery|stack|base64)/i.test(key)).map(([key,v])=>[key,redact(v,secrets)]));
 if(typeof value!=='string')return value;let result=value.replace(/(?:\/Users\/|\/home\/)[^\s"']+/g,'[local-path]').replace(/Bearer\s+[A-Za-z0-9_.-]+/g,'Bearer [redacted]').replace(/([?&](?:token|key|password)=)[^&\s]+/gi,'$1[redacted]');for(const secret of secrets.filter(Boolean).sort((a,b)=>b.length-a.length))result=result.split(secret).join('[redacted]');return result;
}
export interface AgentFinding {id:string;severity:'P0'|'P1'|'P2';title:string;steps:string[];actual:string;expected:string;evidenceIds:string[]}
export interface AgentResult {status:'passed'|'failed'|'blocked';completedTasks:string[];findings:AgentFinding[];understanding:string;limitations:string[];visibleTools:string[]}
export const RESULT_SCHEMA={type:'object',additionalProperties:false,required:['status','completedTasks','findings','understanding','limitations','visibleTools'],properties:{status:{type:'string',enum:['passed','failed','blocked']},completedTasks:{type:'array',items:{type:'string'}},findings:{type:'array',items:{type:'object',additionalProperties:false,required:['id','severity','title','steps','actual','expected','evidenceIds'],properties:{id:{type:'string'},severity:{type:'string',enum:['P0','P1','P2']},title:{type:'string'},steps:{type:'array',items:{type:'string'}},actual:{type:'string'},expected:{type:'string'},evidenceIds:{type:'array',items:{type:'string'}}}}},understanding:{type:'string'},limitations:{type:'array',items:{type:'string'}},visibleTools:{type:'array',items:{type:'string'}}}};
export const CLI_DISABLED_FEATURES=['shell_tool','unified_exec','view_image','apps','plugins','remote_plugin','browser_use','browser_use_external','computer_use','image_generation','multi_agent','memories','hooks','skill_search','skill_mcp_dependency_install','in_app_browser','goals','workspace_dependencies','sleep_tool','tool_suggest','in_app_local_automation'];
export function codexArgs(input:{cwd:string;schema:string;instructions:string;socket:string;proxy:string;role:RoleId;model?:string}){
 const mcp=`mcp_servers.qa={command=${JSON.stringify(process.execPath)},args=${JSON.stringify([input.proxy,input.socket])},required=true,default_tools_approval_mode="approve",startup_timeout_sec=30,tool_timeout_sec=120,enabled_tools=${JSON.stringify(allowedTools(input.role))}}`;
 return ['--no-daemon','--ask-for-approval','never','exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--json','--sandbox','read-only','-C',input.cwd,'--output-schema',input.schema,'--color','never',...CLI_DISABLED_FEATURES.flatMap(name=>['-c',`features.${name}=false`]),'-c','features.code_mode.excluded_tool_namespaces=["functions","collaboration","clock","default"]','-c','features.skip_host_skill_discovery=true','-c','apps._default.enabled=false','-c','web_search="disabled"','-c','project_doc_max_bytes=0','-c',`model_instructions_file=${JSON.stringify(input.instructions)}`,'-c',mcp,...(input.model?['--model',input.model]:[]),'-'];
}
