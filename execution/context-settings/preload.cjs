const {contextBridge,ipcRenderer}=require('electron');
const channel=process.argv.find(s=>s.startsWith('--uah-context-channel='))?.slice('--uah-context-channel='.length);if(!channel)throw Error('Missing settings channel');
contextBridge.exposeInMainWorld('contextSettings',{request:value=>ipcRenderer.invoke(channel,value)});
