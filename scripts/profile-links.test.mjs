import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('profile links omit missing/unsafe URLs, use official icons, and label Wiki separately', async()=>{
  const temp=fs.mkdtempSync(path.join(process.cwd(),'.profile-test-'));
  try {
    const code=ts.transpileModule(fs.readFileSync('src/ProfileLinks.tsx','utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
    const file=path.join(temp,'component.mjs'); fs.writeFileSync(file,code);
    const {ProfileLinks}=await import(pathToFileURL(file));
    const render=liver=>renderToStaticMarkup(React.createElement(ProfileLinks,{liver}));
    assert.equal(render({}), '');
    const html=render({profileLinks:{youtube:'https://www.youtube.com/channel/example',twitch:'javascript:alert(1)',x:'',wiki:'https://wikiwiki.jp/nijisanji/example'}});
    assert.equal((html.match(/<a /g)||[]).length,2);
    assert.match(html,/youtube_orig.svg/); assert.match(html,/非公式Wiki/);
    assert.doesNotMatch(html,/twitch_orig|javascript:|x_black/);
    assert.match(html,/noopener noreferrer/);
    const full=render({profileLinks:Object.fromEntries(['youtube','twitch','x','fanclub','store','magazine','wiki'].map(k=>[k,`https://example.com/${k}`]))});
    assert.equal((full.match(/<a /g)||[]).length,7);
    assert.equal((full.match(/class="service-icon"/g)||[]).length,6);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
