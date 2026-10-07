/* Project Arma front end. Reads data/guns.json and data/ammo.json (built by scripts/build_data.py).
   Motion: intro doors, price wire, scroll reveals, count ups, chart draw, stamp verdicts,
   spring needle, file view transitions, scrollspy, tracer bar, photo parallax. All motion is
   skipped when the viewer prefers reduced motion. */
(function () {
  "use strict";
  const CATS = ["All", "Military surplus", "Rifles", "Handguns", "Revolvers"];
  const TIERS = [["good", "Good"], ["very_good", "Very Good"], ["excellent", "Excellent"]];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (v) => (v == null ? "n/a" : "$" + Math.round(v).toLocaleString("en-US"));
  const cents = (v) => (v == null ? "n/a" : "$" + v.toFixed(2));
  const int = (v) => Math.round(v).toLocaleString("en-US");
  const pctTxt = (v) => (v == null ? "n/a" : (v > 0 ? "+" : "") + (v * 100).toFixed(0) + "%");
  const FMT = { money, cents, int };
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anim = root.classList.contains("anim") && !reduce;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let GUNS = [], AMMO = [], META = {};
  let cat = "All", query = "", sel = 0, tier = 1, quote = null;

  /* ---------- Motion helpers ---------- */
  function tween(el, to, fmt, dur = 800, from) {
    if (!el) return;
    if (to == null || isNaN(to)) { el.textContent = fmt(null); el._v = null; return; }
    const start = from != null ? from : el._v != null ? el._v : to;
    el._v = to;
    cancelAnimationFrame(el._raf);
    if (!anim || start === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(start + (to - start) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  function countUp(el, delay = 0) {
    const to = +el.dataset.count, fmt = FMT[el.dataset.fmt] || int;
    if (!anim) { el.textContent = fmt(to); return; }
    el.textContent = fmt(0);
    setTimeout(() => tween(el, to, fmt, 1300, 0), delay);
  }
  function restart(el, cls) { if (!el || !anim) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  const io = anim && "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 })
    : null;
  function reveal(el) {
    el.classList.add("in");
    setTimeout(() => el.classList.add("done"), 1600 + (parseFloat(getComputedStyle(el).getPropertyValue("--i")) || 0) * 120);
    $$("[data-count]", el).forEach((c) => countUp(c, 250));
  }
  function watch(scope = document) {
    $$("[data-reveal]:not(.in)", scope).forEach((el) => (io ? io.observe(el) : reveal(el)));
  }

  /* ---------- Guns ---------- */
  const band = (g, t) => g.bands[TIERS[t][0]];
  const visible = () => GUNS.map((g, i) => i).filter((i) => {
    const g = GUNS[i];
    return (cat === "All" || g.category === cat) && (!query || (g.name + " " + g.detail).toLowerCase().includes(query));
  });

  function renderCats() {
    const el = $("#cats");
    el.innerHTML = "";
    CATS.forEach((c) => {
      const b = document.createElement("button");
      b.className = "chip"; b.type = "button"; b.textContent = c;
      b.setAttribute("aria-pressed", c === cat);
      b.onclick = () => { cat = c; renderCats(); renderList(); keepSelection(); };
      el.appendChild(b);
    });
  }
  function keepSelection() {
    const v = visible();
    if (v.length && !v.includes(sel)) { sel = v[0]; quote = null; showDetail(); renderList(); }
  }

  function renderList() {
    const el = $("#list");
    el.innerHTML = "";
    const v = visible();
    if (!v.length) { el.innerHTML = '<div class="empty">No models match. Try a shorter search.</div>'; return; }
    v.forEach((i) => {
      const g = GUNS[i];
      const b = document.createElement("button");
      b.type = "button"; b.className = "item"; b.setAttribute("role", "option");
      b.setAttribute("aria-selected", i === sel);
      b.innerHTML = `<span><b>${esc(g.name)}</b><small>${esc(g.category)}</small></span><span class="num">${money(g.bands.very_good.median)}</span>`;
      b.onclick = () => {
        if (i === sel) return;
        sel = i; quote = null; renderList(); showDetail();
        if (innerWidth < 820) $("#detail").scrollIntoView({ behavior: anim ? "smooth" : "auto", block: "start" });
      };
      el.appendChild(b);
    });
  }

  function chart(g) {
    const W = 640, H = 240, L = 58, R = 18, T = 16, B = 30;
    const vg = g.bands.very_good;
    const lo = vg.median ? vg.low / vg.median : 0.85, hi = vg.median ? vg.high / vg.median : 1.15;
    const pts = g.history.map((h, i) => ({ i, v: h.median })).filter((p) => p.v != null);
    if (pts.length < 2) return '<p class="empty">Not enough sales yet to chart a trend.</p>';
    let mn = Math.min(...pts.map((p) => p.v * lo)), mx = Math.max(...pts.map((p) => p.v * hi));
    const step = [25, 50, 100, 200, 250, 500, 1000, 2000].find((s) => (mx - mn) / s <= 5) || 5000;
    mn = Math.floor(mn / step) * step; mx = Math.ceil(mx / step) * step;
    const n = g.history.length - 1;
    const x = (i) => L + (i * (W - L - R)) / n, y = (v) => T + ((mx - v) * (H - T - B)) / (mx - mn);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="12 month median sold price for ${esc(g.name)}, Very Good condition">`;
    for (let v = mn; v <= mx; v += step)
      s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${money(v)}</text>`;
    g.history.forEach((h, i) => {
      if (i % 2 === 0 || i === n) s += `<text class="ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${MON[+h.month.slice(5) - 1]}</text>`;
    });
    const top = pts.map((p) => `${x(p.i)},${y(p.v * hi)}`), bot = pts.slice().reverse().map((p) => `${x(p.i)},${y(p.v * lo)}`);
    s += `<polygon class="cband" points="${top.concat(bot).join(" ")}"/>`;
    s += `<polyline class="cline" pathLength="1" points="${pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}"/>`;
    const e = pts[pts.length - 1];
    s += `<circle class="cping" cx="${x(e.i)}" cy="${y(e.v)}" r="5"/><circle class="cdot" cx="${x(e.i)}" cy="${y(e.v)}" r="5.5"/></svg>`;
    return s;
  }

  /* Verdict: patch in place so the needle can spring and the stamp only slams on a new verdict */
  let lastWord = "";
  function seg(q, a, b, p0, p1) { return p0 + (p1 - p0) * clamp((q - a) / ((b - a) || 1), 0, 1); }
  function updateVerdict() {
    const g = GUNS[sel], b = band(g, tier), q = quote, label = TIERS[tier][1];
    const box = $("#verdict"); if (!box) return;
    let state, word, msg, pos = 50;
    if (q == null || isNaN(q) || q <= 0) { state = "empty"; word = "Enter a price"; msg = `Type the price a store or seller quoted you for a ${label} example.`; }
    else if (b.median == null) { state = "empty"; word = "No data yet"; msg = `Not enough ${label} sales to judge this price.`; }
    else {
      const diff = ((q - b.median) / b.median) * 100, fairTop = Math.max(b.median * 1.05, b.low + 1), high = Math.max(b.high, fairTop + 1);
      if (q <= b.low) { state = "good"; word = "Strong deal"; msg = "Below the usual low end. Confirm condition and originality before you buy."; pos = seg(q, b.low * 0.8, b.low, 2, 25); }
      else if (q <= fairTop) { state = "fair"; word = "Fair price"; msg = "Right around what this model sells for in this condition."; pos = seg(q, b.low, fairTop, 25, 55); }
      else if (q <= high) { state = "warn"; word = "Above market"; msg = "Room to negotiate. Show the seller the sold range."; pos = seg(q, fairTop, high, 55, 80); }
      else { state = "bad"; word = "Overpriced"; msg = "Above the high end of recent sales for this condition."; pos = seg(q, high, high * 1.2, 80, 98); }
      msg = `<span class="num">${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%</span> versus the median of <span class="num">${money(b.median)}</span>. ${msg}`;
    }
    box.className = "verdict s-" + state;
    $("#vEye").textContent = "Price check · " + label;
    $("#vMsg").innerHTML = msg;
    $("#vNeedle").style.left = pos + "%";
    if (word !== lastWord) {
      $("#vWord").textContent = word;
      if (state !== "empty") { restart($("#vStamp"), "slam"); restart(box, "shake"); }
      lastWord = word;
    }
  }

  const prevMed = [null, null, null];
  function renderDetail() {
    const g = GUNS[sel], el = $("#detail");
    const tr = g.trend_12m;
    lastWord = "";
    el.innerHTML = `<div class="dhead"><div><span class="fileno">File No. ${String(sel + 1).padStart(3, "0")} · ${esc(g.category)}</span><h3>${esc(g.name)}</h3><div class="meta">${esc(g.detail)}</div></div>
      <span class="conf">${g.sales_90d} sales · last 90 days</span></div>
      <div class="tiers" role="group" aria-label="Condition">${TIERS.map((t, i) => {
        const b = band(g, i);
        return `<button type="button" class="tier" data-t="${i}" aria-pressed="${i === tier}"><span class="eyebrow">${t[1]}</span>
          <span class="med">${money(b.median)}</span><span class="rng">${money(b.low)} to ${money(b.high)}<br>${b.n} sales</span></button>`;
      }).join("")}</div>
      <div class="chartbox"><div class="legend"><span><i style="background:var(--line)"></i>Median sold, Very Good</span><span><i style="background:var(--band);opacity:.3"></i>Typical range</span>${tr == null ? "" : `<span>${tr >= 0 ? "Up" : "Down"} <span class="num">${Math.abs(tr * 100).toFixed(0)}%</span> over 12 months</span>`}</div>${chart(g)}</div>
      <div class="checker"><div class="inputs"><div class="field"><label for="quote">Price you were quoted ($)</label>
        <input id="quote" type="number" inputmode="decimal" min="0" step="1" value="${quote ?? ""}"></div>
        <div class="field"><label for="tierSel">Condition</label><select id="tierSel">${TIERS.map((t, i) => `<option value="${i}"${i === tier ? " selected" : ""}>${t[1]}</option>`).join("")}</select></div></div>
        <div class="verdict s-empty" id="verdict" aria-live="polite"><span class="eyebrow" id="vEye"></span><div class="stamp" id="vStamp"><span id="vWord"></span></div><p id="vMsg"></p>
          <div class="gauge" aria-hidden="true"><div class="gscale"></div><b class="needle" id="vNeedle"></b><div class="glabels"><span>Deal</span><span>Fair</span><span>High</span><span>Over</span></div></div></div></div>`;
    $$(".tier .med", el).forEach((m, i) => { const to = band(g, i).median; tween(m, to, money, 700, prevMed[i] ?? (to != null ? to * 0.6 : null)); prevMed[i] = to; });
    $$(".tier", el).forEach((b) => (b.onclick = () => setTier(+b.dataset.t)));
    $("#tierSel").onchange = (e) => setTier(+e.target.value);
    $("#quote").oninput = (e) => { quote = e.target.value === "" ? null : +e.target.value; updateVerdict(); };
    setPlaceholder();
    updateVerdict();
  }
  function setPlaceholder() { const q = $("#quote"); if (q) q.placeholder = String(Math.round((band(GUNS[sel], tier).median || 0) * 1.15)); }
  function setTier(t) {
    tier = t;
    $$("#detail .tier").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.t === t));
    $("#tierSel").value = String(t);
    setPlaceholder();
    updateVerdict();
  }
  function showDetail() {
    if (anim && document.startViewTransition && $("#detail .dhead")) document.startViewTransition(renderDetail);
    else renderDetail();
  }

  /* ---------- Ammo ---------- */
  let sortKey = "median", sortDir = 1;
  function spark(h) {
    const v = h.filter((p) => p != null);
    if (v.length < 2) return "";
    const mn = Math.min(...v), mx = Math.max(...v), n = h.length - 1;
    const X = (k) => 2 + (k * 76) / n, Y = (p) => 20 - ((p - mn) / (mx - mn || 1)) * 16;
    const pts = h.map((p, k) => (p == null ? null : `${X(k)},${Y(p)}`)).filter(Boolean);
    const last = h.length - 1 - h.slice().reverse().findIndex((p) => p != null);
    return `<svg width="80" height="24" viewBox="0 0 80 24" aria-hidden="true"><polyline class="spark" pathLength="1" points="${pts.join(" ")}"/><circle class="sdot" cx="${X(last)}" cy="${Y(h[last])}" r="2.5"/></svg>`;
  }
  function renderAmmo() {
    const cols = [["Caliber", "name"], ["Typical load", "load"], ["Median / rd", "median"], ["Low today", "low_today"], ["90 days", "change_90d"], ["Trend", null]];
    const rows = AMMO.slice().sort((a, b) => {
      const A = a[sortKey] ?? Infinity, B = b[sortKey] ?? Infinity;
      return (A > B ? 1 : A < B ? -1 : 0) * sortDir;
    });
    $("#ammoTable").innerHTML = `<thead><tr>${cols.map(([n, k]) => {
      const right = ["median", "low_today", "change_90d"].includes(k) || k == null;
      return `<th class="${right ? "r" : ""}">${k == null ? n : `<button type="button" data-k="${k}">${n}${k === sortKey ? (sortDir > 0 ? " ↑" : " ↓") : ""}</button>`}</th>`;
    }).join("")}</tr></thead><tbody>${rows.map((a, i) => `<tr style="--i:${i}">
      <td><b>${esc(a.name)}</b>${a.historical ? '<span class="tag">Historical</span>' : ""}</td><td>${esc(a.load)}</td>
      <td class="r num">${cents(a.median)}</td>
      <td class="r num">${cents(a.low_today)}${a.best ? `<span class="best">${esc(a.best.retailer)}</span>` : ""}</td>
      <td class="r num ${a.change_90d > 0 ? "up" : a.change_90d < 0 ? "down" : ""}">${pctTxt(a.change_90d)}</td>
      <td class="r">${spark(a.history)}</td></tr>`).join("")}</tbody>`;
    $$("#ammoTable th button").forEach((b) => (b.onclick = () => {
      const k = b.dataset.k; sortDir = k === sortKey ? -sortDir : 1; sortKey = k; renderAmmo();
      const nb = $(`#ammoTable th button[data-k="${k}"]`); if (nb) nb.focus();
    }));
  }
  function ammoCheck() {
    const a = AMMO[+$("#aCal").value], p = +$("#aPrice").value, c = +$("#aCount").value, out = $("#aOut");
    if (!out.firstChild || !$("#aCpr")) out.innerHTML = `<strong><span id="aCpr"></span> / rd</strong><span id="aCmp"></span>`;
    if (!a || !(p > 0 && c > 0) || a.median == null) { out.className = "ammoout s-fair"; $("#aCpr").textContent = "n/a"; $("#aCmp").textContent = "Enter a box price and round count."; return; }
    const cpr = p / c, d = ((cpr - a.median) / a.median) * 100;
    const st = cpr <= a.low_today ? "good" : cpr <= a.median * 1.05 ? "fair" : cpr <= a.median * 1.25 ? "warn" : "bad";
    const changed = !out.classList.contains("s-" + st);
    out.className = "ammoout s-" + st;
    if (changed) restart(out, "bump");
    tween($("#aCpr"), cpr, cents, 500);
    $("#aCmp").textContent = `${d >= 0 ? "+" : ""}${d.toFixed(0)}% vs. ${cents(a.median)} median for ${a.name}`;
  }

  /* ---------- Landed cost (built once, then patched) ---------- */
  function buildReceipt() {
    $("#receipt").innerHTML = `<span class="eyebrow">Online, delivered to your FFL</span>
      <div class="line" style="--i:0"><span>Price</span><span id="rP"></span></div>
      <div class="line" style="--i:1"><span>Shipping</span><span id="rS"></span></div>
      <div class="line" style="--i:2"><span>Transfer fee</span><span id="rF"></span></div>
      <div class="line" style="--i:3"><span id="rTl">Tax</span><span id="rT"></span></div>
      <div class="line tot" style="--i:4"><span>Landed cost</span><span id="rTot"></span></div>
      <div class="line" style="--i:5"><span>Store, out the door</span><span id="rL"></span></div>
      <div class="cmp" id="rCmp" style="--i:6"></div>
      <small>Tax rules vary by state and seller. Transfer fees run roughly $25 to $75.</small>`;
  }
  function landed() {
    const n = (s) => Math.max(0, +$(s).value || 0);
    const p = n("#lPrice"), sh = n("#lShip"), f = n("#lFfl"), t = n("#lTax"), loc = n("#lLocal");
    const tax = ((p + sh) * t) / 100, tot = p + sh + f + tax, diff = loc - tot;
    $("#rP").textContent = money(p); $("#rS").textContent = money(sh); $("#rF").textContent = money(f);
    $("#rTl").textContent = `Tax (${t}%)`; tween($("#rT"), tax, money, 400);
    tween($("#rTot"), tot, money, 600);
    $("#rL").textContent = loc ? money(loc) : "n/a";
    const c = $("#rCmp");
    if (!loc) { c.className = "cmp s-fair"; c.innerHTML = "Enter the store's out the door price to compare."; }
    else if (diff > 25) { c.className = "cmp s-good"; c.innerHTML = `<b>Online saves ${money(diff)}.</b> Ask the store to match, or buy online and transfer.`; }
    else if (diff < -25) { c.className = "cmp s-warn"; c.innerHTML = `<b>The store is ${money(-diff)} cheaper.</b> Buy local and skip the wait.`; }
    else { c.className = "cmp s-fair"; c.innerHTML = `<b>Within ${money(Math.abs(diff))}.</b> Buy local and keep the relationship.`; }
  }

  /* ---------- Featured tags, crates, ticker, stats ---------- */
  const FEATURED = ["m1-garand", "m1911a1", "m1-carbine", "thompson-1927a1"];
  const goGuns = () => $("#guns").scrollIntoView({ behavior: anim ? "smooth" : "auto", block: "start" });
  function showModel(i) {
    sel = i; quote = null;
    if (!visible().includes(i)) { cat = "All"; query = ""; $("#q").value = ""; renderCats(); }
    renderList(); showDetail(); goGuns();
  }
  function renderFeatured() {
    const el = $("#featured"); if (!el) return;
    el.innerHTML = FEATURED.map((id) => GUNS.findIndex((g) => g.id === id)).filter((i) => i >= 0).map((i, k) => {
      const g = GUNS[i], b = g.bands.very_good;
      return `<article class="itag" data-reveal="swing" style="--i:${k}"><span class="itcat">${esc(g.category)}</span><h3>${esc(g.name)}</h3><p class="itdet">${esc(g.detail)}</p>
        <div class="itprice"><b data-count="${b.median}" data-fmt="money">${money(b.median)}</b><small>Median sold · Very Good</small></div>
        <p class="itrng">${money(b.low)} to ${money(b.high)}</p>
        <button type="button" class="btn" data-i="${i}">Open file <span aria-hidden="true">▸</span></button></article>`;
    }).join("");
    $$("button[data-i]", el).forEach((b) => (b.onclick = () => showModel(+b.dataset.i)));
    watch(el);
  }
  function renderTicker() {
    const items = GUNS.map((g) => `<span>${esc(g.name)} ${money(g.bands.very_good.median)} <i class="${(g.trend_12m || 0) >= 0 ? "u" : "d"}">${(g.trend_12m || 0) >= 0 ? "▲" : "▼"} ${Math.abs((g.trend_12m || 0) * 100).toFixed(0)}%</i></span>`)
      .concat(AMMO.map((a) => `<span>${esc(a.name)} ${cents(a.median)}/rd <i class="${(a.change_90d || 0) > 0 ? "u" : "d"}">${(a.change_90d || 0) > 0 ? "▲" : "▼"} ${Math.abs((a.change_90d || 0) * 100).toFixed(0)}%</i></span>`)).join("");
    const t = $("#ticker");
    t.innerHTML = items + items.replace(/<span>/g, '<span aria-hidden="true">');
    t.style.setProperty("--dur", (GUNS.length + AMMO.length) * 3.2 + "s");
  }
  function fillStats() {
    const set = (id, v) => { const e = $(id); if (e) { e.dataset.count = v; e.textContent = int(v); } };
    set("#stModels", GUNS.length);
    set("#stSales", GUNS.reduce((s, g) => s + (g.sales_90d || 0), 0));
    set("#stCals", AMMO.length);
    const late = root.classList.contains("late");
    entered.then(() => $$("#stats [data-count]").forEach((e, k) => countUp(e, (late ? 2700 : 1400) + k * 140)));
  }
  function wireTiles() {
    $("#searchform").onsubmit = (e) => { e.preventDefault(); goGuns(); };
    $$("[data-cat]").forEach((t) => (t.onclick = (e) => {
      e.preventDefault(); cat = t.dataset.cat; query = ""; $("#q").value = ""; renderCats(); renderList(); keepSelection(); goGuns();
    }));
  }

  /* ---------- Entry gate and music: the click that enters the site also starts the theme ---------- */
  let enterResolve;
  const entered = new Promise((r) => (enterResolve = r));
  const audio = $("#theme"), sBtn = $("#sound");
  let fadeT;
  function setSound(on) { sBtn.setAttribute("aria-pressed", on); $("#soundLbl").textContent = on ? "Sound on" : "Sound off"; }
  function startMusic() {
    if (!audio) return;
    clearInterval(fadeT);
    audio.volume = 0;
    const p = audio.play();
    const fadeIn = () => { setSound(true); fadeT = setInterval(() => { audio.volume = Math.min(0.6, audio.volume + 0.04); if (audio.volume >= 0.6) clearInterval(fadeT); }, 80); };
    if (p && p.then) p.then(fadeIn).catch(() => setSound(false)); else fadeIn();
  }
  function stopMusic() {
    clearInterval(fadeT);
    fadeT = setInterval(() => { audio.volume = Math.max(0, audio.volume - 0.06); if (audio.volume <= 0) { clearInterval(fadeT); audio.pause(); } }, 60);
    setSound(false);
  }
  function gate() {
    sBtn.onclick = () => (audio.paused || sBtn.getAttribute("aria-pressed") === "false" ? startMusic() : stopMusic());
    const g = $("#gate");
    if (!root.classList.contains("gated") || !g) { if (g) g.remove(); root.classList.remove("gated"); enterResolve(); return; }
    const go = (withSound) => { if (withSound) startMusic(); root.classList.remove("gated"); g.remove(); enterResolve(); };
    $("#enter").onclick = () => go(true);
    $("#enterQuiet").onclick = () => go(false);
    $("#enter").focus();
  }

  /* ---------- Page chrome: intro, scrollspy, tracer, back to top, parallax ---------- */
  function intro() {
    const el = $("#intro");
    if (!root.classList.contains("show-intro") || !el) { if (el) el.remove(); return; }
    const done = () => { root.classList.remove("show-intro", "skip-intro"); el.remove(); try { sessionStorage.setItem("arma-intro", "1"); } catch (e) { /* storage unavailable */ } };
    const t = setTimeout(done, 2350);
    const skip = () => { if (!el.isConnected) return; clearTimeout(t); root.classList.add("skip-intro"); setTimeout(done, 450); };
    el.addEventListener("click", skip, { once: true });
    addEventListener("keydown", skip, { once: true });
  }
  function chrome() {
    const links = $$(".nav a[data-spy]"), ind = $("#navind"), navin = $("#navin"), tracer = $("#tracer"), top = $("#totop");
    let ticking = false, current = "";
    const moveInd = (a) => {
      if (!a || !ind) return;
      const r = a.getBoundingClientRect(), p = navin.getBoundingClientRect();
      ind.style.width = r.width + "px"; ind.style.height = r.height + "px";
      ind.style.transform = `translate(${r.left - p.left + navin.scrollLeft}px,${r.top - p.top}px)`;
      if (navin.scrollWidth > navin.clientWidth) navin.scrollTo({ left: a.offsetLeft - 16, behavior: anim ? "smooth" : "auto" });
    };
    const update = () => {
      ticking = false;
      const h = document.documentElement.scrollHeight - innerHeight;
      if (tracer) tracer.style.transform = `scaleX(${h > 0 ? clamp(scrollY / h, 0, 1) : 0})`;
      if (top) top.classList.toggle("show", scrollY > 700);
      let id = "top";
      links.forEach((a) => { const s = document.getElementById(a.dataset.spy); if (s && s.getBoundingClientRect().top < innerHeight * 0.4) id = a.dataset.spy; });
      if (id !== current) {
        current = id;
        links.forEach((a) => a.classList.toggle("on", a.dataset.spy === id));
        moveInd(links.find((a) => a.dataset.spy === id));
      }
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener("resize", () => { current = ""; update(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { current = ""; update(); });
    top.onclick = () => scrollTo({ top: 0, behavior: anim ? "smooth" : "auto" });
    update();

    const photo = $("#photo"), hero = $(".hero");
    if (anim && photo && hero && matchMedia("(pointer: fine)").matches) {
      hero.addEventListener("pointermove", (e) => {
        const r = hero.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
        photo.style.setProperty("--rx", (dx * 14).toFixed(2) + "deg");
        photo.style.setProperty("--ry", (-dy * 10).toFixed(2) + "deg");
      });
      hero.addEventListener("pointerleave", () => { photo.style.setProperty("--rx", "0deg"); photo.style.setProperty("--ry", "0deg"); });
    }
  }

  /* ---------- Boot ---------- */
  function notice() {
    const d = META.as_of ? new Date(META.as_of + "T12:00:00") : null;
    if (d && $("#lot")) $("#lot").textContent = "Lot " + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + "-A";
    const ds = d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
    $("#notice").innerHTML = META.sample
      ? `<b>Preview:</b> prices shown are sample data, not live market prices.`
      : `Prices from completed sales and retailer listings. Updated ${ds}.`;
  }

  async function boot() {
    gate();
    entered.then(intro);
    chrome();
    watch();
    renderCats();
    buildReceipt();
    ["#lPrice", "#lShip", "#lFfl", "#lTax", "#lLocal"].forEach((s) => $(s).addEventListener("input", landed));
    landed();
    $("#q").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); renderList(); keepSelection(); });
    try {
      const [g, a] = await Promise.all(["data/guns.json", "data/ammo.json"].map((u) => fetch(u, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(u + " returned " + r.status); return r.json();
      })));
      GUNS = g.models; AMMO = a.calibers; META = g.meta || {};
    } catch (err) {
      $("#notice").textContent = "Prices could not load. Refresh the page, or check that the data folder was deployed.";
      $("#detail").innerHTML = ""; return;
    }
    notice();
    const aCal = $("#aCal");
    AMMO.forEach((a, i) => { const o = document.createElement("option"); o.value = i; o.textContent = a.name; aCal.appendChild(o); });
    aCal.value = String(Math.max(0, AMMO.findIndex((a) => a.id === "45acp")));
    ["#aCal", "#aPrice", "#aCount"].forEach((s) => $(s).addEventListener("input", ammoCheck));
    quote = Math.round((GUNS[0].bands.very_good.median || 0) * 1.07) || null;
    renderList(); renderDetail(); renderAmmo(); ammoCheck(); renderFeatured(); renderTicker(); fillStats(); wireTiles();
  }
  boot();
})();
