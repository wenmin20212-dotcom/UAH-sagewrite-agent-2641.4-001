const core=require('./core.cjs');
(async()=>{const [action,root,profile,peer]=process.argv.slice(2);let result;
 if(action==='allow'){core.configure({root,profile,peerDirectory:peer});result=await require('./runtime.cjs').launch({root,profile,ownerPid:require('../mobile-presence.cjs').current(root)?.pid||process.ppid});}
 else if(action==='disable')result=core.configure({root,profile,enabled:false});
 else if(action==='status'){const settings=core.settings(profile);let connection='not_confirmed';try{const value=await core.request(core.read(core.endpointFile(root)),'/status',null,1500);if(value.installationKey===core.identity(root).installationKey)connection='connected';}catch{}result={...settings,connection,scope:'text_only_no_tools'};}
 else throw Error('Unknown communication action');
 console.log(JSON.stringify(result));
})().catch(()=>{console.error('Communication configuration failed');process.exitCode=1;});
