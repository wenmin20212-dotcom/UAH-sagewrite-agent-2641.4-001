# ===== TEST CODE: full adapter input/output capture (2026-10-25) =====
# Set this one switch to $false to disable capture. No effect on ordinary usage statistics.
# This captures the adapter/CLI boundary, NOT CLI-internal system/tool context or the server wire request.
$script:SageLlmTestTraceEnabled = $true
function Get-SageLlmTestTokenCalculation {
    param($Record)
    try {
        # TEST ONLY: Python + tiktoken; override executable on another test machine.
        $Python = $env:SAGE_TEST_TOKEN_PYTHON
        if (-not $Python) { $Python = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' }
        if (-not (Test-Path -LiteralPath $Python)) { throw 'Test Python unavailable' }
        $Code = @'
import sys,json,importlib.metadata,tiktoken
r=json.load(sys.stdin)
e=tiktoken.get_encoding('o200k_base')
def count(v):
 return len(e.encode(v,disallowed_special=())) if isinstance(v,str) else None
c={k:count(r.get(k)) for k in ['stage_prompt','cli_stdin','final_text','cli_stdout_jsonl','cli_stderr','api_request_body_json']}
u=r.get('usage') or {}
i,o,h=u.get('input_tokens'),u.get('output_tokens'),u.get('cached_input_tokens')
valid=lambda x:isinstance(x,int) and not isinstance(x,bool) and x>=0
print(json.dumps({'status':'calculated','encoding':'o200k_base','library_version':importlib.metadata.version('tiktoken'),'model_encoding_verified':False,'counts_are_estimates_for_model':True,'text_tokens':c,'reported_total_tokens':i+o if valid(i) and valid(o) else None,'reported_uncached_input_tokens':i-h if valid(i) and valid(h) and h<=i else None,'reported_input_minus_cli_stdin':i-c['cli_stdin'] if valid(i) and c['cli_stdin'] is not None else None,'reported_output_minus_final_text':o-c['final_text'] if valid(o) and c['final_text'] is not None else None,'cached_input_fraction':h/i if valid(h) and valid(i) and i>0 and h<=i else None,'notes':['Cache is a subset of input. Do not add again.','Differences include context, formatting, internal turns and tokenizer mismatch; not measured hidden prompt.','Raw JSON and stderr counts are diagnostic sizes, not model usage.','Stage prompt overlaps CLI stdin. Do not sum.']}))
'@
        $Info = New-Object Diagnostics.ProcessStartInfo
        $Info.FileName = $Python
        $Encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Code))
        $Info.Arguments = '-c "import base64;exec(base64.b64decode(''' + $Encoded + '''))"'
        $Info.UseShellExecute = $false; $Info.CreateNoWindow = $true
        $Info.RedirectStandardInput = $true; $Info.RedirectStandardOutput = $true; $Info.RedirectStandardError = $true
        $Process = [Diagnostics.Process]::Start($Info)
        $OutTask = $Process.StandardOutput.ReadToEndAsync()
        $ErrTask = $Process.StandardError.ReadToEndAsync()
        $InputBytes = [Text.Encoding]::UTF8.GetBytes(($Record | ConvertTo-Json -Depth 50 -Compress))
        $Process.StandardInput.BaseStream.Write($InputBytes, 0, $InputBytes.Length)
        $Process.StandardInput.Close()
        if (-not $Process.WaitForExit(30000)) { $Process.Kill(); throw 'Test tokenizer timed out' }
        $Output = $OutTask.GetAwaiter().GetResult()
        $IgnoredError = $ErrTask.GetAwaiter().GetResult()
        if ($Process.ExitCode -ne 0) { throw 'Test tokenizer failed or tiktoken unavailable' }
        return ($Output | ConvertFrom-Json -ErrorAction Stop)
    } catch { return @{status='unavailable';reason='Test tokenizer unavailable or calculation failed; normal writing continues.'} }
}
function Write-SageLlmTestTrace {
    param([string]$Provider, [string]$Status, [string]$FinalText, [datetime]$Started)
    if (-not $script:SageLlmTestTraceEnabled -or $null -eq $script:SageLlmTestCapture) { return }
    try {
        $CallerContext = Get-Variable -Name Context -ValueOnly -ErrorAction SilentlyContinue
        $LogRoot = if ($CallerContext -and $CallerContext.LogRoot) { $CallerContext.LogRoot } else { Join-Path $PSScriptRoot 'work' }
        $Folder = Join-Path $LogRoot 'llm_trace'
        [IO.Directory]::CreateDirectory($Folder) | Out-Null
        $Capture = $script:SageLlmTestCapture
        $Record = [ordered]@{
            schema = 'sagewrite-llm-test-trace/v1'; test_code = $true
            invocation_id = $script:SageLastLlmUsage.invocation_id
            started_at = $Started.ToUniversalTime().ToString('o'); finished_at = [datetime]::UtcNow.ToString('o')
            provider = $Provider; status = $Status
            capture_boundary = 'SageWrite adapter / local CLI; not the complete CLI-to-model wire request'
            model_wire_input_complete = $false
            stage_prompt = $Capture.stage_prompt; max_output_tokens_requested = $Capture.max_output_tokens_requested
            cli_stdin = $Capture.cli_stdin; cli_stdout_jsonl = $Capture.cli_stdout_jsonl
            cli_stderr = $Capture.cli_stderr; cli_exit_code = $Capture.cli_exit_code
            api_request_body_json = $Capture.api_request_body_json; api_response = $Capture.api_response
            final_text = if ($Status -eq 'success') { $FinalText } else { $null }
            usage = $script:SageLastLlmUsage
        }
        $Record['token_calculation'] = Get-SageLlmTestTokenCalculation -Record $Record
        $File = Join-Path $Folder ($Record.invocation_id + '.json')
        [IO.File]::WriteAllText($File, ($Record | ConvertTo-Json -Depth 50), [Text.UTF8Encoding]::new($false))
    } catch { Write-Warning 'TEST TRACE could not be saved; normal usage accounting and writing continue.' }
}
# ===== END TEST CODE helper; search SageLlmTestCapture for guarded capture points =====

function Get-SageLastLlmUsage {
    return $script:SageLastLlmUsage
}

function ConvertTo-SageTokenCount {
    param($Value)
    $Count = 0L
    if ($null -eq $Value -or -not [long]::TryParse([string]$Value, [ref]$Count) -or $Count -lt 0) { return $null }
    return $Count
}

function ConvertFrom-SageCodexEvents {
    param([string]$JsonLines)
    $Text = ''; $InputCount = 0L; $OutputCount = 0L; $CachedCount = 0L
    $Completed = 0; $Known = 0; $CacheKnown = 0; $Failed = $false
    foreach ($Line in ($JsonLines -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($Line)) { continue }
        try { $Event = $Line | ConvertFrom-Json -ErrorAction Stop }
        catch { throw 'Invalid JSON event from codex exec; refusing to save event data as manuscript text.' }
        if ($Event.type -eq 'item.completed' -and $Event.item.type -eq 'agent_message') { $Text = [string]$Event.item.text }
        if ($Event.type -eq 'turn.failed' -or $Event.type -eq 'error') { $Failed = $true }
        if ($Event.type -eq 'turn.completed') {
            $Completed++
            $In = ConvertTo-SageTokenCount $Event.usage.input_tokens
            $Out = ConvertTo-SageTokenCount $Event.usage.output_tokens
            $Cached = ConvertTo-SageTokenCount $Event.usage.cached_input_tokens
            if ($null -ne $In -and $null -ne $Out) { $Known++; $InputCount += $In; $OutputCount += $Out }
            if ($null -ne $Cached) { $CacheKnown++; $CachedCount += $Cached }
        }
    }
    $script:SageLastLlmUsage.completed_turns = $Completed
    if ($Known -gt 0 -and $Known -eq $Completed) {
        $script:SageLastLlmUsage.usage_status = 'reported'
        $script:SageLastLlmUsage.usage_source = 'codex_exec_turn_completed'
        $script:SageLastLlmUsage.input_tokens = $InputCount
        $script:SageLastLlmUsage.output_tokens = $OutputCount
        $script:SageLastLlmUsage.total_tokens = $InputCount + $OutputCount
        if ($CacheKnown -eq $Completed) { $script:SageLastLlmUsage.cached_input_tokens = $CachedCount }
    }
    if ($Failed) { throw 'codex exec reported a failed turn.' }
    if ([string]::IsNullOrWhiteSpace($Text)) { throw 'codex exec did not return a final agent message.' }
    return $Text.Trim()
}

function Write-SageLlmUsage {
    param([string]$Prompt, [string]$Status, [string]$Provider, [string]$RequestedModel, [datetime]$Started)
    $CallerContext = Get-Variable -Name Context -ValueOnly -ErrorAction SilentlyContinue
    $LogRoot = if ($CallerContext -and $CallerContext.LogRoot) { $CallerContext.LogRoot } else { Join-Path $PSScriptRoot 'work' }
    $Stage = (Get-PSCallStack | Where-Object { $_.ScriptName -and [IO.Path]::GetFileName($_.ScriptName) -ne '00-llm.ps1' } | Select-Object -First 1).ScriptName
    $Section = [regex]::Match($Prompt, '(?m)^- section_index:\s*(\d+)\s*$')
    $Usage = $script:SageLastLlmUsage
    $Record = [ordered]@{
        schema = 'sagewrite-llm-usage/v1'; invocation_id = $Usage.invocation_id
        started_at = $Started.ToUniversalTime().ToString('o'); finished_at = [datetime]::UtcNow.ToString('o')
        stage = if ($Stage) { [IO.Path]::GetFileName($Stage) } else { $null }
        section_index = if ($Section.Success) { [int]$Section.Groups[1].Value } else { $null }
        provider = $Provider; requested_model = if ($RequestedModel) { $RequestedModel } else { $null }
        status = $Status; usage_status = $Usage.usage_status; usage_source = $Usage.usage_source
        cli_invocations = $Usage.cli_invocations; completed_turns = $Usage.completed_turns
        input_tokens = $Usage.input_tokens; output_tokens = $Usage.output_tokens; total_tokens = $Usage.total_tokens
        cached_input_tokens = $Usage.cached_input_tokens
        duration_seconds = [math]::Round(([datetime]::UtcNow - $Started.ToUniversalTime()).TotalSeconds, 3)
    }
    try {
        [IO.Directory]::CreateDirectory($LogRoot) | Out-Null
        [IO.File]::AppendAllText((Join-Path $LogRoot 'llm_usage.jsonl'), (($Record | ConvertTo-Json -Depth 5 -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
    } catch { Write-Warning 'The model call completed but its usage ledger could not be written; inspect filesystem access.' }
}

function Invoke-SageLlmText {
    param([Parameter(Mandatory=$true)][string]$Prompt, [hashtable]$Config = (Get-SageLlmConfig), [int]$MaxOutputTokens = 0)
    $script:SageLastLlmUsage = @{
        invocation_id = [guid]::NewGuid().ToString(); usage_status = 'unavailable'; usage_source = $null
        input_tokens = $null; output_tokens = $null; total_tokens = $null; cached_input_tokens = $null
        cli_invocations = 0; completed_turns = $null
    }
    # TEST CODE: full contents are kept separately from the metadata-only usage ledger.
    $script:SageLlmTestCapture = if ($script:SageLlmTestTraceEnabled) {
        @{stage_prompt=$Prompt;max_output_tokens_requested=$MaxOutputTokens;cli_stdin=$null;cli_stdout_jsonl=$null;cli_stderr=$null;cli_exit_code=$null;api_request_body_json=$null;api_response=$null}
    } else { $null }
    $Text = $null
    $Started = [datetime]::UtcNow; $Status = 'failed' 
    try {
        $Text = Invoke-SageLlmTextCore -Prompt $Prompt -Config $Config -MaxOutputTokens $MaxOutputTokens
        $Status = 'success'
        return $Text
    } finally {
        Write-SageLlmUsage -Prompt $Prompt -Status $Status -Provider $Config.Provider -RequestedModel $Config.Model -Started $Started
        # TEST CODE: disable globally with SageLlmTestTraceEnabled above.
        Write-SageLlmTestTrace -Provider $Config.Provider -Status $Status -FinalText $Text -Started $Started
    }
}

function Assert-SageLlmProvider {
    param([string]$Provider)
    $PolicyPath = Join-Path $PSScriptRoot 'llm-config.json'
    if (Test-Path -LiteralPath $PolicyPath) {
        $Policy = Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
        $Required = [string]$Policy.SAGE_LLM_REQUIRED_PROVIDER
        if (-not [string]::IsNullOrWhiteSpace($Required) -and $Provider -ne $Required) {
            throw "Model provider override rejected: expected '$Required', got '$Provider'. Use the shared configuration; do not create a temporary handoff script."
        }
    }
}

function Resolve-SageCodexCommand {
    param([string]$Command = 'codex')
    $Found = Get-Command $Command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Found) { return $Found.Source }
    # Desktop children may inherit an older PATH. Discover only the default Codex installation.
    if ($Command -eq 'codex' -or $Command -eq 'codex.exe') {
        $InstallRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
        if (Test-Path -LiteralPath $InstallRoot -PathType Container) {
            $Candidate = Get-ChildItem -LiteralPath $InstallRoot -Filter codex.exe -File -Recurse -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
            if ($Candidate) { return $Candidate.FullName }
        }
    }
    throw "Codex command not found: $Command. Install/login Codex CLI or set SAGE_LLM_CODEX_COMMAND to its executable path."
}

function Get-SageLlmSetting {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Name,

        [string]$Default = ""
    )

    $Value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        $ConfigPath = [Environment]::GetEnvironmentVariable('SAGE_LLM_CONFIG')
        if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
            $ConfigPath = Join-Path $PSScriptRoot 'llm-config.json'
        }
        if (Test-Path -LiteralPath $ConfigPath) {
            $Settings = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
            $Property = $Settings.PSObject.Properties[$Name]
            if ($null -ne $Property) { $Value = [string]$Property.Value }
        }
        if ([string]::IsNullOrWhiteSpace($Value)) { return $Default }
    }

    return $Value.Trim()
}

function Get-SageLlmConfig {
    $Provider = (Get-SageLlmSetting -Name "SAGE_LLM_PROVIDER" -Default "openai").ToLowerInvariant()
    # Accept the historical configuration name without changing user credentials.
    if ($Provider -in @('codex_agent', 'codex_llm')) { $Provider = 'codex_LLM' }
    Assert-SageLlmProvider -Provider $Provider
    $ModelDefault = if ($Provider -eq "openai") { "gpt-5.6" } elseif ($Provider -eq 'codex') { 'gpt-6.1-sol' } else { "" }
    $Model = Get-SageLlmSetting -Name "SAGE_LLM_MODEL" -Default $ModelDefault
    $ApiStyleDefault = if ($Provider -eq "openai") {
        "responses"
    }
    elseif ($Provider -eq "codex") {
        "codex-exec"
    }
    elseif ($Provider -eq "codex_LLM") {
        "agent-handoff"
    }
    else {
        "chat-completions"
    }
    $ApiStyle = (Get-SageLlmSetting -Name "SAGE_LLM_API_STYLE" -Default $ApiStyleDefault).ToLowerInvariant()
    $BaseUrlDefault = if ($Provider -eq "openai") { "https://api.openai.com/v1" } else { "" }
    $BaseUrl = Get-SageLlmSetting -Name "SAGE_LLM_BASE_URL" -Default $BaseUrlDefault
    $Endpoint = Get-SageLlmSetting -Name "SAGE_LLM_ENDPOINT"
    $CodexCommand = Get-SageLlmSetting -Name "SAGE_LLM_CODEX_COMMAND" -Default "codex"
    $CodexWorkDir = Get-SageLlmSetting -Name "SAGE_LLM_CODEX_WORKDIR" -Default ([Environment]::CurrentDirectory)
    $ApiKey = Get-SageLlmSetting -Name "SAGE_LLM_API_KEY"
    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        $ApiKey = Get-SageLlmSetting -Name "OPENAI_API_KEY"
    }

    if ($Provider -eq "codex_LLM") {
        if ($ApiStyle -ne 'agent-handoff') {
            throw "Provider 'codex_LLM' requires SAGE_LLM_API_STYLE 'agent-handoff'."
        }
    }
    elseif ($Provider -eq "codex") {
        if ($ApiStyle -ne "codex-exec") {
            throw "Provider 'codex' requires SAGE_LLM_API_STYLE 'codex-exec'."
        }
        $CodexCommand = Resolve-SageCodexCommand -Command $CodexCommand
        if (-not (Test-Path -LiteralPath $CodexWorkDir -PathType Container)) {
            throw "SAGE_LLM_CODEX_WORKDIR does not exist: $CodexWorkDir"
        }
    }
    elseif ($ApiStyle -notin @("responses", "chat-completions")) {
        throw "Unsupported SAGE_LLM_API_STYLE '$ApiStyle'. Use 'responses' or 'chat-completions'."
    }
    if ($Provider -notin @('codex', 'codex_LLM') -and [string]::IsNullOrWhiteSpace($Endpoint)) {
        if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
            throw "SAGE_LLM_BASE_URL or SAGE_LLM_ENDPOINT must be set for provider '$Provider'."
        }
        $Endpoint = if ($ApiStyle -eq "responses") {
            $BaseUrl.TrimEnd('/') + "/responses"
        }
        else {
            $BaseUrl.TrimEnd('/') + "/chat/completions"
        }
    }
    if ($Provider -notin @('codex', 'codex_LLM') -and [string]::IsNullOrWhiteSpace($ApiKey)) {
        throw "SAGE_LLM_API_KEY is not set. OPENAI_API_KEY is accepted as a compatibility fallback."
    }

    $TimeoutText = Get-SageLlmSetting -Name "SAGE_LLM_TIMEOUT_SEC" -Default "180"
    $TimeoutSec = 180
    if (-not [int]::TryParse($TimeoutText, [ref]$TimeoutSec) -or $TimeoutSec -le 0) {
        throw "SAGE_LLM_TIMEOUT_SEC must be a positive integer."
    }

    return @{
        Provider = $Provider
        Model = $Model
        ApiStyle = $ApiStyle
        Endpoint = $Endpoint
        ApiKey = $ApiKey
        TimeoutSec = $TimeoutSec
        CodexCommand = $CodexCommand
        CodexWorkDir = $CodexWorkDir
    }
}

function Copy-SageLlmConfig {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,

        [string]$ModelOverride = ""
    )

    $Copy = @{}
    foreach ($Key in $Config.Keys) {
        $Copy[$Key] = $Config[$Key]
    }
    if (-not [string]::IsNullOrWhiteSpace($ModelOverride)) {
        $Copy.Model = $ModelOverride.Trim()
    }
    return $Copy
}

function Get-SageCodexWriterArguments {
    param([hashtable]$Config)
    # Fixed writer profile v1: only this child process is affected; user config/auth files are untouched.
    $Instructions = (Join-Path $PSScriptRoot 'codex-writer-instructions.md').Replace('\','/')
    if (-not (Test-Path -LiteralPath $Instructions)) { throw 'Missing fixed Codex writer instructions.' }
    if ($Instructions.Contains("'") -or $Instructions.Contains('"')) { throw 'Unsupported quote in writer instructions path.' }
    $Arguments = '--ignore-user-config -c "model_instructions_file=''' + $Instructions + '''" -c model_reasoning_effort=low'
    $Settings = @{
        'skills.include_instructions'='false'; 'include_apps_instructions'='false'
        'include_collaboration_mode_instructions'='false'; 'include_permissions_instructions'='false'
        'include_environment_context'='false'; 'project_doc_max_bytes'='0'; 'agents.enabled'='false'
        'web_search'='disabled'; 'features.shell_tool'='false'; 'features.unified_exec'='false'
        'features.code_mode_host'='true'; 'features.computer_use'='false'; 'features.browser_use'='false'
        'features.browser_use_external'='false'; 'features.view_image'='false'; 'features.image_generation'='false'
        'features.apps'='false'; 'features.plugins'='false'; 'features.sleep_tool'='false'
        'features.multi_agent'='false'; 'features.multi_agent_v2'='false'; 'features.recommended_plugins'='false'
        'features.workspace_dependencies'='false'; 'features.skill_search'='false'
    }
    foreach ($Key in ($Settings.Keys | Sort-Object)) { $Arguments += ' -c ' + $Key + '=' + $Settings[$Key] }
    return $Arguments
}

function Invoke-SageCodexText {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Prompt,

        [Parameter(Mandatory=$true)]
        [hashtable]$Config
    )

    if ($Config.CodexWorkDir.Contains('"')) {
        throw "SAGE_LLM_CODEX_WORKDIR cannot contain a double quote."
    }
    if (-not [string]::IsNullOrWhiteSpace($Config.Model) -and $Config.Model.Contains('"')) {
        throw "SAGE_LLM_MODEL cannot contain a double quote."
    }

    $CommandInfo = Get-Command $Config.CodexCommand -ErrorAction Stop
    $ExecutablePath = if (-not [string]::IsNullOrWhiteSpace($CommandInfo.Path)) {
        $CommandInfo.Path
    }
    else {
        $CommandInfo.Source
    }
    $ArgumentText = 'exec --ephemeral --skip-git-repo-check --sandbox read-only --color never --json --cd "' + $Config.CodexWorkDir + '"'
    if (-not [string]::IsNullOrWhiteSpace($Config.Model)) {
        $ArgumentText += ' --model "' + $Config.Model + '"'
    }
    $ArgumentText += ' ' + (Get-SageCodexWriterArguments -Config $Config) + ' -'

    $ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
    $ProcessInfo.FileName = $ExecutablePath
    $ProcessInfo.Arguments = $ArgumentText
    $ProcessInfo.WorkingDirectory = $Config.CodexWorkDir
    $ProcessInfo.UseShellExecute = $false
    $ProcessInfo.CreateNoWindow = $true
    $ProcessInfo.RedirectStandardInput = $true
    $ProcessInfo.RedirectStandardOutput = $true
    $ProcessInfo.RedirectStandardError = $true
    $ProcessInfo.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $ProcessInfo.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)

    # TEST CODE: exact text submitted to the CLI; configuration/auth headers are not logged.
    if ($null -ne $script:SageLlmTestCapture) { $script:SageLlmTestCapture.cli_stdin = $Prompt }
    $Process = New-Object System.Diagnostics.Process
    $Process.StartInfo = $ProcessInfo
    try {
        if (-not $Process.Start()) {
            throw "Unable to start codex exec."
        }
        $script:SageLastLlmUsage.cli_invocations = 1
        $OutputTask = $Process.StandardOutput.ReadToEndAsync()
        $ErrorTask = $Process.StandardError.ReadToEndAsync()
        $PromptBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Prompt)
        $Process.StandardInput.BaseStream.Write($PromptBytes, 0, $PromptBytes.Length)
        $Process.StandardInput.BaseStream.Flush()
        $Process.StandardInput.BaseStream.Close()
        $Process.WaitForExit()
        $Output = $OutputTask.Result
        $ErrorText = $ErrorTask.Result
        # TEST CODE: preserve raw returned events and diagnostics, including failed calls.
        if ($null -ne $script:SageLlmTestCapture) {
            $script:SageLlmTestCapture.cli_stdout_jsonl = $Output
            $script:SageLlmTestCapture.cli_stderr = $ErrorText
            $script:SageLlmTestCapture.cli_exit_code = $Process.ExitCode
        }

        if ($Process.ExitCode -ne 0) {
            throw "codex exec failed with exit code $($Process.ExitCode). $($ErrorText.Trim())"
        }

        $Text = ConvertFrom-SageCodexEvents -JsonLines $Output
        if ([string]::IsNullOrWhiteSpace($Text)) {
            throw "codex exec did not return text."
        }
        return $Text
    }
    finally {
        $Process.Dispose()
    }
}

function Get-SageLlmResponseText {
    param(
        [Parameter(Mandatory=$true)]
        $Response,

        [Parameter(Mandatory=$true)]
        [string]$ApiStyle
    )

    if ($ApiStyle -eq "chat-completions") {
        return [string]$Response.choices[0].message.content
    }

    if (-not [string]::IsNullOrWhiteSpace([string]$Response.output_text)) {
        return [string]$Response.output_text
    }

    $Parts = @()
    foreach ($OutputItem in @($Response.output)) {
        foreach ($ContentItem in @($OutputItem.content)) {
            if (-not [string]::IsNullOrWhiteSpace([string]$ContentItem.text)) {
                $Parts += [string]$ContentItem.text
            }
        }
    }
    return ($Parts -join "`n").Trim()
}

function Invoke-SageLlmTextCore {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Prompt,

        [hashtable]$Config = (Get-SageLlmConfig),

        [int]$MaxOutputTokens = 0
    )

    Assert-SageLlmProvider -Provider $Config.Provider
    $SystemPrompt = Get-SageLlmSetting -Name "SAGE_LLM_SYSTEM_PROMPT"
    if ($Config.Provider -eq 'codex_LLM') {
        return Invoke-SageAgentText -Prompt $Prompt -SystemPrompt $SystemPrompt -MaxOutputTokens $MaxOutputTokens
    }
    if ($Config.Provider -eq "codex") {
        $CodexPrompt = if ([string]::IsNullOrWhiteSpace($SystemPrompt)) {
            $Prompt
        }
        else {
            "$SystemPrompt`n`n$Prompt"
        }
        return Invoke-SageCodexText -Prompt $CodexPrompt -Config $Config
    }

    $BodyObject = if ($Config.ApiStyle -eq "responses") {
        $Body = @{
            model = $Config.Model
            input = $Prompt
        }
        if (-not [string]::IsNullOrWhiteSpace($SystemPrompt)) {
            $Body.instructions = $SystemPrompt
        }
        if ($MaxOutputTokens -gt 0) {
            $Body.max_output_tokens = $MaxOutputTokens
        }
        $Body
    }
    else {
        $Messages = @()
        if (-not [string]::IsNullOrWhiteSpace($SystemPrompt)) {
            $Messages += @{ role = "system"; content = $SystemPrompt }
        }
        $Messages += @{ role = "user"; content = $Prompt }
        $Body = @{
            model = $Config.Model
            messages = $Messages
        }
        if ($MaxOutputTokens -gt 0) {
            $Body.max_tokens = $MaxOutputTokens
        }
        $Body
    }

    $JsonString = $BodyObject | ConvertTo-Json -Depth 20 -Compress
    $Utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($JsonString)
    # TEST CODE: body only, never the Authorization header or Config.ApiKey.
    if ($null -ne $script:SageLlmTestCapture) { $script:SageLlmTestCapture.api_request_body_json = $JsonString }
    $Response = Invoke-RestMethod `
        -Uri $Config.Endpoint `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $($Config.ApiKey)"
            "Content-Type" = "application/json; charset=utf-8"
        } `
        -Body $Utf8Bytes `
        -TimeoutSec $Config.TimeoutSec

    # TEST CODE: successful API response as exposed by Invoke-RestMethod.
    if ($null -ne $script:SageLlmTestCapture) { $script:SageLlmTestCapture.api_response = $Response }
    $In = ConvertTo-SageTokenCount $(if ($Config.ApiStyle -eq 'responses') { $Response.usage.input_tokens } else { $Response.usage.prompt_tokens })
    $Out = ConvertTo-SageTokenCount $(if ($Config.ApiStyle -eq 'responses') { $Response.usage.output_tokens } else { $Response.usage.completion_tokens })
    if ($null -ne $In -and $null -ne $Out) {
        $script:SageLastLlmUsage.usage_status = 'reported'; $script:SageLastLlmUsage.usage_source = 'api_usage'
        $script:SageLastLlmUsage.input_tokens = $In; $script:SageLastLlmUsage.output_tokens = $Out
        $script:SageLastLlmUsage.total_tokens = $In + $Out
    }
    $Text = Get-SageLlmResponseText -Response $Response -ApiStyle $Config.ApiStyle
    if ([string]::IsNullOrWhiteSpace($Text)) {
        throw "The LLM response did not contain text."
    }

    return $Text
}

function Invoke-SageAgentText {
    param([string]$Prompt, [string]$SystemPrompt, [int]$MaxOutputTokens)

    # Include all text constraints in the ID so an answer cannot cross prompts.
    $Payload = [ordered]@{
        schema_version = 1
        provider = 'codex_LLM'
        system_prompt = $SystemPrompt
        prompt = $Prompt
        max_output_tokens = $MaxOutputTokens
    }
    $Serialized = $Payload | ConvertTo-Json -Depth 8 -Compress
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $RequestId = ([BitConverter]::ToString($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Serialized)))).Replace('-', '').ToLowerInvariant()
    }
    finally { $Hasher.Dispose() }

    $Root = Get-SageLlmSetting -Name 'SAGE_LLM_AGENT_REQUEST_ROOT'
    if ([string]::IsNullOrWhiteSpace($Root)) {
        $CallerContext = Get-Variable -Name Context -ValueOnly -ErrorAction SilentlyContinue
        $Root = if ($CallerContext -and $CallerContext.BookRoot) {
            Join-Path $CallerContext.BookRoot 'logs\agent_requests'
        } else {
            Join-Path $PSScriptRoot 'work\agent_requests'
        }
    }
    # Reuse completed historical requests; preserve manuscript provenance and cached results.
    $LegacySerialized = $Serialized.Replace('"provider":"codex_LLM"', '"provider":"codex_agent"')
    $LegacyHasher = [Security.Cryptography.SHA256]::Create()
    try { $LegacyId = ([BitConverter]::ToString($LegacyHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($LegacySerialized)))).Replace('-', '').ToLowerInvariant() }
    finally { $LegacyHasher.Dispose() }
    $LegacyPath = Join-Path (Join-Path ([IO.Path]::GetFullPath($Root)) $LegacyId) 'response.json'
    if (Test-Path -LiteralPath $LegacyPath) {
        $Legacy = Get-Content -LiteralPath $LegacyPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
        if ($Legacy.request_id -eq $LegacyId -and $Legacy.provider -eq 'codex_agent' -and $Legacy.status -eq 'completed' -and -not [string]::IsNullOrWhiteSpace([string]$Legacy.text)) { return [string]$Legacy.text }
    }
    $Folder = Join-Path ([IO.Path]::GetFullPath($Root)) $RequestId
    [IO.Directory]::CreateDirectory($Folder) | Out-Null
    $RequestPath = Join-Path $Folder 'request.json'
    $ResponsePath = Join-Path $Folder 'response.json'
    $Payload.request_id = $RequestId
    if (-not (Test-Path -LiteralPath $RequestPath)) {
        [IO.File]::WriteAllText($RequestPath, ($Payload | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    }
    if (Test-Path -LiteralPath $ResponsePath) {
        $Response = Get-Content -LiteralPath $ResponsePath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
        if ($Response.request_id -ne $RequestId -or $Response.provider -ne 'codex_LLM' -or
            $Response.status -ne 'completed' -or [string]::IsNullOrWhiteSpace([string]$Response.text)) {
            throw "Invalid agent response: $ResponsePath"
        }
        return [string]$Response.text
    }
    $Message = "SAGE_AGENT_PENDING: $RequestPath"
    Write-Host $Message
    throw $Message
}
