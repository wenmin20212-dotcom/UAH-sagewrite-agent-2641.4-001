// Read-only projection of existing records. No account files, chats, launch or permissions.
const fs=require('node:fs'),path=require('node:path');
const registry=require('./agent-registry.cjs'),presence=require('./mobile-presence.cjs');
function json(file){try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>262144)return null;return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}}
const canonical=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
function overview({dataRoot,registryRoot,now=Date.now(),check=presence.current}={}){
 const warnings=[];let projects=[],registered=[];
 if(dataRoot&&fs.existsSync(path.join(dataRoot,'project-ledger.sqlite')))try{projects=require('./project-ledger.cjs').createLedger(dataRoot).list();}catch{warnings.push('项目历史暂时无法读取');}
 if(registryRoot&&fs.existsSync(path.join(registryRoot,'agent-registry.sqlite')))try{registered=registry.createRegistry(registryRoot).list().agents;}catch{warnings.push('Agent 登记暂时无法读取');}
 const roles=new Map();
 function role(key,base){if(!roles.has(key))roles.set(key,{key,...base,projects:[],installations:[]});return roles.get(key);}
 // Only permanent identities link projects automatically. Names and occupation codes are not identities.
 for(const p of projects){const key=p.agentUid?'agent:'+p.agentUid.toLowerCase():'project:'+p.id;role(key,{name:p.name,roleIdentity:p.roleIdentity||null}).projects.push({id:p.id,name:p.name,workspace:p.workspace,workspaceAvailable:p.workspaceAvailable,stage:p.stage,revision:p.revision,delivery:p.delivery});}
 for(const a of registered){const r=role(a.agentKey,{name:a.name,roleIdentity:a.roleIdentity||null});for(const loc of a.locations){let actual=null,error=null;try{actual=registry.inspect(loc.directory);if(actual.agentKey!==a.agentKey){error='identity_changed';actual=null;}}catch{error=loc.available?'metadata_unreadable':'directory_missing';}
 const health=actual?check(loc.directory):false,meta=actual?json(path.join(loc.directory,'agent.json')):null;
 let communication={status:'not_advertised',scope:'local_text_only',connected:false};if(actual)try{const c=require('./communication/core.cjs'),e=c.read(c.endpointFile(loc.directory));if(e.installationKey===c.identity(loc.directory).installationKey&&presence.alive(e.pid))communication.status='receiver_advertised';}catch{}
 const connectors=Array.isArray(meta?.connectors)?meta.connectors.slice(0,64).map(c=>({id:typeof c.id==='string'?c.id.slice(0,80):'unknown',operations:Array.isArray(c.operations)?c.operations.filter(v=>typeof v==='string').slice(0,32):[]})):[];
 r.installations.push({instanceKey:a.agentKey+'@'+canonical(loc.directory),agentKey:a.agentKey,directory:loc.directory,version:actual?.version||a.version,available:!!actual,metadataStatus:error||'read',repositoryUrl:actual?.repositoryUrl||a.repositoryUrl||null,online:{status:error?'unavailable':health?'online':'not_confirmed',checkedAt:new Date(now).toISOString(),evidence:health?'launcher_health_and_live_process':'no_current_launcher_health'},capabilities:{source:'agent.json',verification:'declared_only',connectors,nineViews:Object.entries(meta?.views||{}).filter(([k])=>/^M[1-9]$/.test(k)).map(([id,v])=>({id,status:typeof v?.status==='string'?v.status:'unknown'}))},authorization:'not_checked',mobileConnection:'not_checked',communication});
 }}
 return {schema:'uah-agent-directory/v1',scope:'local_machine',checkedAt:new Date(now).toISOString(),roles:[...roles.values()],warnings,notice:'在线依据本机启动健康回执；未确认不等于离线。能力仅为包内声明，不表示专业验证或账号授权。'};
}
function format(report){return report.roles.map(r=>`${r.name} · ${r.roleIdentity?.code||'编号待确认'}\n项目 ${r.projects.length} · 安装位置 ${r.installations.length}\n`+r.projects.map(p=>`项目：${p.id} · ${p.stage||'未知阶段'}\nGitHub：${p.delivery?.github?.releaseUrl||'未记录已核验发布'}`).join('\n')+'\n'+r.installations.map(i=>`${i.version} · ${{online:'在线',not_confirmed:'运行未确认',unavailable:'目录或身份不可用'}[i.online.status]}\n${i.directory}\n接口声明：${i.capabilities.connectors.map(c=>c.id+' ['+c.operations.join(', ')+']').join('；')||'未声明'}\n账号授权：未检查 · 手机连接：未检查\n本机通信：${i.communication?.status==='receiver_advertised'?'接收服务已声明，尚未连接核验':'未发现接收服务'}`).join('\n')).join('\n\n')||'暂无登记记录。';}
if(require.main===module){try{console.log(JSON.stringify(overview({dataRoot:process.argv[2],registryRoot:process.argv[3]})));}catch{console.error('Cannot read Agent directory');process.exitCode=1;}}
module.exports={overview,format};
