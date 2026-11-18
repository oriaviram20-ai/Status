/* Private document intake. No budget/ledger writes. */
(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
function text(v,max){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Invalid text');return v;}
function validate(raw){
 if(!raw||raw.schema!==1)throw Error('Unsupported intake schema');
 const sourceKey=text(raw.sourceKey,80);if(!/^[a-z0-9_-]+$/i.test(sourceKey))throw Error('Invalid source key');
 const keys=raw.dedupKeys||[sourceKey];if(!Array.isArray(keys)||!keys.length||keys.length>12)throw Error('Invalid duplicate keys');
 keys.forEach(k=>{if(!/^[a-z0-9_-]{8,100}$/i.test(k))throw Error('Invalid duplicate key');});
 const d=raw.document;if(!d||!['bill','payslip','pension','insurance','receipt','portfolio','other'].includes(d.type))throw Error('Invalid document type');
 const id=d.id||('intake_'+sourceKey);if(!/^[a-z0-9_-]{1,120}$/i.test(id))throw Error('Invalid document id');
 if(d.period!=null&&!/^\d{4}-\d{2}$/.test(d.period))throw Error('Invalid period');
 if(!Array.isArray(d.amounts)||d.amounts.length>12)throw Error('Invalid amounts');
 const amounts=d.amounts.map(a=>{if(typeof a.value!=='number'||!Number.isFinite(a.value))throw Error('Invalid amount');return {label:text(a.label,100),value:a.value};});
 const fields={status:'pending-review',sourceKey,sourceKeys:[...new Set([sourceKey,...keys])]};
 const allowed=['category','provider','amount','periodMonths','paymentDate','periodStart','periodEnd','personalShare','splitwiseGross','splitwiseLent','receiptThirdEstimate','discrepancy'];
 for(const k of allowed){const v=(d.fields||{})[k];if(v===undefined)continue;if(typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=800||v===null)fields[k]=v;else throw Error('Invalid document field');}
 return {schema:1,sourceKey,dedupKeys:fields.sourceKeys,provenance:text(raw.provenance,1200),document:{id,type:d.type,title:text(d.title,160),period:d.period||null,issuer:d.issuer==null?null:text(d.issuer,160),amounts,fields,insight:text(d.insight,1200)}};
}
function duplicate(records,record){return records.find(r=>{const x=r.payload||r;return x.sourceKey===record.sourceKey||(x.dedupKeys||[]).some(k=>record.dedupKeys.includes(k));});}
function append(cloud,raw,now){
 const r=validate(raw),d=r.document,docs=cloud.docs||[];
 const found=docs.find(x=>x.id===d.id||x.fields&&[x.fields.sourceKey,...(x.fields.sourceKeys||[])].some(k=>r.dedupKeys.includes(k)));
 if(found)return {state:cloud,duplicate:true,id:found.id};
 if(docs.some(x=>x.type===d.type&&x.title===d.title&&x.period===d.period))throw Error('Uncertain document match. Manual review required.');
 const out=copy(cloud);out.docs=[{...d,ts:now},...copy(docs)];
 return {state:out,duplicate:false,id:d.id};
}
const api={validate,duplicate,append};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.documentIntake=api;
})(typeof window!=='undefined'?window:globalThis);
