import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedTools,assertTool,redact,safeTarget,navigationAllowed,publicInvite,codexArgs} from '../scripts/agent-testing/policy';
import {rolePreflight} from '../scripts/agent-testing/preflight';

test('QA gateway novice allowlists contain only visible image/coordinate operations and deny source tools',()=>{
 assert.deepEqual(allowedTools('A01'),['screenshot','click','scroll','keyboard','currentUrl']);assert.deepEqual(allowedTools('A02'),['screenshot','tap','touchScroll','keyboard','currentUrl']);for(const role of ['A01','A02'] as const)for(const tool of ['repoRead','browser','evaluate','testRunner','ownAccount','accessibilityTree','constructor'])assert.throws(()=>assertTool(role,tool),/DENIED/);assert.throws(()=>allowedTools('__proto__'));
});
test('QA readiness is per role and missing references cannot block independent rules or accessibility sessions',()=>{
 const input={role:'A07' as const,browser:'chromium',cliAvailable:true,browserAvailable:true,isolationVerified:true,hasStorageFixture:false,hasAccount:false,hasReferences:false,captureCount:0};
 assert.equal(rolePreflight(input).canLaunch,true);
 assert.equal(rolePreflight({...input,role:'A01'}).canLaunch,true);
 assert.equal(rolePreflight({...input,role:'A01',isolationVerified:false}).canLaunch,false);
 assert.equal(rolePreflight({...input,role:'A08'}).canLaunch,false);
 assert.equal(rolePreflight({...input,role:'A03'}).canLaunch,false);
 assert.equal(rolePreflight({...input,role:'A05'}).canLaunch,false);
 assert.equal(rolePreflight({...input,role:'A11'}).status,'ready');
 const motion=rolePreflight({...input,role:'A09'});assert.equal(motion.canLaunch,true);assert.equal(motion.status,'partial-ready');assert.equal(motion.capabilities.nativeVideoObservation,false);
});
test('QA target and invitation validation prevent browser navigation into source, APIs or external sites',()=>{
 assert.equal(safeTarget('http://127.0.0.1:5173/').origin,'http://127.0.0.1:5173');assert.throws(()=>safeTarget('file:///etc/passwd'));assert.throws(()=>safeTarget('http://localhost:5173/src/App.tsx'));assert.throws(()=>safeTarget('https://unknown.invalid/'));const base='http://localhost:5173/offer-battle/';assert.equal(navigationAllowed('?room=ABCDEF',base),base+'?room=ABCDEF');for(const url of ['/src/App.tsx','/api/profile','https://else.invalid/','javascript:alert(1)'])assert.throws(()=>navigationAllowed(url,base));assert.deepEqual(publicInvite('abcdef',base),{code:'ABCDEF',url:base+'?room=ABCDEF'});assert.throws(()=>publicInvite(base+'?token=abc',base));
});
test('QA public projections drop secret keys and local paths while CLI configuration disables alternate capabilities',()=>{
 const value=redact({password:'private',token:'secret',message:'Bearer abc123 from /Users/example/private.txt and fixturePassword',nested:{cookie:'c',safe:'yes'}},['fixturePassword']);assert.deepEqual(value,{message:'Bearer [redacted] from [local-path] and [redacted]',nested:{safe:'yes'}});
 const args=codexArgs({cwd:'/isolated',schema:'/schema',instructions:'/instructions',socket:'/sock',proxy:'/proxy',role:'A01'});for(const arg of ['--ignore-user-config','--ignore-rules','--ephemeral','read-only','features.shell_tool=false','features.view_image=false','features.plugins=false','features.apps=false','features.browser_use=false','features.computer_use=false','web_search="disabled"','project_doc_max_bytes=0'])assert.ok(args.includes(arg),arg);assert.ok(args.find(a=>a.startsWith('mcp_servers.qa=')&&a.includes('enabled_tools=["screenshot","click","scroll","keyboard","currentUrl"]')));
});
