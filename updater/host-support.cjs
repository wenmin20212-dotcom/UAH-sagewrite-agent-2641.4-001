// Shared presentation and single-workspace support for independent desktop agents.
// Upstream licenses and engine executable names are intentionally retained.
const fs=require('node:fs'),path=require('node:path');
const {fileURLToPath}=require('node:url');
const registered=new WeakSet();
function installSingleWorkBridge({ipcMain,workspace,rendererPath,app,browserSettings,topicBridge,mailReview,agentPresence,menuApi}){
 if(registered.has(ipcMain))return;
 const expected=path.resolve(rendererPath);
 ipcMain.handle('uah-work',async(event,request)=>{
  let actual;
  try{const url=new URL(event.senderFrame?.url);if(url.protocol!=='file:')throw Error();actual=path.resolve(fileURLToPath(url));}catch{throw Error('条目接口仅供当前本地桌面使用');}
  if(actual.toLowerCase()!==expected.toLowerCase())throw Error('条目接口来源不匹配');
  if(request?.action?.startsWith('topic-')&&topicBridge)return topicBridge(request);
  if(request?.action==='inherit'&&topicBridge)return topicBridge({action:'topic-fork',parentId:request.parentId,childId:request.childId});
  if(request?.action==='browser-settings'&&browserSettings)return browserSettings();
  if(request?.action==='agent-registry'&&agentPresence)return agentPresence();
  if(request?.action==='mail-review'&&mailReview)return mailReview();
  if(request?.action==='snapshot')return {work:{mode:'single',...(topicBridge?{topicBinding:true}:{})},workspace,objects:[],sessions:[]};
  // Renderer compatibility only: no collection registry or session mutation is installed.
  if(request?.action==='ingest')return {object:null,warnings:[]};
  if(request?.action==='inherit')return null;
  throw Error('此独立程序未启用集合条目操作');
 });
 registered.add(ipcMain);
 if(app&&(browserSettings||mailReview||agentPresence))app.on('browser-window-created',(_event,window)=>{
  window.webContents.on('did-finish-load',()=>{
   let url;try{url=new URL(window.webContents.getURL());if(url.protocol!=='file:'||path.resolve(fileURLToPath(url)).toLowerCase()!==expected.toLowerCase())return;}catch{return;}
   const {Menu,MenuItem,dialog}=menuApi||require('electron');
   const menu=Menu.getApplicationMenu()||new Menu();
   if(menu.items.some(item=>item.id==='uah-agent-tools'))return;
   const invoke=(label,action)=>async()=>{try{await action();}catch(error){await dialog.showMessageBox(window,{type:'error',title:label,message:label+'打开失败',detail:String(error.message||error),buttons:['确定']});}};
   const submenu=[];
   if(mailReview)submenu.push({id:'uah-menu-mail-drafts',label:'邮件草稿…',click:invoke('邮件草稿',mailReview)});
   if(browserSettings)submenu.push({id:'uah-menu-browser-choice',label:'选择浏览器…',click:invoke('浏览器设置',browserSettings)});
   if(agentPresence)submenu.push({id:'uah-menu-agent-registry',label:'Agent 登记…',click:invoke('Agent 登记',agentPresence)});
   menu.append(new MenuItem({id:'uah-agent-tools',label:'Agent 工具',submenu}));
   Menu.setApplicationMenu(menu);
  });
 });
}
function identityHints(meta){return `\n# 当前应用身份与实际配置\n应用名称：${meta.name}。版本：${meta.version}。请使用此身份回答当前产品问题。\n当前配置、扩展和连接状态以本实例实际工具回执为准；上游引擎文档不等于本产品已支持该功能。缺少连接器时说明实际缺口，不编造安装命令、OAuth 连通或外部操作结果。\n产品使用范围见本包 README.md 及职业定义。只有讨论上游实现或用户明确询问来源时，才解释上游名称和许可证。许可证与第三方署名原样保留。\n`;
}
function stagePresentation(stage,iconFile){
 const renderer=path.join(stage,'.vite/renderer/main_window'),html=path.join(renderer,'index.html');
 // A copied runtime may carry the incubator's topic hook. Standalone children
 // must use the upstream work interface; the incubator build explicitly stages
 // its current topic hook again after presentation staging.
 const text=fs.readFileSync(html,'utf8').replace(/\s*<script\s+src=["']\.\/uah-topic-bindings\.js["']\s*>\s*<\/script>/g,''),link='<link rel="stylesheet" href="./uah-agent-brand.css">';
 if(!text.includes(link)){
  if(text.split('</head>').length!==2)throw Error('Unknown desktop HTML layout: presentation staging stopped');
  fs.writeFileSync(html,text.replace('</head>',link+'\n</head>'));
 }else fs.writeFileSync(html,text);
 const icon=fs.readFileSync(iconFile);
 const png=icon.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const ico=icon.length>=22&&icon.readUInt16LE(0)===0&&icon.readUInt16LE(2)===1&&icon.readUInt16LE(4)>0;
 if(!png&&!ico)throw Error('Agent presentation requires a PNG or ICO icon');
 const css=`/* Current agent watermark; legal notices remain unchanged. */\n.goose-icon-animation{background:url("data:image/${png?'png':'x-icon'};base64,${icon.toString('base64')}") center/contain no-repeat!important;animation:none!important}\n.goose-icon-animation>*{visibility:hidden!important}\n`;
 fs.writeFileSync(path.join(renderer,'uah-agent-brand.css'),css);
 return {watermark:'agent_icon',workMode:'single',upstreamNoticesPreserved:true};
}
module.exports={installSingleWorkBridge,identityHints,stagePresentation};
