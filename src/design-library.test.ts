import assert from 'node:assert/strict';
import test from 'node:test';
import {catalogDesigns,readUpstreamDesign} from './design-library.js';

test('catalog discovers all DESIGN.md documents and pins URLs to commit',async()=>{
  const original=globalThis.fetch;
  const sha='a'.repeat(40);
  globalThis.fetch=(async(input:RequestInfo|URL)=>{
    const url=String(input);
    if(url.endsWith('/commits/main'))return new Response(JSON.stringify({sha}),{status:200});
    if(url.includes('/git/trees/'))return new Response(JSON.stringify({truncated:false,tree:[
      {type:'blob',path:'design-md/productivity/sap/DESIGN.md'},
      {type:'blob',path:'design-md/productivity/sap/preview.html'},
      {type:'blob',path:'design-md/shop/stripe/DESIGN.md'},
      {type:'blob',path:'design-md/shop/stripe/preview-dark.html'},
      {type:'blob',path:'README.md'}
    ]}),{status:200});
    if(url.endsWith('/design-md/productivity/sap/DESIGN.md'))
      return new Response('# SAP\n\nA tested design system',{status:200});
    return new Response('not found',{status:404});
  }) as typeof fetch;
  try{
    const catalog=await catalogDesigns(true);
    assert.equal(catalog.total,2);
    assert.equal(catalog.revision,sha);
    assert.equal(catalog.entries[0].previewUrl!==undefined,true);
    assert.equal(catalog.entries[1].darkPreviewUrl!==undefined,true);
    const selected=await readUpstreamDesign('productivity/sap');
    assert.match(selected.markdown,/tested design system/);
    assert.equal(selected.revision,sha);
    await assert.rejects(readUpstreamDesign('../invalid'),/Unknown design|Invalid design/);
  }finally{globalThis.fetch=original;}
});
