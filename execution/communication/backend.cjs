// ACP transport derived from mobile/acp.cjs. Communication sessions always disable extensions.
const {spawn,execFileSync}=require('node:child_process'),net=require('node:net'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=net.createServer();await new Promise((r,j)=>s.listen(0,'127.0.0.1',r).once('error',j));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
class Backend{
 constructor(agent,onEvent,onPermission){this.agent=agent;this.onEvent=onEvent;this.onPermission=onPermission;this.requests=new Map();this.seq=0;this.loaded=new Set();this.closed=false;}
 async start(){if(this.closed)throw Error('Backend stopped');if(this.starting)return this.starting;this.starting=this.open().catch(async e=>{await this.stop();this.closed=false;this.starting=null;throw e;});return this.starting;}
 async open(){const a=this.agent,port=await freePort(),secret=crypto.randomBytes(32).toString('hex'),env={...process.env};for(const k of Object.keys(env))if(/^UAH_|^GOOSE_/.test(k))delete env[k];Object.assign(env,{GOOSE_PATH_ROOT:a.gooseRoot,GOOSE_WORKING_DIR:a.workspace,GOOSE_SERVER__SECRET_KEY:secret,PATH:path.join(a.root,'runtime')+path.delimiter+(env.PATH||'')});if(a.provider)env.GOOSE_PROVIDER=a.provider;if(a.model)env.GOOSE_MODEL=a.model;const githubHelper=path.join(a.root,'execution/github-tools.cjs');if(fs.existsSync(githubHelper))require(githubHelper).configure(path.resolve(a.gooseRoot,'../incubator'),{env});
 this.child=spawn(a.executable||path.join(a.root,'app/BOSS-win32-x64/resources/bin/goose.exe'),['serve','--host','127.0.0.1','--port',String(port),'--platform','desktop'],{cwd:a.workspace,env,windowsHide:true,stdio:'ignore'});let exited=false;const startedChild=this.child;this.child.once('error',()=>exited=true);this.child.once('exit',()=>{exited=true;if(this.child===startedChild)this.socket?.close();});
 for(let i=0;i<100;i++){if(exited)throw Error('Agent backend failed to start');try{this.socket=await new Promise((resolve,reject)=>{const w=new WebSocket('ws://127.0.0.1:'+port+'/acp?token='+secret);w.onopen=()=>resolve(w);w.onerror=()=>reject(Error('Waiting for backend'));});break;}catch{await sleep(100);}}
 if(!this.socket||this.socket.readyState!==1)throw Error('Agent backend is unavailable');const w=this.socket;
 w.onmessage=e=>{try{this.receive(JSON.parse(String(e.data)));}catch{/* Invalid peer data never becomes browser code. */}};w.onerror=()=>{};w.onclose=()=>{if(this.socket!==w)return;this.starting=null;this.loaded.clear();for(const p of this.requests.values()){clearTimeout(p.timer);p.reject(Error('Agent connection closed; request was not replayed'));}this.requests.clear();if(!this.closed)this.terminateChild();};
 const initialized=await this.call('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'uah-agent-communication',version:'0.1.0'}},30000);this.promptCapabilities=initialized.agentCapabilities?.promptCapabilities||{};return initialized;
 }
 receive(m){if(m.id!==undefined&&m.method){if(m.method==='session/request_permission')this.onPermission(m.params).then(result=>this.respond(m.id,result)).catch(()=>this.respond(m.id,{outcome:{outcome:'cancelled'}}));else this.socket.send(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Mobile client does not expose filesystem or terminal RPC'}}));return;}
  if(m.id!==undefined){const p=this.requests.get(m.id);if(p){this.requests.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(String(m.error.message||'Agent request failed').slice(0,300))):p.resolve(m.result);}return;}
  if(m.method==='session/update')this.onEvent(m.params);
 }
 respond(id,result){if(this.socket?.readyState===1)this.socket.send(JSON.stringify({jsonrpc:'2.0',id,result}));}
 call(method,params,timeout=180000){if(this.socket?.readyState!==1)return Promise.reject(Error('Agent is disconnected'));const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.requests.delete(id);reject(Error('Agent request timed out; do not assume it was cancelled'));},timeout);this.requests.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({jsonrpc:'2.0',id,method,params}));});}
 async create(workspace,title){await this.start();const a=this.agent,r=await this.call('session/new',{cwd:workspace,mcpServers:[],_meta:{client:'goose-desktop',title,enabledExtensions:[]}});this.loaded.add(String(r.sessionId));return String(r.sessionId);}
 async prompt(id,workspace,text,images=[]){await this.start();if(images.length&&this.promptCapabilities?.image!==true)throw Object.assign(Error('这个 Agent 的消息接口不支持图片，请更换支持图片的 Agent。'),{code:'IMAGE_UNSUPPORTED'});if(!this.loaded.has(id)){this.loading=id;try{await this.call('session/load',{sessionId:id,cwd:workspace,mcpServers:[],_meta:{enabledExtensions:[]}});this.loaded.add(id);}finally{this.loading=null;}}
  return this.call('session/prompt',{sessionId:id,prompt:require('./images.cjs').promptBlocks(text,images)},30*60*1000);
 }
 async rename(id,title){await this.start();return this.call('_goose/unstable/session/rename',{sessionId:id,title},30000);}
 cancel(id){if(this.socket?.readyState===1)this.socket.send(JSON.stringify({jsonrpc:'2.0',method:'session/cancel',params:{sessionId:id}}));}
 terminateChild(){const c=this.child;this.child=null;if(c?.pid&&c.exitCode===null){try{if(process.platform==='win32')execFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32/taskkill.exe'),['/PID',String(c.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else c.kill();}catch{}}}
 async stop(){this.closed=true;for(const p of this.requests.values()){clearTimeout(p.timer);p.reject(Error('Mobile service stopped'));}this.requests.clear();this.socket?.close();this.loaded.clear();this.terminateChild();}
}
module.exports={Backend};
