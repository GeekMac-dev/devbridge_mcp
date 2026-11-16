import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationCatalog,safeProject,context7Docs,validContext7LibraryId} from './integrations.js';
test('six integrations are catalogued without falsely claiming installation',()=>{
 const entries=integrationCatalog();assert.equal(entries.length,6);
 assert.deepEqual(entries.map(x=>x.id),['playwright','chrome-devtools','context7','git','axe-core','semgrep']);
 assert.equal(entries.find(x=>x.id==='context7')?.state,process.env.BRIDGE_CONTEXT7_ENABLED==='1'?'enabled':'disabled');
 assert.equal(entries.find(x=>x.id==='axe-core')?.state,'package-installed');
});
test('rejects relative project paths',async()=>{await assert.rejects(safeProject('relative-project'),/Absolute project path/);});
test('rejects protected folders',async()=>{await assert.rejects(safeProject('D:\\node_modules'),/Protected directory/);});
test('Context7 adapter fails closed without opt-in',async()=>{
 const old=process.env.BRIDGE_CONTEXT7_ENABLED;
 delete process.env.BRIDGE_CONTEXT7_ENABLED;
 try{assert.deepEqual(await context7Docs('/facebook/react','How do I use hooks?'),{enabled:false,note:'Set BRIDGE_CONTEXT7_ENABLED=1 to permit outbound documentation lookups.'});}
 finally{if(old===undefined)delete process.env.BRIDGE_CONTEXT7_ENABLED;else process.env.BRIDGE_CONTEXT7_ENABLED=old;}
});
test('Context7 rejects invalid library identifiers before making requests',async()=>{
 const old=process.env.BRIDGE_CONTEXT7_ENABLED;process.env.BRIDGE_CONTEXT7_ENABLED='1';
 try{await assert.rejects(context7Docs('https://example.com','docs'),/Invalid Context7 library ID/);}
 finally{if(old===undefined)delete process.env.BRIDGE_CONTEXT7_ENABLED;else process.env.BRIDGE_CONTEXT7_ENABLED=old;}
});
test('Context7 accepts canonical library IDs and rejects external redirects',()=>{
 assert.equal(validContext7LibraryId('/react/react'),true);
 assert.equal(validContext7LibraryId('https://example.com/steal'),false);
 assert.equal(validContext7LibraryId('//example.com'),false);
 assert.equal(validContext7LibraryId('/facebook/react'),true);
});
