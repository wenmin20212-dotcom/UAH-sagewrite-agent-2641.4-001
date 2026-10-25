const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const repo=path.resolve(__dirname,'..'),engine=path.join(repo,'agent/portable-source/sagewrite/engine/00-llm.ps1'),testRoot=path.join(repo,'.release-work/usage-unit-'+Date.now());fs.mkdirSync(testRoot,{recursive:true});
const q=s=>"'"+s.replaceAll("'","''")+"'";
const ps=`$ErrorActionPreference='Stop'
. ${q(engine)}
$Context=@{LogRoot=${q(testRoot)}}
function Check($ok,$message){if(-not $ok){throw $message}}
function ResetUsage {$script:SageLastLlmUsage=@{usage_status='unavailable';usage_source=$null;input_tokens=$null;output_tokens=$null;total_tokens=$null;cached_input_tokens=$null;completed_turns=$null}}
function Events($x){return ($x|ForEach-Object{ConvertTo-Json -InputObject $_ -Depth 6 -Compress}) -join "\n"}
ResetUsage
$events=Events @(@{type='item.completed';item=@{type='agent_message';text='final body'}},@{type='turn.completed';usage=@{input_tokens=200;output_tokens=20;cached_input_tokens=100}},@{type='turn.completed';usage=@{input_tokens=300;output_tokens=30;cached_input_tokens=200}})
$text=ConvertFrom-SageCodexEvents $events
Check ($text -eq 'final body') 'Final body extraction failed'
Check ($script:SageLastLlmUsage.input_tokens -eq 500 -and $script:SageLastLlmUsage.output_tokens -eq 50 -and $script:SageLastLlmUsage.total_tokens -eq 550 -and $script:SageLastLlmUsage.cached_input_tokens -eq 300) 'Usage sum or cache double-counted'
ResetUsage
$text=ConvertFrom-SageCodexEvents (Events @(@{type='item.completed';item=@{type='agent_message';text='without usage'}}))
Check ($script:SageLastLlmUsage.usage_status -eq 'unavailable' -and $null -eq $script:SageLastLlmUsage.input_tokens) 'Missing usage became zero/stale'
ResetUsage
$text=ConvertFrom-SageCodexEvents (Events @(@{type='item.completed';item=@{type='agent_message';text='zero'}},@{type='turn.completed';usage=@{input_tokens=0;output_tokens=0}}))
Check ($script:SageLastLlmUsage.usage_status -eq 'reported' -and $script:SageLastLlmUsage.total_tokens -eq 0) 'Reported zero rejected'
ResetUsage
$text=ConvertFrom-SageCodexEvents (Events @(@{type='item.completed';item=@{type='agent_message';text='negative'}},@{type='turn.completed';usage=@{input_tokens=-1;output_tokens=2}}))
Check ($script:SageLastLlmUsage.usage_status -eq 'unavailable') 'Invalid count accepted'
$badRejected=$false;try{$null=ConvertFrom-SageCodexEvents 'not json'}catch{$badRejected=$true};Check $badRejected 'Malformed output accepted'
$failedRejected=$false;try{$null=ConvertFrom-SageCodexEvents (Events @(@{type='turn.failed'}))}catch{$failedRejected=$true};Check $failedRejected 'Failed turn accepted'
$script:Counter=0
function Invoke-SageLlmTextCore {param($Prompt,$Config,$MaxOutputTokens);$script:Counter++;if($script:Counter -eq 1){$script:SageLastLlmUsage.input_tokens=10;$script:SageLastLlmUsage.output_tokens=2;$script:SageLastLlmUsage.total_tokens=12;$script:SageLastLlmUsage.usage_status='reported';return 'body'};throw 'Synthetic failure'}
$config=@{Provider='codex';Model=''}
$null=Invoke-SageLlmText -Prompt "- section_index: 7" -Config $config
try{$null=Invoke-SageLlmText -Prompt "- section_index: 8" -Config $config}catch{}
$rows=@(Get-Content -LiteralPath (Join-Path $Context.LogRoot 'llm_usage.jsonl')|ForEach-Object{$_|ConvertFrom-Json})
Check ($rows.Count -eq 2 -and $rows[0].section_index -eq 7 -and $rows[0].total_tokens -eq 12) 'Ledger success missing'
Check ($rows[1].status -eq 'failed' -and $null -eq $rows[1].total_tokens -and $rows[0].invocation_id -ne $rows[1].invocation_id) 'Failure/stale ledger incorrect'
$traces=@(Get-ChildItem -LiteralPath (Join-Path $Context.LogRoot 'llm_trace') -Filter '*.json')
Check ($traces.Count -eq 2) 'Test trace missing success/failure files'
$trace=Get-Content -LiteralPath (Join-Path $Context.LogRoot ('llm_trace/'+$rows[0].invocation_id+'.json')) -Raw|ConvertFrom-Json
Check ($trace.stage_prompt -eq '- section_index: 7' -and $trace.final_text -eq 'body' -and $trace.model_wire_input_complete -eq $false) 'Trace body or boundary incorrect'
$traceFail=Get-Content -LiteralPath (Join-Path $Context.LogRoot ('llm_trace/'+$rows[1].invocation_id+'.json')) -Raw|ConvertFrom-Json
Check ($traceFail.status -eq 'failed' -and $null -eq $traceFail.final_text) 'Failure trace retained old body'
$script:SageLlmTestTraceEnabled=$false
try{$null=Invoke-SageLlmText -Prompt 'capture disabled' -Config $config}catch{}
Check (@(Get-ChildItem -LiteralPath (Join-Path $Context.LogRoot 'llm_trace') -Filter '*.json').Count -eq 2) 'Disabled switch still writes traces'
Check (@(Get-Content -LiteralPath (Join-Path $Context.LogRoot 'llm_usage.jsonl')).Count -eq 3) 'Disabling trace broke ordinary accounting'
$writerArgs=Get-SageCodexWriterArguments -Config @{}
Check ($writerArgs.Contains('--ignore-user-config') -and $writerArgs.Contains('model_reasoning_effort=low') -and $writerArgs.Contains('skills.include_instructions=false') -and $writerArgs.Contains('agents.enabled=false') -and $writerArgs.Contains('include_environment_context=false') -and $writerArgs.Contains('features.code_mode_host=true')) 'Fixed writer profile missing'
Check ($writerArgs.Contains('codex-writer-instructions.md') -and -not $writerArgs.Contains('model_catalog_json')) 'Writer instructions or catalog unexpected'
Write-Output 'USAGE_UNIT_PASS'
`;
const r=spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0||!r.stdout.includes('USAGE_UNIT_PASS')){console.error(r.stdout,r.stderr);process.exitCode=1;}else console.log(JSON.stringify({passed:true,realModelCalled:false,cacheNotDoubleCounted:true,multipleCompletedTurns:true,missingIsNull:true,reportedZero:true,invalidRejected:true,failedTurnRejected:true,failureLedger:true,sectionAttribution:true,noStaleUsage:true}));
