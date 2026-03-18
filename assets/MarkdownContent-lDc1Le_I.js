import{_ as G}from"./vendor-pdf-C80LOIEG.js";import{r as W}from"./vendor-react-BjA4vbPC.js";import{u as J,d as U,f as V,j as $}from"./index-DSwa2F88.js";let R=null,q=null;const D=async()=>(R||(R=G(()=>import("./vendor-canvas-DXEQVQnt.js"),[]).then(e=>e.default)),await R),B=async()=>(q||(q=G(()=>import("./vendor-pdf-C80LOIEG.js").then(e=>e.j),[]).then(e=>e.jsPDF)),await q),re=()=>{const{t:e}=J(),r=V("ReportExport"),[f,i]=W.useState(!1),[S,p]=W.useState(0),k=o=>{const n=o.replace("#","");if(!/^[0-9a-fA-F]{6}$/.test(n))return[30,41,59];const l=parseInt(n.slice(0,2),16),a=parseInt(n.slice(2,4),16),s=parseInt(n.slice(4,6),16);return[l,a,s]},y=o=>new Promise((n,l)=>{const a=new FileReader;a.onloadend=()=>n(String(a.result||"")),a.onerror=()=>l(new Error("Failed to read image blob")),a.readAsDataURL(o)}),m=(o,n)=>{const l=o.toLowerCase();if(l.includes("jpeg")||l.includes("jpg"))return"JPEG";if(l.includes("webp"))return"WEBP";if(l.includes("png"))return"PNG";const a=n.toLowerCase();return a.endsWith(".jpg")||a.endsWith(".jpeg")?"JPEG":a.endsWith(".webp")?"WEBP":"PNG"},j=async o=>{if(o.startsWith("data:image/")){const g=o.includes("image/jpeg")||o.includes("image/jpg")?"JPEG":o.includes("image/webp")?"WEBP":"PNG";return{data:o,format:g}}const n=await fetch(o,{mode:"cors",referrerPolicy:"no-referrer"});if(!n.ok)throw new Error(`Image request failed with status ${n.status}`);const l=await n.blob(),a=m(l.type,o);return{data:await y(l),format:a}},F=(o,n,l,a,s)=>{const g=s?.showHeader??!0,t=s?.showFooter??!0,b=o.internal.pageSize.getWidth(),w=o.internal.pageSize.getHeight();if(g&&(o.setFontSize(10),o.setTextColor(120,120,120),o.text(s?.headerText||n.title,10,10),o.line(10,12,b-10,12),n.status&&n.status!=="info")){const d=n.status.toUpperCase();o.setFontSize(8);const h=n.status==="critical"?[220,38,38]:n.status==="warning"?[217,119,6]:[5,150,105];o.setTextColor(h[0],h[1],h[2]),o.text(d,b-10,10,{align:"right"})}if(t){o.setFontSize(9),o.setTextColor(130,130,130);const d=s?.dataAsOf?.trim(),h=s?.footerText||(d?`${e("reports.data_as_of","Data as of")}: ${d}`:`${e("reports.generated_on")}: ${new Date().toLocaleDateString()}`);o.text(h,10,w-8);const v=`${l}/${a}`;o.text(v,b-10,w-8,{align:"right"})}},N=async(o,n)=>{const l=await D(),a=document.getElementById(o);if(!a)return null;const s=a.cloneNode(!0);s.style.position="fixed",s.style.top="0",s.style.left="500vw",s.style.width=n?`${n}px`:`${a.scrollWidth||1200}px`,s.style.height="auto",s.style.minHeight=`${a.scrollHeight||800}px`,s.style.overflow="visible",s.style.zIndex="-100",s.style.padding="40px",s.style.backgroundColor="#ffffff",s.querySelectorAll(".overflow-auto, .overflow-y-auto, .overflow-x-auto").forEach(w=>{w.style.overflow="visible",w.style.height="auto"}),s.querySelectorAll("h1, h2, h3, h4, h5, h6, .truncate").forEach(w=>{const d=w;d.style.overflow="visible",d.style.textOverflow="clip",d.style.lineHeight="1.35",d.style.paddingBottom="2px"}),document.body.appendChild(s),await new Promise(w=>setTimeout(w,800)),"fonts"in document&&await document.fonts.ready;const b=await l(s,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff",width:s.offsetWidth,height:s.offsetHeight});return document.body.removeChild(s),{imgData:b.toDataURL("image/png"),width:b.width,height:b.height}};return{isExporting:f,exportProgress:S,exportToPdf:async(o,n,l="landscape")=>{i(!0),p(0);try{const a=await B(),s=await N(o);if(!s)return;const g=new a({orientation:l,unit:"mm",format:"a4"}),t=g.internal.pageSize.getWidth(),b=g.internal.pageSize.getHeight(),w=Math.min(t/(s.width/2),b/(s.height/2)),d=s.width/2*w,h=s.height/2*w;g.addImage(s.imgData,"PNG",(t-d)/2,(b-h)/2,d,h),g.save(`${n}.pdf`)}catch(a){r.error("Export failed:",a)}finally{i(!1)}},exportPackageToPdf:async(o,n,l,a,s)=>{i(!0),p(0);const g=await B(),t=new g({orientation:"portrait",unit:"mm",format:"a4"});try{if(l){const[d,h,v]=l.themeColor?k(l.themeColor):[30,41,59];if(t.setFillColor(d,h,v),t.rect(0,0,210,297,"F"),t.setTextColor(255,255,255),t.setFontSize(32),t.text(l.title,20,100),l.subtitle&&(t.setFontSize(16),t.setTextColor(148,163,184),t.text(l.subtitle,20,115)),t.setFontSize(12),t.setTextColor(100,116,139),t.text(`${e("reports.generated_on")}: ${new Date().toLocaleDateString()}`,20,260),l.author&&t.text(`${e("reports.author_prefix")}: ${l.author}`,20,267),l.logoUrl)try{const A=await j(l.logoUrl),T=30,z=210-20-T;t.addImage(A.data,A.format,z,25,T,T)}catch(A){r.warn("Cover logo could not be loaded for PDF export. The host likely blocks cross-origin image access.",A)}t.addPage()}const b=l?2:1,w=(l?1:0)+n.length;for(let d=0;d<n.length;d++){p(Math.round((d+1)/n.length*100));const h=n[d],v=await N(h.elementId,h.orientation==="landscape"?1400:1e3);if(v){const A=h.orientation||"portrait";(d>0||l)&&t.addPage(void 0,A);const T=t.internal.pageSize.getWidth(),H=t.internal.pageSize.getHeight();((a?.footerMode??"all")==="all"||(a?.footerMode??"all")==="content_only")&&F(t,h,b+d,w,a);const z=a?.showHeader===!1?12:20,u=a?.showFooter===!1?12:18,c=Math.min((T-20)/(v.width/2),(H-(z+u))/(v.height/2)),E=v.width/2*c,O=v.height/2*c;t.addImage(v.imgData,"PNG",(T-E)/2,z,E,O)}}if(a?.includeAuditAppendix){t.addPage(),t.setFontSize(18),t.setTextColor(30,41,59),t.text(e("reports.audit_appendix_title","Audit Appendix"),14,18),t.setFontSize(10),t.setTextColor(71,85,105);const d=[];d.push(`${e("reports.pack_name","Package")}: ${s?.packName||o}`),d.push(`${e("reports.generated_on")}: ${s?.generatedAt||new Date().toISOString()}`),(s?.dataAsOf||a?.dataAsOf)&&d.push(`${e("reports.data_as_of","Data as of")}: ${s?.dataAsOf||a?.dataAsOf}`),d.push(`${e("reports.pages","Pages")}: ${n.length}`),d.push(""),d.push(`${e("reports.audit_sql_sources","SQL Sources")}:`);const h=s?.sqlSources||[];h.length?h.forEach(A=>{d.push(`- ${A.source}`);const T=A.sql.replace(/\s+/g," ").trim();d.push(`  ${T.slice(0,1800)}`)}):d.push(`- ${e("common.no_data","No data")}`);const v=t.splitTextToSize(d.join(`
`),180);t.text(v,14,28)}t.save(`${o}.pdf`)}catch(b){r.error("Batch Export failed:",b),await U.error(e("reports.export_failed","Export failed."))}finally{i(!1),p(0)}},exportPackageToHtml:async(o,n,l,a,s)=>{i(!0),p(0);try{const g=[];for(let u=0;u<n.length;u++){const c=n[u],E=await N(c.elementId,c.orientation==="landscape"?1400:1e3);E&&g.push({title:c.title,image:E.imgData,status:c.status,threshold:c.threshold,subtitle:c.subtitle}),p(Math.round((u+1)/Math.max(n.length,1)*100))}const t=u=>u.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),b=new Date().toLocaleString(),w=a?.headerText?.trim()||l?.title||o,d=a?.footerText?.trim()||`${e("reports.generated_on")}: ${b}`,h=g.map((u,c)=>`<button class="nav-btn${c===0?" active":""}" data-page="${c}">${c+1}. ${t(u.title)}</button>`).join(""),v=g.map((u,c)=>`
                <section class="report-page${c===0?" active":""}" data-page="${c}">
                    ${a?.showHeader??!0?`<header class="page-header">${t(w)}</header>`:""}
                    ${u.status||u.threshold||u.subtitle?`<div class="page-context">
                        ${u.status?`<span class="status status-${u.status}">${t(u.status.toUpperCase())}</span>`:""}
                        ${u.threshold?`<span class="threshold">${t(u.threshold)}</span>`:""}
                        ${u.subtitle?`<span class="comment">${t(u.subtitle)}</span>`:""}
                    </div>`:""}
                    <img src="${u.image}" alt="${t(u.title)}" class="page-image" />
                    ${a?.showFooter??!0?`<footer class="page-footer"><span>${t(d)}</span><span>${c+1}/${Math.max(g.length,1)}</span></footer>`:""}
                </section>
                `).join(""),A=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t(o)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
    .shell { display: grid; grid-template-columns: 280px minmax(0,1fr); min-height: 100vh; }
    .sidebar { border-right: 1px solid #334155; padding: 16px; background: #111827; }
    .title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #94a3b8; margin: 0 0 12px; }
    .nav { display: grid; gap: 8px; }
    .nav-btn { text-align: left; border: 1px solid #334155; background: #0f172a; color: #cbd5e1; border-radius: 8px; padding: 10px; cursor: pointer; font-size: 13px; }
    .nav-btn.active { border-color: #2563eb; background: #1e3a8a33; color: #dbeafe; }
    .content { padding: 20px; background: radial-gradient(circle at top right, #1e293b 0%, #0f172a 60%); }
    .report-page { display: none; max-width: 1200px; margin: 0 auto; background: #ffffff; color: #0f172a; border-radius: 10px; overflow: hidden; box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
    .report-page.active { display: block; }
    .page-header, .page-footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; font-size: 12px; color: #475569; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .page-footer { border-top: 1px solid #e2e8f0; border-bottom: 0; }
    .page-context { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
    .page-image { display: block; width: 100%; height: auto; }
    .status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid #cbd5e1; }
    .status-ok { color: #065f46; background: #d1fae5; border-color: #6ee7b7; }
    .status-warning { color: #92400e; background: #fef3c7; border-color: #fcd34d; }
    .status-critical { color: #991b1b; background: #fee2e2; border-color: #fca5a5; }
    .status-info { color: #1e3a8a; background: #dbeafe; border-color: #93c5fd; }
    .threshold, .comment { font-size: 11px; color: #475569; }
    @media (max-width: 920px) { .shell { grid-template-columns: 1fr; } .sidebar { border-right: 0; border-bottom: 1px solid #334155; } }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <h1 class="title">${t(l?.title||o)}</h1>
      <p class="meta">${t(l?.subtitle||"")}</p>
      <p class="meta">${t(`${e("reports.generated_on")}: ${b}`)}</p>
      ${s?.dataAsOf||a?.dataAsOf?`<p class="meta">${t(`${e("reports.data_as_of","Data as of")}: ${s?.dataAsOf||a?.dataAsOf||""}`)}</p>`:""}
      ${a?.includeAuditAppendix?`<p class="meta">${t(`${e("reports.audit_sql_sources","SQL Sources")}: ${(s?.sqlSources||[]).length}`)}</p>`:""}
      <nav class="nav">${h||`<span class="meta">${t(e("common.no_data"))}</span>`}</nav>
    </aside>
    <main class="content">${v||""}</main>
  </div>
  <script>
    const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
    const pages = Array.from(document.querySelectorAll('.report-page'));
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-page');
        navButtons.forEach((b) => b.classList.toggle('active', b === btn));
        pages.forEach((p) => p.classList.toggle('active', p.getAttribute('data-page') === target));
      });
    });
  <\/script>
</body>
</html>`,T=new Blob([A],{type:"text/html;charset=utf-8"}),H=document.createElement("a"),z=o.trim().replace(/[<>:"/\\|?*]/g,"_")||"report-package";H.download=`${z}.html`,H.href=URL.createObjectURL(T),H.click(),URL.revokeObjectURL(H.href)}catch(g){r.error("HTML export failed:",g),await U.error(e("reports.export_failed","Export failed."))}finally{i(!1),p(0)}},exportPackageToPpt:async(o,n,l,a,s)=>{i(!0),p(0);try{const g=[];for(let c=0;c<n.length;c++){const E=n[c],O=await N(E.elementId,E.orientation==="landscape"?1400:1e3);O&&g.push({title:E.title,image:O.imgData,status:E.status,threshold:E.threshold}),p(Math.round((c+1)/Math.max(n.length,1)*100))}const t=c=>c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),b=new Date().toLocaleString(),w=a?.footerText?.trim()||`${e("reports.generated_on")}: ${b}`,d=l?.title||o,h=l?.subtitle||"",v=l?.author||"",A=g.map((c,E)=>`
                <div class="slide">
                    ${a?.showHeader??!0?`<div class="header">${t(c.title)}</div>`:""}
                    ${c.status||c.threshold?`<div class="context">${c.status?t(c.status.toUpperCase()):""}${c.threshold?` · ${t(c.threshold)}`:""}</div>`:""}
                    <div class="content"><img src="${c.image}" alt="${t(c.title)}" /></div>
                    ${a?.showFooter??!0?`<div class="footer"><span>${t(w)}</span><span>${E+1}/${Math.max(g.length,1)}</span></div>`:""}
                </div>
            `).join(""),T=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${t(o)}</title>
  <style>
    @page { size: 13.333in 7.5in; margin: 0; }
    html, body { margin: 0; padding: 0; font-family: Segoe UI, Arial, sans-serif; background: #0f172a; }
    .slide { width: 13.333in; height: 7.5in; background: #ffffff; page-break-after: always; display: flex; flex-direction: column; }
    .slide:last-child { page-break-after: auto; }
    .cover { justify-content: center; background: #1e293b; color: #ffffff; padding: 0.7in; box-sizing: border-box; }
    .cover h1 { margin: 0 0 0.2in; font-size: 42px; }
    .cover p { margin: 0.08in 0; color: #cbd5e1; font-size: 18px; }
    .header, .footer { height: 0.42in; padding: 0 0.35in; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #475569; background: #f8fafc; }
    .context { min-height: 0.28in; padding: 0.04in 0.35in; font-size: 11px; color: #334155; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 0.2in; box-sizing: border-box; background: #ffffff; }
    .content img { max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <div class="slide cover">
    <h1>${t(d)}</h1>
    ${h?`<p>${t(h)}</p>`:""}
    ${v?`<p>${t(v)}</p>`:""}
    <p>${t(`${e("reports.generated_on")}: ${b}`)}</p>
    ${s?.dataAsOf||a?.dataAsOf?`<p>${t(`${e("reports.data_as_of","Data as of")}: ${s?.dataAsOf||a?.dataAsOf||""}`)}</p>`:""}
  </div>
  ${A}
  ${a?.includeAuditAppendix?`<div class="slide"><div class="header">${t(e("reports.audit_appendix_title","Audit Appendix"))}</div><div class="content" style="align-items:flex-start; justify-content:flex-start;"><pre style="font-family: Consolas, monospace; font-size: 10px; color: #334155; white-space: pre-wrap;">${t((s?.sqlSources||[]).map(c=>`${c.source}
${c.sql}`).join(`

`)||e("common.no_data","No data"))}</pre></div></div>`:""}
</body>
</html>`,H=new Blob([T],{type:"application/vnd.ms-powerpoint"}),z=document.createElement("a"),u=o.trim().replace(/[<>:"/\\|?*]/g,"_")||"report-package";z.download=`${u}.ppt`,z.href=URL.createObjectURL(H),z.click(),URL.revokeObjectURL(z.href)}catch(g){r.error("PPT export failed:",g),await U.error(e("reports.export_failed","Export failed."))}finally{i(!1),p(0)}},exportToImage:async(o,n)=>{i(!0);try{const l=await D(),a=document.getElementById(o);if(!a)return;await new Promise(t=>setTimeout(t,500));const s=await l(a,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff"}),g=document.createElement("a");g.download=`${n}.png`,g.href=s.toDataURL("image/png"),g.click()}catch(l){r.error("Export failed:",l)}finally{i(!1)}}}},Q=e=>{const r=e.toLowerCase();return r.includes("price")||r.includes("amount")||r.includes("preis")||r.includes("betrag")||r.includes("summe")||r.includes("kosten")||r.includes("total")},X=(e,r)=>{if(typeof e!="number"){if(typeof e=="string")return e;if(typeof e=="boolean")return e?"true":"false";if(e==null)return"";if(typeof e=="object")try{return JSON.stringify(e)}catch{return String(e)}return String(e)}return r&&Q(r)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(e):new Intl.NumberFormat("de-DE").format(e)},ae=e=>{if(typeof e=="number")return Number.isFinite(e);if(typeof e=="string"){const r=e.replace(/\s+/g,"").replace(",",".").replace(/[^0-9.+-]/g,"");return r?Number.isFinite(Number(r)):!1}return!1},oe=e=>{if(typeof e=="number")return e;if(typeof e=="string"){const r=e.replace(/\s+/g,"").replace(",",".").replace(/[^0-9.+-]/g,"");return r?Number(r):Number.NaN}return Number.NaN},se=(e,r,f)=>!r||!f?[]:e.map(i=>{const S=Number(i[r]),p=Number(i[f]);return{...i,[r]:S,[f]:p}}).filter(i=>Number.isFinite(i[r])&&Number.isFinite(i[f])),ne=(e,r,f)=>Array.isArray(e.lineSeries)&&e.lineSeries.length>0?e.lineSeries.includes(r):Array.isArray(e.barSeries)&&e.barSeries.length>0?!e.barSeries.includes(r):f>0,le=({data:e,rows:r,cols:f,measures:i})=>{const{t:S}=J(),p=W.useMemo(()=>{if(!e||e.length===0||i.length===0)return null;const k=new Set,y=new Set,m={};e.forEach(_=>{const P=r.map(x=>String(_[x]??"")).join(" | "),L=f.map(x=>String(_[x]??"")).join(" | ");k.add(P),y.add(L),m[P]||(m[P]={}),m[P][L]||(m[P][L]={}),i.forEach(x=>{m[P][L][x.field]||(m[P][L][x.field]=[]);const C=Number(_[x.field]);isNaN(C)?x.agg==="count"&&m[P][L][x.field].push(1):m[P][L][x.field].push(C)})});const j=Array.from(k).sort(),F=Array.from(y).sort(),N={};return j.forEach(_=>{N[_]={},F.forEach(P=>{N[_][P]={},i.forEach(L=>{const x=m[_]?.[P]?.[L.field]||[];let C=0;if(x.length>0)switch(L.agg){case"sum":C=x.reduce((o,n)=>o+n,0);break;case"count":C=x.length;break;case"avg":C=x.reduce((o,n)=>o+n,0)/x.length;break;case"min":C=Math.min(...x);break;case"max":C=Math.max(...x);break}N[_][P][L.field]=C})})}),{rowLabels:j,colLabels:F,values:N}},[e,r,f,i]);return p?$.jsx("div",{className:"w-full h-full overflow-auto bg-white dark:bg-slate-900 shadow-inner rounded-lg border border-slate-200 dark:border-slate-700",children:$.jsxs("table",{className:"min-w-full text-xs border-collapse",children:[$.jsxs("thead",{className:"sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700",children:[$.jsxs("tr",{children:[$.jsx("th",{colSpan:r.length,className:"p-2 border border-slate-300 dark:border-slate-700 font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase tracking-wider",children:r.join(" / ")}),p.colLabels.map(k=>$.jsx("th",{colSpan:i.length,className:"p-2 border border-slate-300 dark:border-slate-700 font-bold text-center bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",children:k||"--"},k))]}),i.length>1&&$.jsxs("tr",{children:[$.jsx("th",{colSpan:r.length,className:"border border-slate-300 dark:border-slate-700"}),p.colLabels.map(k=>i.map(y=>$.jsxs("th",{className:"p-1 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 font-medium",children:[y.field," (",S(`querybuilder.pivot_agg_${y.agg}`),")"]},`${k}-${y.field}`)))]}),i.length===1&&$.jsxs("tr",{children:[$.jsx("th",{colSpan:r.length,className:"border border-slate-300 dark:border-slate-700"}),p.colLabels.map(k=>$.jsx("th",{className:"p-1 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 font-medium italic",children:S(`querybuilder.pivot_agg_${i[0].agg}`)},`measure-${k}`))]})]}),$.jsx("tbody",{children:p.rowLabels.map((k,y)=>$.jsxs("tr",{className:y%2===0?"bg-white dark:bg-slate-900":"bg-slate-50/30 dark:bg-slate-800/20",children:[k.split(" | ").map((m,j)=>$.jsx("td",{className:"p-2 border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap",children:m},j)),p.colLabels.map(m=>i.map(j=>{const F=p.values[k][m][j.field];return $.jsx("td",{className:"p-2 border border-slate-200 dark:border-slate-800 text-right font-mono tabular-nums",children:X(F,j.field)},`${m}-${j.field}`)}))]},k))})]})}):$.jsx("div",{className:"p-8 text-center text-slate-400 italic",children:S("common.no_data")})},M=e=>e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),Y=e=>{const r=e.trim();return r&&/^(https?:|mailto:|tel:)/i.test(r)?r:"#"},I=e=>{let r=M(e);return r=r.replace(/`([^`]+)`/g,'<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[0.9em]">$1</code>'),r=r.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),r=r.replace(/\*([^*]+)\*/g,"<em>$1</em>"),r=r.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(f,i,S)=>{const p=Y(S);return`<a class="text-blue-600 dark:text-blue-400 underline underline-offset-2" href="${M(p)}" target="_blank" rel="noopener noreferrer">${i}</a>`}),r},Z=e=>{const r=e.replace(/\r\n/g,`
`).split(`
`),f=[];let i=!1,S=!1;const p=()=>{i&&(f.push("</ul>"),i=!1),S&&(f.push("</ol>"),S=!1)};for(const k of r){const y=k.trim();if(!y){p();continue}const m=y.match(/^(#{1,6})\s+(.+)$/);if(m){p();const _=m[1].length;f.push(`<h${_} class="font-bold ${_<=2?"text-lg":_===3?"text-base":"text-sm"} mt-2 mb-1">${I(m[2])}</h${_}>`);continue}const j=y.match(/^>\s?(.+)$/);if(j){p(),f.push(`<blockquote class="border-l-2 border-slate-300 dark:border-slate-600 pl-3 italic text-slate-600 dark:text-slate-300 my-1">${I(j[1])}</blockquote>`);continue}const F=y.match(/^[-*+]\s+(.+)$/);if(F){S&&(f.push("</ol>"),S=!1),i||(f.push('<ul class="list-disc list-inside space-y-1 my-1">'),i=!0),f.push(`<li>${I(F[1])}</li>`);continue}const N=y.match(/^\d+\.\s+(.+)$/);if(N){i&&(f.push("</ul>"),i=!1),S||(f.push('<ol class="list-decimal list-inside space-y-1 my-1">'),S=!0),f.push(`<li>${I(N[1])}</li>`);continue}if(/^(-{3,}|\*{3,}|_{3,})$/.test(y)){p(),f.push('<hr class="my-2 border-slate-200 dark:border-slate-700" />');continue}p(),f.push(`<p class="my-1">${I(y)}</p>`)}return p(),f.join("")},ie=({markdown:e,className:r="",emptyText:f=""})=>{const i=e.trim();return i?$.jsx("div",{className:r,dangerouslySetInnerHTML:{__html:Z(i)}}):$.jsx("div",{className:r,children:f})};export{ie as M,le as P,se as b,X as f,ae as i,oe as p,ne as r,re as u};
