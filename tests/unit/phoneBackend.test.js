const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createPhoneBackend, available } = require('../../app/webauthn/phoneBackend');
const { buildAllowedOrigins } = require('../../app/webauthn/originAllowlist');

const posix = { skip: process.platform === 'win32' && 'The phone backend is Linux-only' };
function setup(t, body, helperOverride) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-adapter-'));
  const helper = path.join(dir, 'helper');
  fs.writeFileSync(helper, `#!${process.execPath}\n${body}`, { mode: 0o755 });
  const sender = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  const frame = { url: 'https://login.microsoftonline.com/test', processId: 1, routingId: 2, parent: null };
  frame.top = frame;
  frame.framesInSubtree = [frame];
  sender.mainFrame = frame;
  const adapter = createPhoneBackend({ electron: {}, helperPath: helperOverride || helper,
    mainWindow: { webContents: sender }, origins: buildAllowedOrigins([]) });
  t.after(() => { adapter.dispose(); fs.rmSync(dir, {recursive:true,force:true}); });
  return { adapter, sender, frame, event: { sender, senderFrame: frame } };
}
const success = `let data=''; process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>{
const r=JSON.parse(data);const client={type:'webauthn.get',origin:r.origin,challenge:r.publicKey.challenge,crossOrigin:!!r.topOrigin};
if(r.topOrigin)client.topOrigin=r.topOrigin;
console.log(JSON.stringify({type:'result',credential:{id:'AQID',rawId:'AQID',type:'public-key',response:{clientDataJSON:Buffer.from(JSON.stringify(client)).toString('base64url'),authenticatorData:'AQID',signature:'AQID',userHandle:null}}}));});`;
const options = { challenge:'AQID',rpId:'login.microsoftonline.com',timeout:1,requestId:'request' };

test('real helper protocol converts WebAuthn JSON to the existing renderer contract', posix, async t => {
  const {adapter,event} = setup(t,success);
  const result = await adapter.handle('get',event,{...options,origin:'https://evil.example',topOrigin:'https://evil.example'});
  assert.equal(result.success,true);
  assert.equal(result.data.credentialId,'AQID');
  assert.equal(JSON.parse(Buffer.from(result.data.clientDataJson,'base64url')).origin,'https://login.microsoftonline.com');
  assert.equal(JSON.parse(Buffer.from(result.data.clientDataJson,'base64url')).crossOrigin,false);
});
test('relayed login iframe uses Electron frame origin and top-origin metadata', posix, async t => {
  const {adapter,event,frame}=setup(t,success);
  const child={url:'https://login.microsoft.com/frame',processId:1,routingId:3,parent:frame,top:frame};
  frame.framesInSubtree.push(child);
  const result=await adapter.handle('get',event,{...options,frameOrigin:'https://login.microsoft.com',phoneFrameId:{processId:1,routingId:3}});
  assert.equal(result.success,true);
  const client=JSON.parse(Buffer.from(result.data.clientDataJson,'base64url'));
  assert.equal(client.origin,'https://login.microsoft.com');
  assert.equal(client.topOrigin,'https://login.microsoftonline.com');
});
test('unknown windows, detached/mismatched frames and invalid input fail before spawning', posix, async t => {
  const {adapter,event,frame}=setup(t,'process.exit(99)');
  assert.match((await adapter.handle('get',{...event,sender:{}},options)).error,/SecurityError/);
  assert.match((await adapter.handle('get',event,{...options,frameOrigin:'https://evil.example'})).error,/SecurityError/);
  assert.match((await adapter.handle('get',event,{...options,phoneFrameId:{processId:5,routingId:9}})).error,/SecurityError/);
  frame.detached=true;
  assert.match((await adapter.handle('get',event,options)).error,/SecurityError/);
  frame.detached=false;
  for(const change of [{timeout:-1},{timeout:NaN},{challenge:'!'}, {requestId:''}, {challenge:'x'.repeat(65537)}]) {
    assert.match((await adapter.handle('get',event,{...options,...change})).error,/TypeError/);
  }
});
test('registration and missing helper return explicit errors without hardware handling', posix, async t => {
  const {adapter,event}=setup(t,success,'/nonexistent/phone-helper');
  assert.match((await adapter.handle('create',event,options)).error,/NotSupportedError.*registration/);
  assert.match((await adapter.handle('get',event,options)).error,/NotSupportedError.*helper/);
  assert.equal(available('relative/helper'),false);
  assert.equal(available(os.tmpdir()),false);
});
test('cancellation is bound to the exact frame and request ID; concurrent calls are rejected', posix, async t => {
  const {adapter,event}=setup(t,'setTimeout(()=>{},10000);');
  const pending=adapter.handle('get',event,options);
  assert.match((await adapter.handle('get',event,{...options,requestId:'other'})).error,/InvalidStateError/);
  await adapter.handle('get',event,{cancelRequestId:'wrong'});
  await adapter.handle('get',event,{cancelRequestId:'request'});
  assert.match((await pending).error,/AbortError/);
});
for (const cause of ['navigation','destroyed','renderer-loss']) {
  test(`${cause} terminates an outstanding phone assertion`,posix,async t=>{
    const {adapter,event,sender}=setup(t,'setTimeout(()=>{},10000);');
    const pending=adapter.handle('get',event,options);
    if(cause==='navigation') sender.emit('did-start-navigation',{},'https://login.microsoftonline.com/next',false,true,1,2);
    if(cause==='destroyed') sender.emit('destroyed');
    if(cause==='renderer-loss') sender.emit('render-process-gone');
    assert.match((await pending).error,/AbortError/);
  });
}
test('malformed credentials fail closed and timeout rejects a hung helper',posix,async t=>{
  const bad=setup(t,'console.log(JSON.stringify({type:"result",credential:{id:"AQID",type:"public-key",response:{}}}));');
  assert.match((await bad.adapter.handle('get',bad.event,options)).error,/OperationError/);
  const hung=setup(t,'setTimeout(()=>{},10000);');
  assert.match((await hung.adapter.handle('get',hung.event,{...options,timeout:0.02})).error,/NotAllowedError/);
});
test('helper assertions for a different challenge or origin never reach the renderer',posix,async t=>{
  for(const replacement of ["origin:'https://evil.example'", "challenge:'BAUG'"]) {
    const script=success.replace(replacement.startsWith('origin')?'origin:r.origin':'challenge:r.publicKey.challenge',replacement);
    const {adapter,event}=setup(t,script);
    assert.match((await adapter.handle('get',event,options)).error,/SecurityError.*another request/);
  }
});
test('non-object and unserializable IPC input returns a bounded error',posix,async t=>{
  const {adapter,event}=setup(t,'process.exit(99)');
  const cycle={...options};cycle.self=cycle;
  for(const input of [null,[],42,{...options,extension:1n},{...options,timeout:1n},cycle]) {
    assert.match((await adapter.handle('get',event,input)).error,/TypeError: Invalid phone passkey request/);
  }
});
