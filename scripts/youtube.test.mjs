import test from 'node:test';
import assert from 'node:assert/strict';
import {videoFromAPI,chunks,consume,positiveLimit,isFresh} from './youtube-core.mjs';
const base={id:'abcdefghijk',snippet:{channelId:'UCtest',title:'Test',liveBroadcastContent:'none',publishedAt:'2026-11-14T00:00:00Z'}};
test('live → archive: end time wins over stale snippet',()=>{assert.equal(videoFromAPI({...base,snippet:{...base.snippet,liveBroadcastContent:'live'},liveStreamingDetails:{actualStartTime:'x',actualEndTime:'y'}},'now').status,'archive');});
test('upcoming, live, video and private',()=>{assert.equal(videoFromAPI({...base,liveStreamingDetails:{scheduledStartTime:'x'}},'now').status,'upcoming');assert.equal(videoFromAPI({...base,liveStreamingDetails:{actualStartTime:'x'}},'now').status,'live');assert.equal(videoFromAPI(base,'now').status,'video');assert.equal(videoFromAPI({...base,status:{privacyStatus:'private'}},'now'),null);});
test('batch size and quota stop before exceeding cap',()=>{assert.deepEqual(chunks(Array(101).fill(0)).map(x=>x.length),[50,50,1]);const q={units:0};consume(q,'units',1);assert.throws(()=>consume(q,'units',1));assert.equal(q.units,1);assert.throws(()=>positiveLimit('NaN',10,100));assert.equal(positiveLimit('0',10,100),0);});
test('API data expires before 30 days',()=>{assert.equal(isFresh({checkedAt:'2026-10-01'},Date.parse('2026-11-14')),false);assert.equal(isFresh({checkedAt:'2026-11-13'},Date.parse('2026-11-14')),true);});
