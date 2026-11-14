import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOfficialAssets,candidatesForLiver,normalizedUrl} from './collect-all-official-visuals.mjs';
const ROOT='https://images.microcms-assets.io/assets/12345/abc/';
test('HTML and Next JSON image collection with deduplication',()=>{
 const j=JSON.stringify({props:{pageProps:{liverDetail:{images:{default:{fullbody:{url:ROOT+'liver-full-body_Test_Person.png?fm=webp'},head:{url:ROOT+'liver-face_Test_Person.png'}}}}}}});
 const html=`<script id="__NEXT_DATA__" type="application/json">${j}</script><img src="${ROOT}liver-full-body_Test_Person.png?fm=webp">`;
 assert.equal(collectOfficialAssets(html).length,2);
 const g=candidatesForLiver(collectOfficialAssets(html),new Set(['test_person']));
 assert.equal(g.length,1);assert.ok(g[0].face);assert.ok(g[0].full);
});
test('reject foreign domains and other livers',()=>{
 assert.equal(normalizedUrl('https://example.com/no.png'),null);
 const u=ROOT+'liver-full-body_Unrelated.png';
 assert.equal(candidatesForLiver([u],new Set(['test_person'])).length,0);
});
test('extract additional numbered full-body outfits',()=>{
 const g=candidatesForLiver([ROOT+'liver-full-body_Test_Person_costume2.png',ROOT+'liver-full-body_Test_Person_costume3.png'],new Set(['test_person']));
 assert.equal(g.length,2);
});
