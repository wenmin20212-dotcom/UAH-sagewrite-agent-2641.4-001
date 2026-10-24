const path=require('node:path');
async function show({profileRoot,dialog,dataRoot,installationRoot,codeRoot,hostRoot}){
 const registry=require('../agent-registry.cjs').createRegistry(path.join(profileRoot,'data/agent-registry'));
 const {promisify}=require('node:util');
 const root=codeRoot||path.resolve(__dirname,'../..'),installed=installationRoot||root,nodeRoot=hostRoot||installed;
 const load=async()=>JSON.parse((await promisify(require('node:child_process').execFile)(path.join(nodeRoot,'runtime/node.exe'),[path.join(root,'execution/agent-directory.cjs'),dataRoot||path.join(profileRoot,'data/incubator'),path.join(profileRoot,'data/agent-registry')],{windowsHide:true,maxBuffer:4*1024*1024})).stdout);
 let choice;
 do{const report=await load();choice=await dialog.showMessageBox({type:'info',title:'统一 Agent 台账',message:'项目、安装位置与本机状态',detail:require('../agent-directory.cjs').format(report)+'\n\n'+report.notice+(report.warnings.length?'\n'+report.warnings.join('\n'):''),buttons:['登记外来 Agent','关闭','刷新状态','通信设置'],defaultId:1,cancelId:1});if(choice.response===3)await communicationSettings({root,installed,nodeRoot,profileRoot,dialog});}while(choice.response===2||choice.response===3);
 if(choice.response!==0)return {status:'closed'};
 const selected=await dialog.showOpenDialog({title:'选择外来 Agent 安装目录',properties:['openDirectory']});if(selected.canceled||selected.filePaths.length!==1)return {status:'cancelled'};
 const preview=registry.inspect(selected.filePaths[0]);
 const confirm=await dialog.showMessageBox({type:'question',title:'确认 Agent 登记',message:preview.name,detail:`版本：${preview.version}\n身份：${preview.agentKey}\n编号：${preview.roleIdentity?.code||'未知'}\n目录：${preview.directory}\n\n${preview.warnings.join('\n')}`,buttons:['确认登记','取消'],defaultId:1,cancelId:1});
 if(confirm.response!==0)return {status:'cancelled'};
 const current=registry.inspect(preview.directory);if(current.metadataSha256!==preview.metadataSha256||current.identitySha256!==preview.identitySha256)throw Error('身份文件已变化，请重新分析确认');
 const result=registry.register(preview.directory);await dialog.showMessageBox({type:'info',title:'Agent 登记',message:'已登记：'+result.agent.name,detail:'此登记未启动外来程序，也未授予调用权限。',buttons:['关闭']});return {status:result.status};
}
async function communicationSettings({root,installed,nodeRoot,profileRoot,dialog}){
 const run=async(action,peer)=>JSON.parse((await require('node:util').promisify(require('node:child_process').execFile)(path.join(nodeRoot,'runtime/node.exe'),[path.join(root,'execution/communication/manage.cjs'),action,installed,profileRoot,...(peer?[peer]:[])],{windowsHide:true,maxBuffer:1024*1024})).stdout);
 const status=await run('status');const selected=await dialog.showMessageBox({type:'info',title:'本机 Agent 通信',message:status.enabled?'本实例已开启文字消息接收':'本实例尚未开启消息接收',detail:'连接状态：'+status.connection+'\n允许的发送方：'+(status.peers.map(p=>p.name).join('、')||'无')+'\n只进行文字答复，不开放邮件、浏览器、文件等工具。收发双方必须在同一台电脑、同一用户下运行。',buttons:['允许一个 Agent 联系我','关闭接收','返回'],defaultId:2,cancelId:2});
 if(selected.response===1){await run('disable');return;}
 if(selected.response!==0)return;
 const chosen=await dialog.showOpenDialog({title:'选择允许联系本实例的 Agent 安装目录',properties:['openDirectory']});if(chosen.canceled||chosen.filePaths.length!==1)return;
 const preview=require('../agent-registry.cjs').inspect(chosen.filePaths[0]);const confirm=await dialog.showMessageBox({type:'question',title:'允许本机文字通信',message:'允许 '+preview.name+' 联系本实例？',detail:preview.directory+'\n'+preview.agentKey+'\n接收消息会使用本实例模型并可能产生模型费用；不授予账号或工具权限。',buttons:['允许','取消'],defaultId:1,cancelId:1});if(confirm.response!==0)return;
 const fresh=require('../agent-registry.cjs').inspect(preview.directory);if(fresh.metadataSha256!==preview.metadataSha256||fresh.identitySha256!==preview.identitySha256)throw Error('身份已变化，请重新选择');
 const result=await run('allow',preview.directory);await dialog.showMessageBox({type:'info',title:'本机 Agent 通信',message:result.status==='ready'?'已开启本机文字通信':'接收服务启动尚未确认',buttons:['关闭']});
}
module.exports={show,communicationSettings};
