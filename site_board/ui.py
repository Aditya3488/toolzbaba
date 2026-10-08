"""The "paste a URL" page, shared by the stdlib server and the FastAPI routes."""

PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site Map Board</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap">
<style>
:root{--bg:#f5f6fb;--card:#fff;--ink:#1f2338;--muted:#6c728f;--border:#e7e9f2;--accent:#5b6af0;--accent-soft:#eef0ff;--bad:#ec6565;--good:#2fae74;--ease:cubic-bezier(.22,.8,.24,1)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(1000px 600px at 10% 0%,rgba(91,106,240,.10),transparent 70%),radial-gradient(800px 500px at 100% 100%,rgba(236,111,156,.08),transparent 70%),var(--bg);color:var(--ink);font:500 15px/1.55 Manrope,"Segoe UI",system-ui,sans-serif;display:grid;place-items:center;padding:32px 16px}
main{width:min(720px,100%);display:flex;flex-direction:column;gap:22px}
h1{margin:0;font:800 clamp(30px,5vw,44px)/1.05 Manrope,sans-serif;letter-spacing:-.03em;text-wrap:balance}
.lede{margin:0;color:var(--muted);font-size:16px;max-width:60ch}
.card{background:var(--card);border:1px solid var(--border);border-radius:22px;padding:22px;box-shadow:0 6px 18px rgba(40,48,90,.06),0 22px 50px rgba(40,48,90,.07);display:flex;flex-direction:column;gap:16px}
form{display:flex;gap:10px;flex-wrap:wrap}
input[type=url],input[type=text]{flex:1 1 300px;min-width:0;height:50px;border:1.5px solid var(--border);border-radius:14px;padding:0 16px;font:600 16px Manrope,sans-serif;color:var(--ink);background:#fff;transition:border-color .2s var(--ease),box-shadow .2s var(--ease)}
input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
button,.btn{height:50px;border:0;border-radius:14px;padding:0 22px;font:800 15px Manrope,sans-serif;background:var(--accent);color:#fff;cursor:pointer;box-shadow:0 6px 18px rgba(91,106,240,.3);text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:transform .2s var(--ease)}
button:hover,.btn:hover{transform:translateY(-1px)}button:disabled{opacity:.6;cursor:default;transform:none}
.btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--border);box-shadow:none}
.opts{display:flex;flex-wrap:wrap;gap:16px;align-items:center;color:var(--muted);font-size:13.5px;font-weight:600}
.opts label{display:inline-flex;align-items:center;gap:7px}select{height:34px;border:1px solid var(--border);border-radius:10px;padding:0 8px;font:600 13.5px Manrope,sans-serif;background:#fff;color:var(--ink)}
.prog{height:10px;border-radius:99px;background:#eef0f6;overflow:hidden}.prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),#8a95ff);border-radius:99px;transition:width .5s var(--ease)}
.msg{font-weight:700}.msg.err{color:var(--bad)}.small{font-size:13px;color:var(--muted)}
.done{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.kpi{background:var(--bg);border-radius:14px;padding:12px 14px}.kpi b{display:block;font:800 22px Manrope,sans-serif}.kpi span{font-size:12.5px;color:var(--muted)}
ul.feat{margin:0;padding-left:18px;color:var(--muted);font-size:14px}ul.feat li{margin:3px 0}
[hidden]{display:none!important}
</style></head><body><main>
<div><h1>Site Map Board</h1></div>
<p class="lede">Paste any public website. You get a Miro-style board of every page, the sales funnel, the tracking and ad tools it uses, its SEO health and, for shops, the full catalogue. Then ask the bot anything about the site.</p>
<section class="card">
 <form id="f"><label for="u" style="position:absolute;left:-9999px">Website address</label><input id="u" type="text" inputmode="url" placeholder="https://example.com" required autocomplete="url"><button id="go" type="submit">Build the board</button></form>
 <div class="opts"><label>Pages to check <select id="max"><option value="80">80 (quick)</option><option value="200">200</option><option value="400" selected>400</option><option value="900">900</option><option value="1500">1,500 (big shops)</option></select></label>
 <label><input id="shots" type="checkbox" checked> Screenshots (needs Chrome or Edge)</label></div>
 <div id="run" hidden><div class="prog"><i id="bar"></i></div><p class="msg" id="msg">Starting…</p><p class="small">Big sites take a few minutes. Sites that ask us to slow down take longer: we wait politely.</p></div>
 <div id="out" hidden><div class="kpis" id="kp"></div><div class="done" style="margin-top:12px"><a class="btn" id="open" target="_blank" rel="noopener">Open the board ↗</a><a class="btn ghost" id="dl">Download HTML</a></div><p class="small">The board opens with the "Ask about this site" bot switched on.</p></div>
</section>
<ul class="feat"><li>Reads the menu, footer, sitemaps and every page's title, description and H1</li><li>Finds Google Ads, Meta, TikTok, LinkedIn pixels, Tag Manager, checkout and payment tools</li><li>Free: nothing is sent to any AI service; the bot runs in Python</li></ul>
</main>
<script>
const API="__API__",$=s=>document.querySelector(s);let timer=null;
$("#f").addEventListener("submit",async e=>{e.preventDefault();clearInterval(timer);$("#out").hidden=true;$("#run").hidden=false;$("#msg").className="msg";$("#msg").textContent="Starting…";$("#bar").style.width="2%";$("#go").disabled=true;
 try{const r=await fetch(API+"/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:$("#u").value,maxPages:+$("#max").value,shots:$("#shots").checked})});const j=await r.json();if(!r.ok)throw new Error(j.detail||j.error||"Could not start");poll(j.id)}
 catch(err){fail(err.message)}});
function fail(m){$("#msg").textContent=m;$("#msg").className="msg err";$("#go").disabled=false;clearInterval(timer)}
function poll(id){timer=setInterval(async()=>{try{const r=await fetch(API+"/status/"+id);const j=await r.json();if(!r.ok)throw new Error(j.detail||j.error||"Lost the job");
 $("#bar").style.width=Math.max(2,Math.round((j.pct||0)*100))+"%";$("#msg").textContent=j.msg||"";
 if(j.state==="error")fail(j.msg);if(j.state==="done"){clearInterval(timer);$("#go").disabled=false;$("#run").hidden=true;$("#out").hidden=false;
  $("#kp").innerHTML=`<div class="kpi"><b>${j.domain||""}</b><span>Website</span></div><div class="kpi"><b>${(j.pages||0).toLocaleString()}</b><span>Pages checked</span></div><div class="kpi"><b>${j.products?j.products.toLocaleString():(j.seconds||"–")+"s"}</b><span>${j.products?"Products":"Time taken"}</span></div>`;
  $("#open").href=API+"/board/"+id;$("#dl").href=API+"/board/"+id+"?download=1"}}catch(err){fail(err.message)}},1200)}
</script></body></html>"""


def page(api_prefix: str) -> str:
    return PAGE.replace("__API__", api_prefix.rstrip("/"))
