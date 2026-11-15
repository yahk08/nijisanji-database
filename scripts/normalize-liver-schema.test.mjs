import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLiver} from './normalize-liver-schema.mjs';
const base={id:'TMP_test_person',name:'テスト',officialProfileUrl:'https://www.nijisanji.jp/talents/l/test-person',visuals:[],music:[],events:[],youtube:{videos:[]}};
test('missing fields become consistent defaults without deleting original values',()=>{
 const x=normalizeLiver(base,'TMP_test_person.json');
 assert.equal(x.id,base.id);assert.deepEqual(x.birthday,{value:null,verification:'unknown',sources:[],showSources:false});
 assert.deepEqual(x.fields,[]);assert.deepEqual(x.youtube,{fetchedAt:null,stateCheckedAt:null,videos:[]});
 assert.equal(x.portraitUrl,null);
});
test('existing verified fields, outfits and extra fields survive intact',()=>{
 const source={...base,branch:'EN',birthday:{value:'08-22',verification:'official',sources:[{url:'https://example.com'}]},visuals:[{id:'a',title:'衣装',category:'2D',kind:'初期衣装',date:null,imageUrl:'https://example.com/a.png',variants:[],customNote:'keep'}],special:'retain'};
 const x=normalizeLiver(source,'TMP_test_person.json');
 assert.equal(x.birthday.value,'08-22');assert.equal(x.visuals[0].customNote,'keep');assert.equal(x.visuals[0].imageUrl,source.visuals[0].imageUrl);assert.equal(x.branch,'EN');assert.equal(x.special,'retain');
 assert.deepEqual(normalizeLiver(x,'TMP_test_person.json'),x);
});
test('invalid field types fail instead of deleting information',()=>{
 assert.throws(()=>normalizeLiver({...base,visuals:{}},'TMP_test_person.json'));
 assert.throws(()=>normalizeLiver({...base,birthday:'8月22日'},'TMP_test_person.json'));
});
