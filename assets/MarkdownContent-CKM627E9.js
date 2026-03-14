import{_ as G}from"./vendor-pdf-C80LOIEG.js";import{r as W}from"./vendor-react-BjA4vbPC.js";import{u as K,d as U,f as J,j as $}from"./index-DxAiExaB.js";let R=null,q=null;const D=async()=>(R||(R=G(()=>import("./vendor-canvas-DXEQVQnt.js"),[]).then(t=>t.default)),await R),B=async()=>(q||(q=G(()=>import("./vendor-pdf-C80LOIEG.js").then(t=>t.j),[]).then(t=>t.jsPDF)),await q),ae=()=>{const{t}=K(),n=J("ReportExport"),[u,d]=W.useState(!1),[_,f]=W.useState(0),k=o=>{const s=o.replace("#","");if(!/^[0-9a-fA-F]{6}$/.test(s))return[30,41,59];const l=parseInt(s.slice(0,2),16),a=parseInt(s.slice(2,4),16),r=parseInt(s.slice(4,6),16);return[l,a,r]},w=o=>new Promise((s,l)=>{const a=new FileReader;a.onloadend=()=>s(String(a.result||"")),a.onerror=()=>l(new Error("Failed to read image blob")),a.readAsDataURL(o)}),m=(o,s)=>{const l=o.toLowerCase();if(l.includes("jpeg")||l.includes("jpg"))return"JPEG";if(l.includes("webp"))return"WEBP";if(l.includes("png"))return"PNG";const a=s.toLowerCase();return a.endsWith(".jpg")||a.endsWith(".jpeg")?"JPEG":a.endsWith(".webp")?"WEBP":"PNG"},j=async o=>{if(o.startsWith("data:image/")){const p=o.includes("image/jpeg")||o.includes("image/jpg")?"JPEG":o.includes("image/webp")?"WEBP":"PNG";return{data:o,format:p}}const s=await fetch(o,{mode:"cors",referrerPolicy:"no-referrer"});if(!s.ok)throw new Error(`Image request failed with status ${s.status}`);const l=await s.blob(),a=m(l.type,o);return{data:await w(l),format:a}},F=(o,s,l,a,r)=>{const p=r?.showHeader??!0,e=r?.showFooter??!0,b=o.internal.pageSize.getWidth(),y=o.internal.pageSize.getHeight();if(p&&(o.setFontSize(10),o.setTextColor(120,120,120),o.text(r?.headerText||s.title,10,10),o.line(10,12,b-10,12),s.status&&s.status!=="info")){const c=s.status.toUpperCase();o.setFontSize(8);const h=s.status==="critical"?[220,38,38]:s.status==="warning"?[217,119,6]:[5,150,105];o.setTextColor(h[0],h[1],h[2]),o.text(c,b-10,10,{align:"right"})}if(e){o.setFontSize(9),o.setTextColor(130,130,130);const c=r?.dataAsOf?.trim(),h=r?.footerText||(c?`${t("reports.data_as_of","Data as of")}: ${c}`:`${t("reports.generated_on")}: ${new Date().toLocaleDateString()}`);o.text(h,10,y-8);const v=`${l}/${a}`;o.text(v,b-10,y-8,{align:"right"})}},T=async(o,s)=>{const l=await D(),a=document.getElementById(o);if(!a)return null;const r=a.cloneNode(!0);r.style.position="fixed",r.style.top="0",r.style.left="500vw",r.style.width=s?`${s}px`:`${a.scrollWidth||1200}px`,r.style.height="auto",r.style.minHeight=`${a.scrollHeight||800}px`,r.style.overflow="visible",r.style.zIndex="-100",r.style.padding="40px",r.style.backgroundColor="#ffffff",r.querySelectorAll(".overflow-auto, .overflow-y-auto, .overflow-x-auto").forEach(y=>{y.style.overflow="visible",y.style.height="auto"}),r.querySelectorAll("h1, h2, h3, h4, h5, h6, .truncate").forEach(y=>{const c=y;c.style.overflow="visible",c.style.textOverflow="clip",c.style.lineHeight="1.35",c.style.paddingBottom="2px"}),document.body.appendChild(r),await new Promise(y=>setTimeout(y,800)),"fonts"in document&&await document.fonts.ready;const b=await l(r,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff",width:r.offsetWidth,height:r.offsetHeight});return document.body.removeChild(r),{imgData:b.toDataURL("image/png"),width:b.width,height:b.height}};return{isExporting:u,exportProgress:_,exportToPdf:async(o,s,l="landscape")=>{d(!0),f(0);try{const a=await B(),r=await T(o);if(!r)return;const p=new a({orientation:l,unit:"mm",format:"a4"}),e=p.internal.pageSize.getWidth(),b=p.internal.pageSize.getHeight(),y=Math.min(e/(r.width/2),b/(r.height/2)),c=r.width/2*y,h=r.height/2*y;p.addImage(r.imgData,"PNG",(e-c)/2,(b-h)/2,c,h),p.save(`${s}.pdf`)}catch(a){n.error("Export failed:",a)}finally{d(!1)}},exportPackageToPdf:async(o,s,l,a,r)=>{d(!0),f(0);const p=await B(),e=new p({orientation:"portrait",unit:"mm",format:"a4"});try{if(l){const[c,h,v]=l.themeColor?k(l.themeColor):[30,41,59];if(e.setFillColor(c,h,v),e.rect(0,0,210,297,"F"),e.setTextColor(255,255,255),e.setFontSize(32),e.text(l.title,20,100),l.subtitle&&(e.setFontSize(16),e.setTextColor(148,163,184),e.text(l.subtitle,20,115)),e.setFontSize(12),e.setTextColor(100,116,139),e.text(`${t("reports.generated_on")}: ${new Date().toLocaleDateString()}`,20,260),l.author&&e.text(`${t("reports.author_prefix")}: ${l.author}`,20,267),l.logoUrl)try{const E=await j(l.logoUrl),z=30,C=210-20-z;e.addImage(E.data,E.format,C,25,z,z)}catch(E){n.warn("Cover logo could not be loaded for PDF export. The host likely blocks cross-origin image access.",E)}e.addPage()}const b=l?2:1,y=(l?1:0)+s.length;for(let c=0;c<s.length;c++){f(Math.round((c+1)/s.length*100));const h=s[c],v=await T(h.elementId,h.orientation==="landscape"?1400:1e3);if(v){const E=h.orientation||"portrait";(c>0||l)&&e.addPage(void 0,E);const z=e.internal.pageSize.getWidth(),H=e.internal.pageSize.getHeight();((a?.footerMode??"all")==="all"||(a?.footerMode??"all")==="content_only")&&F(e,h,b+c,y,a);const C=a?.showHeader===!1?12:20,g=a?.showFooter===!1?12:18,i=Math.min((z-20)/(v.width/2),(H-(C+g))/(v.height/2)),A=v.width/2*i,O=v.height/2*i;e.addImage(v.imgData,"PNG",(z-A)/2,C,A,O)}}if(a?.includeAuditAppendix){e.addPage(),e.setFontSize(18),e.setTextColor(30,41,59),e.text(t("reports.audit_appendix_title","Audit Appendix"),14,18),e.setFontSize(10),e.setTextColor(71,85,105);const c=[];c.push(`${t("reports.pack_name","Package")}: ${r?.packName||o}`),c.push(`${t("reports.generated_on")}: ${r?.generatedAt||new Date().toISOString()}`),(r?.dataAsOf||a?.dataAsOf)&&c.push(`${t("reports.data_as_of","Data as of")}: ${r?.dataAsOf||a?.dataAsOf}`),c.push(`${t("reports.pages","Pages")}: ${s.length}`),c.push(""),c.push(`${t("reports.audit_sql_sources","SQL Sources")}:`);const h=r?.sqlSources||[];h.length?h.forEach(E=>{c.push(`- ${E.source}`);const z=E.sql.replace(/\s+/g," ").trim();c.push(`  ${z.slice(0,1800)}`)}):c.push(`- ${t("common.no_data","No data")}`);const v=e.splitTextToSize(c.join(`
`),180);e.text(v,14,28)}e.save(`${o}.pdf`)}catch(b){n.error("Batch Export failed:",b),await U.error(t("reports.export_failed","Export failed."))}finally{d(!1),f(0)}},exportPackageToHtml:async(o,s,l,a,r)=>{d(!0),f(0);try{const p=[];for(let g=0;g<s.length;g++){const i=s[g],A=await T(i.elementId,i.orientation==="landscape"?1400:1e3);A&&p.push({title:i.title,image:A.imgData,status:i.status,threshold:i.threshold,subtitle:i.subtitle}),f(Math.round((g+1)/Math.max(s.length,1)*100))}const e=g=>g.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),b=new Date().toLocaleString(),y=a?.headerText?.trim()||l?.title||o,c=a?.footerText?.trim()||`${t("reports.generated_on")}: ${b}`,h=p.map((g,i)=>`<button class="nav-btn${i===0?" active":""}" data-page="${i}">${i+1}. ${e(g.title)}</button>`).join(""),v=p.map((g,i)=>`
                <section class="report-page${i===0?" active":""}" data-page="${i}">
                    ${a?.showHeader??!0?`<header class="page-header">${e(y)}</header>`:""}
                    ${g.status||g.threshold||g.subtitle?`<div class="page-context">
                        ${g.status?`<span class="status status-${g.status}">${e(g.status.toUpperCase())}</span>`:""}
                        ${g.threshold?`<span class="threshold">${e(g.threshold)}</span>`:""}
                        ${g.subtitle?`<span class="comment">${e(g.subtitle)}</span>`:""}
                    </div>`:""}
                    <img src="${g.image}" alt="${e(g.title)}" class="page-image" />
                    ${a?.showFooter??!0?`<footer class="page-footer"><span>${e(c)}</span><span>${i+1}/${Math.max(p.length,1)}</span></footer>`:""}
                </section>
                `).join(""),E=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${e(o)}</title>
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
      <h1 class="title">${e(l?.title||o)}</h1>
      <p class="meta">${e(l?.subtitle||"")}</p>
      <p class="meta">${e(`${t("reports.generated_on")}: ${b}`)}</p>
      ${r?.dataAsOf||a?.dataAsOf?`<p class="meta">${e(`${t("reports.data_as_of","Data as of")}: ${r?.dataAsOf||a?.dataAsOf||""}`)}</p>`:""}
      ${a?.includeAuditAppendix?`<p class="meta">${e(`${t("reports.audit_sql_sources","SQL Sources")}: ${(r?.sqlSources||[]).length}`)}</p>`:""}
      <nav class="nav">${h||`<span class="meta">${e(t("common.no_data"))}</span>`}</nav>
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
</html>`,z=new Blob([E],{type:"text/html;charset=utf-8"}),H=document.createElement("a"),C=o.trim().replace(/[<>:"/\\|?*]/g,"_")||"report-package";H.download=`${C}.html`,H.href=URL.createObjectURL(z),H.click(),URL.revokeObjectURL(H.href)}catch(p){n.error("HTML export failed:",p),await U.error(t("reports.export_failed","Export failed."))}finally{d(!1),f(0)}},exportPackageToPpt:async(o,s,l,a,r)=>{d(!0),f(0);try{const p=[];for(let i=0;i<s.length;i++){const A=s[i],O=await T(A.elementId,A.orientation==="landscape"?1400:1e3);O&&p.push({title:A.title,image:O.imgData,status:A.status,threshold:A.threshold}),f(Math.round((i+1)/Math.max(s.length,1)*100))}const e=i=>i.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),b=new Date().toLocaleString(),y=a?.footerText?.trim()||`${t("reports.generated_on")}: ${b}`,c=l?.title||o,h=l?.subtitle||"",v=l?.author||"",E=p.map((i,A)=>`
                <div class="slide">
                    ${a?.showHeader??!0?`<div class="header">${e(i.title)}</div>`:""}
                    ${i.status||i.threshold?`<div class="context">${i.status?e(i.status.toUpperCase()):""}${i.threshold?` · ${e(i.threshold)}`:""}</div>`:""}
                    <div class="content"><img src="${i.image}" alt="${e(i.title)}" /></div>
                    ${a?.showFooter??!0?`<div class="footer"><span>${e(y)}</span><span>${A+1}/${Math.max(p.length,1)}</span></div>`:""}
                </div>
            `).join(""),z=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${e(o)}</title>
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
    <h1>${e(c)}</h1>
    ${h?`<p>${e(h)}</p>`:""}
    ${v?`<p>${e(v)}</p>`:""}
    <p>${e(`${t("reports.generated_on")}: ${b}`)}</p>
    ${r?.dataAsOf||a?.dataAsOf?`<p>${e(`${t("reports.data_as_of","Data as of")}: ${r?.dataAsOf||a?.dataAsOf||""}`)}</p>`:""}
  </div>
  ${E}
  ${a?.includeAuditAppendix?`<div class="slide"><div class="header">${e(t("reports.audit_appendix_title","Audit Appendix"))}</div><div class="content" style="align-items:flex-start; justify-content:flex-start;"><pre style="font-family: Consolas, monospace; font-size: 10px; color: #334155; white-space: pre-wrap;">${e((r?.sqlSources||[]).map(i=>`${i.source}
${i.sql}`).join(`

`)||t("common.no_data","No data"))}</pre></div></div>`:""}
</body>
</html>`,H=new Blob([z],{type:"application/vnd.ms-powerpoint"}),C=document.createElement("a"),g=o.trim().replace(/[<>:"/\\|?*]/g,"_")||"report-package";C.download=`${g}.ppt`,C.href=URL.createObjectURL(H),C.click(),URL.revokeObjectURL(C.href)}catch(p){n.error("PPT export failed:",p),await U.error(t("reports.export_failed","Export failed."))}finally{d(!1),f(0)}},exportToImage:async(o,s)=>{d(!0);try{const l=await D(),a=document.getElementById(o);if(!a)return;await new Promise(e=>setTimeout(e,500));const r=await l(a,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff"}),p=document.createElement("a");p.download=`${s}.png`,p.href=r.toDataURL("image/png"),p.click()}catch(l){n.error("Export failed:",l)}finally{d(!1)}}}},V=t=>{const n=t.toLowerCase();return n.includes("price")||n.includes("amount")||n.includes("preis")||n.includes("betrag")||n.includes("summe")||n.includes("kosten")||n.includes("total")},Q=(t,n)=>{if(typeof t!="number"){if(typeof t=="string")return t;if(typeof t=="boolean")return t?"true":"false";if(t==null)return"";if(typeof t=="object")try{return JSON.stringify(t)}catch{return String(t)}return String(t)}return n&&V(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(t):new Intl.NumberFormat("de-DE").format(t)},oe=({data:t,rows:n,cols:u,measures:d})=>{const{t:_}=K(),f=W.useMemo(()=>{if(!t||t.length===0||d.length===0)return null;const k=new Set,w=new Set,m={};t.forEach(S=>{const P=n.map(x=>String(S[x]??"")).join(" | "),L=u.map(x=>String(S[x]??"")).join(" | ");k.add(P),w.add(L),m[P]||(m[P]={}),m[P][L]||(m[P][L]={}),d.forEach(x=>{m[P][L][x.field]||(m[P][L][x.field]=[]);const N=Number(S[x.field]);isNaN(N)?x.agg==="count"&&m[P][L][x.field].push(1):m[P][L][x.field].push(N)})});const j=Array.from(k).sort(),F=Array.from(w).sort(),T={};return j.forEach(S=>{T[S]={},F.forEach(P=>{T[S][P]={},d.forEach(L=>{const x=m[S]?.[P]?.[L.field]||[];let N=0;if(x.length>0)switch(L.agg){case"sum":N=x.reduce((o,s)=>o+s,0);break;case"count":N=x.length;break;case"avg":N=x.reduce((o,s)=>o+s,0)/x.length;break;case"min":N=Math.min(...x);break;case"max":N=Math.max(...x);break}T[S][P][L.field]=N})})}),{rowLabels:j,colLabels:F,values:T}},[t,n,u,d]);return f?$.jsx("div",{className:"w-full h-full overflow-auto bg-white dark:bg-slate-900 shadow-inner rounded-lg border border-slate-200 dark:border-slate-700",children:$.jsxs("table",{className:"min-w-full text-xs border-collapse",children:[$.jsxs("thead",{className:"sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700",children:[$.jsxs("tr",{children:[$.jsx("th",{colSpan:n.length,className:"p-2 border border-slate-300 dark:border-slate-700 font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase tracking-wider",children:n.join(" / ")}),f.colLabels.map(k=>$.jsx("th",{colSpan:d.length,className:"p-2 border border-slate-300 dark:border-slate-700 font-bold text-center bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",children:k||"--"},k))]}),d.length>1&&$.jsxs("tr",{children:[$.jsx("th",{colSpan:n.length,className:"border border-slate-300 dark:border-slate-700"}),f.colLabels.map(k=>d.map(w=>$.jsxs("th",{className:"p-1 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 font-medium",children:[w.field," (",_(`querybuilder.pivot_agg_${w.agg}`),")"]},`${k}-${w.field}`)))]}),d.length===1&&$.jsxs("tr",{children:[$.jsx("th",{colSpan:n.length,className:"border border-slate-300 dark:border-slate-700"}),f.colLabels.map(k=>$.jsx("th",{className:"p-1 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 font-medium italic",children:_(`querybuilder.pivot_agg_${d[0].agg}`)},`measure-${k}`))]})]}),$.jsx("tbody",{children:f.rowLabels.map((k,w)=>$.jsxs("tr",{className:w%2===0?"bg-white dark:bg-slate-900":"bg-slate-50/30 dark:bg-slate-800/20",children:[k.split(" | ").map((m,j)=>$.jsx("td",{className:"p-2 border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap",children:m},j)),f.colLabels.map(m=>d.map(j=>{const F=f.values[k][m][j.field];return $.jsx("td",{className:"p-2 border border-slate-200 dark:border-slate-800 text-right font-mono tabular-nums",children:Q(F,j.field)},`${m}-${j.field}`)}))]},k))})]})}):$.jsx("div",{className:"p-8 text-center text-slate-400 italic",children:_("common.no_data")})},M=t=>t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),X=t=>{const n=t.trim();return n&&/^(https?:|mailto:|tel:)/i.test(n)?n:"#"},I=t=>{let n=M(t);return n=n.replace(/`([^`]+)`/g,'<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[0.9em]">$1</code>'),n=n.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),n=n.replace(/\*([^*]+)\*/g,"<em>$1</em>"),n=n.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(u,d,_)=>{const f=X(_);return`<a class="text-blue-600 dark:text-blue-400 underline underline-offset-2" href="${M(f)}" target="_blank" rel="noopener noreferrer">${d}</a>`}),n},Y=t=>{const n=t.replace(/\r\n/g,`
`).split(`
`),u=[];let d=!1,_=!1;const f=()=>{d&&(u.push("</ul>"),d=!1),_&&(u.push("</ol>"),_=!1)};for(const k of n){const w=k.trim();if(!w){f();continue}const m=w.match(/^(#{1,6})\s+(.+)$/);if(m){f();const S=m[1].length;u.push(`<h${S} class="font-bold ${S<=2?"text-lg":S===3?"text-base":"text-sm"} mt-2 mb-1">${I(m[2])}</h${S}>`);continue}const j=w.match(/^>\s?(.+)$/);if(j){f(),u.push(`<blockquote class="border-l-2 border-slate-300 dark:border-slate-600 pl-3 italic text-slate-600 dark:text-slate-300 my-1">${I(j[1])}</blockquote>`);continue}const F=w.match(/^[-*+]\s+(.+)$/);if(F){_&&(u.push("</ol>"),_=!1),d||(u.push('<ul class="list-disc list-inside space-y-1 my-1">'),d=!0),u.push(`<li>${I(F[1])}</li>`);continue}const T=w.match(/^\d+\.\s+(.+)$/);if(T){d&&(u.push("</ul>"),d=!1),_||(u.push('<ol class="list-decimal list-inside space-y-1 my-1">'),_=!0),u.push(`<li>${I(T[1])}</li>`);continue}if(/^(-{3,}|\*{3,}|_{3,})$/.test(w)){f(),u.push('<hr class="my-2 border-slate-200 dark:border-slate-700" />');continue}f(),u.push(`<p class="my-1">${I(w)}</p>`)}return f(),u.join("")},re=({markdown:t,className:n="",emptyText:u=""})=>{const d=t.trim();return d?$.jsx("div",{className:n,dangerouslySetInnerHTML:{__html:Y(d)}}):$.jsx("div",{className:n,children:u})};export{re as M,oe as P,Q as f,ae as u};
