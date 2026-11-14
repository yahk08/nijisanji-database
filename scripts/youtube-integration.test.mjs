import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const script=fileURLToPath(new URL('./sync-youtube.mjs',import.meta.url));
const channel='UC'+'a'.repeat(22);
function setup(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'niji-youtube-test-'));
  fs.mkdirSync(path.join(dir,'public/data/generated'),{recursive:true});
  fs.writeFileSync(path.join(dir,'public/data/generated/index.json'),JSON.stringify({livers:[{id:'fixed',status:'active',youtubeChannelId:channel}]}));
  fs.writeFileSync(path.join(dir,'mock.mjs'),`
    import fs from 'node:fs';
    globalThis.fetch=async input=>{
      const url=new URL(input); const endpoint=url.pathname.split('/').pop();
      fs.appendFileSync('calls.txt',endpoint+'\\n');
      if(process.env.TEST_FAILURE==='1')return {ok:false,status:403,json:async()=>({error:{errors:[{reason:'quotaExceeded'}]}})};
      let items=[];
      if(endpoint==='channels')items=[{id:'${channel}',contentDetails:{relatedPlaylists:{uploads:'UUtest'}}}];
      if(endpoint==='playlistItems')items=[{contentDetails:{videoId:'video000001'}}];
      if(endpoint==='search')items=[];
      if(endpoint==='videos'&&process.env.TEST_MISSING!=='1')items=[{id:'video000001',snippet:{channelId:'${channel}',title:'fixture',publishedAt:'2026-11-14T00:00:00Z',liveBroadcastContent:'live'},liveStreamingDetails:process.env.TEST_ENDED==='1'?{actualStartTime:'2026-11-14T00:00:00Z',actualEndTime:'2026-11-14T01:00:00Z'}:{actualStartTime:'2026-11-14T00:00:00Z'}}];
      return {ok:true,json:async()=>({items})};
    };`);
  return dir;
}
function run(dir,args=[],env={}){return spawnSync(process.execPath,['--import',pathToFileURL(path.join(dir,'mock.mjs')).href,script,...args],{cwd:dir,encoding:'utf8',env:{...process.env,YOUTUBE_API_KEY:'test-only-not-a-real-key',YOUTUBE_DAILY_UNITS:'100',YOUTUBE_DAILY_SEARCH_CALLS:'96',YOUTUBE_SEARCH_CHANNELS_PER_RUN:'1',...env}});}
const read=dir=>JSON.parse(fs.readFileSync(path.join(dir,'public/data/youtube.json'),'utf8'));
test('full discovery, live refresh, archive transition and deleted-video removal',()=>{
  const dir=setup();
  try{
    assert.equal(run(dir,['--full']).status,0);
    const first=read(dir);assert.equal(first.livers.fixed.videos[0].status,'live');assert.ok(first.livers.fixed.fetchedAt);
    assert.equal(run(dir,[],{TEST_ENDED:'1'}).status,0);assert.equal(read(dir).livers.fixed.videos[0].status,'archive');
    assert.equal(run(dir,['--full'],{TEST_MISSING:'1'}).status,0);assert.equal(read(dir).livers.fixed.videos.length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('403 retains successful data and timestamp without leaking key',()=>{
  const dir=setup();try{assert.equal(run(dir,['--full']).status,0);const before=read(dir);const failed=run(dir,[],{TEST_FAILURE:'1'});assert.equal(failed.status,1);assert.equal(read(dir).livers.fixed.fetchedAt,before.livers.fixed.fetchedAt);assert.deepEqual(read(dir).livers.fixed.videos,before.livers.fixed.videos);assert.ok(read(dir).lastError);assert.ok(!failed.stderr.includes('test-only-not-a-real-key'));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('zero quota and absent key never call network',()=>{
  const dir=setup();try{assert.equal(run(dir,['--full'],{YOUTUBE_DAILY_UNITS:'0'}).status,1);assert.ok(!fs.existsSync(path.join(dir,'calls.txt')));assert.equal(run(dir,['--full'],{YOUTUBE_API_KEY:''}).status,0);assert.ok(!fs.existsSync(path.join(dir,'calls.txt')));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

