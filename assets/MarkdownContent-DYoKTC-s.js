import{r as U}from"./vendor-react-D64xOC9_.js";import R from"./vendor-canvas-DXEQVQnt.js";import{E as W}from"./vendor-pdf-FXkUb51H.js";import{u as M,b as F,c as D,j as y}from"./index-BvycqZXQ.js";const ee=()=>{const{t}=M(),n=D("ReportExport"),[h,d]=U.useState(!1),[S,f]=U.useState(0),k=o=>{const s=o.replace("#","");if(!/^[0-9a-fA-F]{6}$/.test(s))return[30,41,59];const r=parseInt(s.slice(0,2),16),e=parseInt(s.slice(2,4),16),p=parseInt(s.slice(4,6),16);return[r,e,p]},w=o=>new Promise((s,r)=>{const e=new FileReader;e.onloadend=()=>s(String(e.result||"")),e.onerror=()=>r(new Error("Failed to read image blob")),e.readAsDataURL(o)}),x=(o,s)=>{const r=o.toLowerCase();if(r.includes("jpeg")||r.includes("jpg"))return"JPEG";if(r.includes("webp"))return"WEBP";if(r.includes("png"))return"PNG";const e=s.toLowerCase();return e.endsWith(".jpg")||e.endsWith(".jpeg")?"JPEG":e.endsWith(".webp")?"WEBP":"PNG"},_=async o=>{if(o.startsWith("data:image/")){const a=o.includes("image/jpeg")||o.includes("image/jpg")?"JPEG":o.includes("image/webp")?"WEBP":"PNG";return{data:o,format:a}}const s=await fetch(o,{mode:"cors",referrerPolicy:"no-referrer"});if(!s.ok)throw new Error(`Image request failed with status ${s.status}`);const r=await s.blob(),e=x(r.type,o);return{data:await w(r),format:e}},N=(o,s,r,e,p)=>{const a=p?.showHeader??!0,l=p?.showFooter??!0,u=o.internal.pageSize.getWidth(),c=o.internal.pageSize.getHeight();if(a&&(o.setFontSize(10),o.setTextColor(120,120,120),o.text(p?.headerText||s.title,10,10),o.line(10,12,u-10,12),s.status&&s.status!=="info")){const b=s.status.toUpperCase();o.setFontSize(8);const m=s.status==="critical"?[220,38,38]:s.status==="warning"?[217,119,6]:[5,150,105];o.setTextColor(m[0],m[1],m[2]),o.text(b,u-10,10,{align:"right"})}if(l){o.setFontSize(9),o.setTextColor(130,130,130);const b=p?.dataAsOf?.trim(),m=p?.footerText||(b?`${t("reports.data_as_of","Data as of")}: ${b}`:`${t("reports.generated_on")}: ${new Date().toLocaleDateString()}`);o.text(m,10,c-8);const v=`${r}/${e}`;o.text(v,u-10,c-8,{align:"right"})}},P=async(o,s)=>{const r=document.getElementById(o);if(!r)return null;const e=r.cloneNode(!0);e.style.position="fixed",e.style.top="0",e.style.left="500vw",e.style.width=s?`${s}px`:`${r.scrollWidth||1200}px`,e.style.height="auto",e.style.minHeight=`${r.scrollHeight||800}px`,e.style.overflow="visible",e.style.zIndex="-100",e.style.padding="40px",e.style.backgroundColor="#ffffff",e.querySelectorAll(".overflow-auto, .overflow-y-auto, .overflow-x-auto").forEach(u=>{u.style.overflow="visible",u.style.height="auto"}),e.querySelectorAll("h1, h2, h3, h4, h5, h6, .truncate").forEach(u=>{const c=u;c.style.overflow="visible",c.style.textOverflow="clip",c.style.lineHeight="1.35",c.style.paddingBottom="2px"}),document.body.appendChild(e),await new Promise(u=>setTimeout(u,800)),"fonts"in document&&await document.fonts.ready;const l=await R(e,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff",width:e.offsetWidth,height:e.offsetHeight});return document.body.removeChild(e),{imgData:l.toDataURL("image/png"),width:l.width,height:l.height}};return{isExporting:h,exportProgress:S,exportToPdf:async(o,s,r="landscape")=>{d(!0),f(0);try{const e=await P(o);if(!e)return;const p=new W({orientation:r,unit:"mm",format:"a4"}),a=p.internal.pageSize.getWidth(),l=p.internal.pageSize.getHeight(),u=Math.min(a/(e.width/2),l/(e.height/2)),c=e.width/2*u,b=e.height/2*u;p.addImage(e.imgData,"PNG",(a-c)/2,(l-b)/2,c,b),p.save(`${s}.pdf`)}catch(e){n.error("Export failed:",e)}finally{d(!1)}},exportPackageToPdf:async(o,s,r,e,p)=>{d(!0),f(0);const a=new W({orientation:"portrait",unit:"mm",format:"a4"});try{if(r){const[c,b,m]=r.themeColor?k(r.themeColor):[30,41,59];if(a.setFillColor(c,b,m),a.rect(0,0,210,297,"F"),a.setTextColor(255,255,255),a.setFontSize(32),a.text(r.title,20,100),r.subtitle&&(a.setFontSize(16),a.setTextColor(148,163,184),a.text(r.subtitle,20,115)),a.setFontSize(12),a.setTextColor(100,116,139),a.text(`${t("reports.generated_on")}: ${new Date().toLocaleDateString()}`,20,260),r.author&&a.text(`${t("reports.author_prefix")}: ${r.author}`,20,267),r.logoUrl)try{const v=await _(r.logoUrl),T=30,z=210-20-T;a.addImage(v.data,v.format,z,25,T,T)}catch(v){n.warn("Cover logo could not be loaded for PDF export. The host likely blocks cross-origin image access.",v)}a.addPage()}const l=r?2:1,u=(r?1:0)+s.length;for(let c=0;c<s.length;c++){f(Math.round((c+1)/s.length*100));const b=s[c],m=await P(b.elementId,b.orientation==="landscape"?1400:1e3);if(m){const v=b.orientation||"portrait";(c>0||r)&&a.addPage(void 0,v);const T=a.internal.pageSize.getWidth(),I=a.internal.pageSize.getHeight();((e?.footerMode??"all")==="all"||(e?.footerMode??"all")==="content_only")&&N(a,b,l+c,u,e);const z=e?.showHeader===!1?12:20,H=e?.showFooter===!1?12:18,g=Math.min((T-20)/(m.width/2),(I-(z+H))/(m.height/2)),i=m.width/2*g,L=m.height/2*g;a.addImage(m.imgData,"PNG",(T-i)/2,z,i,L)}}if(e?.includeAuditAppendix){a.addPage(),a.setFontSize(18),a.setTextColor(30,41,59),a.text(t("reports.audit_appendix_title","Audit Appendix"),14,18),a.setFontSize(10),a.setTextColor(71,85,105);const c=[];c.push(`${t("reports.pack_name","Package")}: ${p?.packName||o}`),c.push(`${t("reports.generated_on")}: ${p?.generatedAt||new Date().toISOString()}`),(p?.dataAsOf||e?.dataAsOf)&&c.push(`${t("reports.data_as_of","Data as of")}: ${p?.dataAsOf||e?.dataAsOf}`),c.push(`${t("reports.pages","Pages")}: ${s.length}`),c.push(""),c.push(`${t("reports.audit_sql_sources","SQL Sources")}:`);const b=p?.sqlSources||[];b.length?b.forEach(v=>{c.push(`- ${v.source}`);const T=v.sql.replace(/\s+/g," ").trim();c.push(`  ${T.slice(0,1800)}`)}):c.push(`- ${t("common.no_data","No data")}`);const m=a.splitTextToSize(c.join(`
`),180);a.text(m,14,28)}a.save(`${o}.pdf`)}catch(l){n.error("Batch Export failed:",l),await F.error(t("reports.export_failed","Export failed."))}finally{d(!1),f(0)}},exportPackageToHtml:async(o,s,r,e,p)=>{d(!0),f(0);try{const a=[];for(let g=0;g<s.length;g++){const i=s[g],L=await P(i.elementId,i.orientation==="landscape"?1400:1e3);L&&a.push({title:i.title,image:L.imgData,status:i.status,threshold:i.threshold,subtitle:i.subtitle}),f(Math.round((g+1)/Math.max(s.length,1)*100))}const l=g=>g.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),u=new Date().toLocaleString(),c=e?.headerText?.trim()||r?.title||o,b=e?.footerText?.trim()||`${t("reports.generated_on")}: ${u}`,m=a.map((g,i)=>`<button class="nav-btn${i===0?" active":""}" data-page="${i}">${i+1}. ${l(g.title)}</button>`).join(""),v=a.map((g,i)=>`
                <section class="report-page${i===0?" active":""}" data-page="${i}">
                    ${e?.showHeader??!0?`<header class="page-header">${l(c)}</header>`:""}
                    ${g.status||g.threshold||g.subtitle?`<div class="page-context">
                        ${g.status?`<span class="status status-${g.status}">${l(g.status.toUpperCase())}</span>`:""}
                        ${g.threshold?`<span class="threshold">${l(g.threshold)}</span>`:""}
                        ${g.subtitle?`<span class="comment">${l(g.subtitle)}</span>`:""}
                    </div>`:""}
                    <img src="${g.image}" alt="${l(g.title)}" class="page-image" />
                    ${e?.showFooter??!0?`<footer class="page-footer"><span>${l(b)}</span><span>${i+1}/${Math.max(a.length,1)}</span></footer>`:""}
                </section>
                `).join(""),T=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${l(o)}</title>
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
      <h1 class="title">${l(r?.title||o)}</h1>
      <p class="meta">${l(r?.subtitle||"")}</p>
      <p class="meta">${l(`${t("reports.generated_on")}: ${u}`)}</p>
      ${p?.dataAsOf||e?.dataAsOf?`<p class="meta">${l(`${t("reports.data_as_of","Data as of")}: ${p?.dataAsOf||e?.dataAsOf||""}`)}</p>`:""}
      ${e?.includeAuditAppendix?`<p class="meta">${l(`${t("reports.audit_sql_sources","SQL Sources")}: ${(p?.sqlSources||[]).length}`)}</p>`:""}
      <nav class="nav">${m||`<span class="meta">${l(t("common.no_data"))}</span>`}</nav>
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
</html>`,I=new Blob([T],{type:"text/html;charset=utf-8"}),z=document.createElement("a"),H=o.trim().replace(/[<>:"/\\|?*]/g,"_")||"report-package";z.download=`${H}.html`,z.href=URL.createObjectURL(I),z.click(),URL.revokeObjectURL(z.href)}catch(a){n.error("HTML export failed:",a),await F.error(t("reports.export_failed","Export failed."))}finally{d(!1),f(0)}},exportPackageToPpt:async(o,s,r,e,p)=>{d(!0),f(0);try{const a=[];for(let i=0;i<s.length;i++){const L=s[i],q=await P(L.elementId,L.orientation==="landscape"?1400:1e3);q&&a.push({title:L.title,image:q.imgData,status:L.status,threshold:L.threshold}),f(Math.round((i+1)/Math.max(s.length,1)*100))}const l=i=>i.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),u=new Date().toLocaleString(),c=e?.footerText?.trim()||`${t("reports.generated_on")}: ${u}`,b=r?.title||o,m=r?.subtitle||"",v=r?.author||"",T=a.map((i,L)=>`
                <div class="slide">
                    ${e?.showHeader??!0?`<div class="header">${l(i.title)}</div>`:""}
                    ${i.status||i.threshold?`<div class="context">${i.status?l(i.status.toUpperCase()):""}${i.threshold?` · ${l(i.threshold)}`:""}</div>`:""}
                    <div class="content"><img src="${i.image}" alt="${l(i.title)}" /></div>
                    ${e?.showFooter??!0?`<div class="footer"><span>${l(c)}</span><span>${L+1}/${Math.max(a.length,1)}</span></div>`:""}
                </div>
            `).join(""),I=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${l(o)}</title>
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
    <h1>${l(b)}</h1>
    ${m?`<p>${l(m)}</p>`:""}
    ${v?`<p>${l(v)}</p>`:""}
    <p>${l(`${t("reports.generated_on")}: ${u}`)}</p>
    ${p?.dataAsOf||e?.dataAsOf?`<p>${l(`${t("reports.data_as_of","Data as of")}: ${p?.dataAsOf||e?.dataAsOf||""}`)}</p>`:""}
  </div>
  ${T}
  ${e?.includeAuditAppendix?`<div class="slide"><div class="header">${l(t("reports.audit_appendix_title","Audit Appendix"))}</div><div class="content" style="align-items:flex-start; justify-content:flex-start;"><pre style="font-family: Consolas, monospace; font-size: 10px; color: #334155; white-space: pre-wrap;">${l((p?.sqlSources||[]).map(i=>`${i.source}
${i.sql}`).join(`

`)||t("common.no_data","No data"))}</pre></div></div>`:""}
</body>
</html>`,z=new Blob([I],{type:"application/vnd.ms-powerpoint"}),H=document.createElement("a"),g=o.trim().replace(/[<>:"/\\|?*]/g,"_")||"report-package";H.download=`${g}.ppt`,H.href=URL.createObjectURL(z),H.click(),URL.revokeObjectURL(H.href)}catch(a){n.error("PPT export failed:",a),await F.error(t("reports.export_failed","Export failed."))}finally{d(!1),f(0)}},exportToImage:async(o,s)=>{d(!0);try{const r=document.getElementById(o);if(!r)return;await new Promise(a=>setTimeout(a,500));const e=await R(r,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff"}),p=document.createElement("a");p.download=`${s}.png`,p.href=e.toDataURL("image/png"),p.click()}catch(r){n.error("Export failed:",r)}finally{d(!1)}}}},G=t=>{const n=t.toLowerCase();return n.includes("price")||n.includes("amount")||n.includes("preis")||n.includes("betrag")||n.includes("summe")||n.includes("kosten")||n.includes("total")},K=(t,n)=>{if(typeof t!="number"){if(typeof t=="string")return t;if(typeof t=="boolean")return t?"true":"false";if(t==null)return"";if(typeof t=="object")try{return JSON.stringify(t)}catch{return String(t)}return String(t)}return n&&G(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(t):new Intl.NumberFormat("de-DE").format(t)},te=({data:t,rows:n,cols:h,measures:d})=>{const{t:S}=M(),f=U.useMemo(()=>{if(!t||t.length===0||d.length===0)return null;const k=new Set,w=new Set,x={};t.forEach(j=>{const E=n.map($=>String(j[$]??"")).join(" | "),A=h.map($=>String(j[$]??"")).join(" | ");k.add(E),w.add(A),x[E]||(x[E]={}),x[E][A]||(x[E][A]={}),d.forEach($=>{x[E][A][$.field]||(x[E][A][$.field]=[]);const C=Number(j[$.field]);isNaN(C)?$.agg==="count"&&x[E][A][$.field].push(1):x[E][A][$.field].push(C)})});const _=Array.from(k).sort(),N=Array.from(w).sort(),P={};return _.forEach(j=>{P[j]={},N.forEach(E=>{P[j][E]={},d.forEach(A=>{const $=x[j]?.[E]?.[A.field]||[];let C=0;if($.length>0)switch(A.agg){case"sum":C=$.reduce((o,s)=>o+s,0);break;case"count":C=$.length;break;case"avg":C=$.reduce((o,s)=>o+s,0)/$.length;break;case"min":C=Math.min(...$);break;case"max":C=Math.max(...$);break}P[j][E][A.field]=C})})}),{rowLabels:_,colLabels:N,values:P}},[t,n,h,d]);return f?y.jsx("div",{className:"w-full h-full overflow-auto bg-white dark:bg-slate-900 shadow-inner rounded-lg border border-slate-200 dark:border-slate-700",children:y.jsxs("table",{className:"min-w-full text-xs border-collapse",children:[y.jsxs("thead",{className:"sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700",children:[y.jsxs("tr",{children:[y.jsx("th",{colSpan:n.length,className:"p-2 border border-slate-300 dark:border-slate-700 font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase tracking-wider",children:n.join(" / ")}),f.colLabels.map(k=>y.jsx("th",{colSpan:d.length,className:"p-2 border border-slate-300 dark:border-slate-700 font-bold text-center bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",children:k||"--"},k))]}),d.length>1&&y.jsxs("tr",{children:[y.jsx("th",{colSpan:n.length,className:"border border-slate-300 dark:border-slate-700"}),f.colLabels.map(k=>d.map(w=>y.jsxs("th",{className:"p-1 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 font-medium",children:[w.field," (",S(`querybuilder.pivot_agg_${w.agg}`),")"]},`${k}-${w.field}`)))]}),d.length===1&&y.jsxs("tr",{children:[y.jsx("th",{colSpan:n.length,className:"border border-slate-300 dark:border-slate-700"}),f.colLabels.map(k=>y.jsx("th",{className:"p-1 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-400 font-medium italic",children:S(`querybuilder.pivot_agg_${d[0].agg}`)},`measure-${k}`))]})]}),y.jsx("tbody",{children:f.rowLabels.map((k,w)=>y.jsxs("tr",{className:w%2===0?"bg-white dark:bg-slate-900":"bg-slate-50/30 dark:bg-slate-800/20",children:[k.split(" | ").map((x,_)=>y.jsx("td",{className:"p-2 border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap",children:x},_)),f.colLabels.map(x=>d.map(_=>{const N=f.values[k][x][_.field];return y.jsx("td",{className:"p-2 border border-slate-200 dark:border-slate-800 text-right font-mono tabular-nums",children:K(N,_.field)},`${x}-${_.field}`)}))]},k))})]})}):y.jsx("div",{className:"p-8 text-center text-slate-400 italic",children:S("common.no_data")})},B=t=>t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),J=t=>{const n=t.trim();return n&&/^(https?:|mailto:|tel:)/i.test(n)?n:"#"},O=t=>{let n=B(t);return n=n.replace(/`([^`]+)`/g,'<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[0.9em]">$1</code>'),n=n.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),n=n.replace(/\*([^*]+)\*/g,"<em>$1</em>"),n=n.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(h,d,S)=>{const f=J(S);return`<a class="text-blue-600 dark:text-blue-400 underline underline-offset-2" href="${B(f)}" target="_blank" rel="noopener noreferrer">${d}</a>`}),n},Q=t=>{const n=t.replace(/\r\n/g,`
`).split(`
`),h=[];let d=!1,S=!1;const f=()=>{d&&(h.push("</ul>"),d=!1),S&&(h.push("</ol>"),S=!1)};for(const k of n){const w=k.trim();if(!w){f();continue}const x=w.match(/^(#{1,6})\s+(.+)$/);if(x){f();const j=x[1].length;h.push(`<h${j} class="font-bold ${j<=2?"text-lg":j===3?"text-base":"text-sm"} mt-2 mb-1">${O(x[2])}</h${j}>`);continue}const _=w.match(/^>\s?(.+)$/);if(_){f(),h.push(`<blockquote class="border-l-2 border-slate-300 dark:border-slate-600 pl-3 italic text-slate-600 dark:text-slate-300 my-1">${O(_[1])}</blockquote>`);continue}const N=w.match(/^[-*+]\s+(.+)$/);if(N){S&&(h.push("</ol>"),S=!1),d||(h.push('<ul class="list-disc list-inside space-y-1 my-1">'),d=!0),h.push(`<li>${O(N[1])}</li>`);continue}const P=w.match(/^\d+\.\s+(.+)$/);if(P){d&&(h.push("</ul>"),d=!1),S||(h.push('<ol class="list-decimal list-inside space-y-1 my-1">'),S=!0),h.push(`<li>${O(P[1])}</li>`);continue}if(/^(-{3,}|\*{3,}|_{3,})$/.test(w)){f(),h.push('<hr class="my-2 border-slate-200 dark:border-slate-700" />');continue}f(),h.push(`<p class="my-1">${O(w)}</p>`)}return f(),h.join("")},ae=({markdown:t,className:n="",emptyText:h=""})=>{const d=t.trim();return d?y.jsx("div",{className:n,dangerouslySetInnerHTML:{__html:Q(d)}}):y.jsx("div",{className:n,children:h})};export{ae as M,te as P,K as f,ee as u};
