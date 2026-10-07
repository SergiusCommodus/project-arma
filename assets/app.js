/* Project Arma front end. Reads data/guns.json and data/ammo.json (built by scripts/build_data.py). */
(function () {
  "use strict";
  const CATS = ["All", "Military surplus", "Rifles", "Handguns", "Revolvers"];
  const TIERS = [["good", "Good"], ["very_good", "Very Good"], ["excellent", "Excellent"]];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (v) => (v == null ? "n/a" : "$" + Math.round(v).toLocaleString("en-US"));
  const cents = (v) => (v == null ? "n/a" : "$" + v.toFixed(2));
  const pctTxt = (v) => (v == null ? "n/a" : (v > 0 ? "+" : "") + (v * 100).toFixed(0) + "%");

  let GUNS = [], AMMO = [], META = {};
  let cat = "All", query = "", sel = 0, tier = 1, quote = null;

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
      b.onclick = () => { cat = c; renderCats(); renderList(); };
      el.appendChild(b);
    });
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
        sel = i; quote = null; renderList(); renderDetail();
        if (innerWidth < 820) $("#detail").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      };
      el.appendChild(b);
    });
  }

  function chart(g) {
    const W = 640, H = 240, L = 56, R = 16, T = 16, B = 30;
    const vg = g.bands.very_good;
    const lo = vg.median ? vg.low / vg.median : 0.85, hi = vg.median ? vg.high / vg.median : 1.15;
    const pts = g.history.map((h, i) => ({ i, m: h.month, v: h.median })).filter((p) => p.v != null);
    if (pts.length < 2) return '<p class="empty">Not enough sales yet to chart a trend.</p>';
    let mn = Math.min(...pts.map((p) => p.v * lo)), mx = Math.max(...pts.map((p) => p.v * hi));
    const step = [25, 50, 100, 200, 250, 500, 1000, 2000].find((s) => (mx - mn) / s <= 5) || 5000;
    mn = Math.floor(mn / step) * step; mx = Math.ceil(mx / step) * step;
    const n = g.history.length - 1;
    const x = (i) => L + (i * (W - L - R)) / n, y = (v) => T + ((mx - v) * (H - T - B)) / (mx - mn);
    const mono = 'font-family="Oswald,Arial Narrow,sans-serif" font-size="12" fill="var(--muted)"';
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="12 month median sold price for ${esc(g.name)}, Very Good condition">`;
    for (let v = mn; v <= mx; v += step)
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" ${mono}>${money(v)}</text>`;
    g.history.forEach((h, i) => {
      if (i % 2 === 0 || i === n) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" ${mono}>${MON[+h.month.slice(5) - 1]}</text>`;
    });
    const top = pts.map((p) => `${x(p.i)},${y(p.v * hi)}`), bot = pts.slice().reverse().map((p) => `${x(p.i)},${y(p.v * lo)}`);
    s += `<polygon points="${top.concat(bot).join(" ")}" fill="var(--brass)" fill-opacity=".14"/>`;
    s += `<polyline points="${pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}" fill="none" stroke="var(--brass)" stroke-width="2.5" stroke-linejoin="round"/>`;
    const e = pts[pts.length - 1];
    s += `<circle cx="${x(e.i)}" cy="${y(e.v)}" r="5" fill="var(--brass)" stroke="var(--surface)" stroke-width="2"/></svg>`;
    return s;
  }

  function verdict(g) {
    const b = band(g, tier), q = quote, label = TIERS[tier][1];
    if (q == null || isNaN(q) || q <= 0)
      return `<div class="verdict v-fair"><span class="eyebrow">Price check</span><div class="v">Enter a price</div><p>Type the price a store or seller quoted you for a ${label} example.</p></div>`;
    if (b.median == null)
      return `<div class="verdict v-fair"><span class="eyebrow">Price check</span><div class="v">No data yet</div><p>Not enough ${label} sales to judge this price.</p></div>`;
    const pos = Math.max(0, Math.min(100, ((q - b.low * 0.85) / (b.high * 1.1 - b.low * 0.85)) * 100));
    const diff = ((q - b.median) / b.median) * 100;
    let cls, word, msg;
    if (q <= b.low) { cls = "v-good"; word = "Strong deal"; msg = "Below the usual low end. Confirm condition and originality before you buy."; }
    else if (q <= b.median * 1.05) { cls = "v-fair"; word = "Fair price"; msg = "Right around what this model sells for in this condition."; }
    else if (q <= b.high) { cls = "v-warn"; word = "Above market"; msg = "Room to negotiate. Show the seller the sold range."; }
    else { cls = "v-bad"; word = "Overpriced"; msg = "Above the high end of recent sales for this condition."; }
    return `<div class="verdict ${cls}" aria-live="polite"><span class="eyebrow">Price check · ${label}</span><div class="v">${word}</div>
      <p><span class="num">${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%</span> versus the median of <span class="num">${money(b.median)}</span>. ${msg}</p>
      <div class="gauge" aria-hidden="true"><b style="left:${pos}%"></b></div></div>`;
  }

  function renderDetail() {
    const g = GUNS[sel], el = $("#detail");
    const tr = g.trend_12m;
    el.innerHTML = `<div class="dhead"><div><span class="eyebrow">${esc(g.category)}</span><h3>${esc(g.name)}</h3><div class="meta">${esc(g.detail)}</div></div>
      <span class="conf">${g.sales_90d} sales · last 90 days</span></div>
      <div class="tiers" role="group" aria-label="Condition">${TIERS.map((t, i) => {
        const b = band(g, i);
        return `<button type="button" class="tier" data-t="${i}" aria-pressed="${i === tier}"><span class="eyebrow">${t[1]}</span>
          <span class="med">${money(b.median)}</span><br><span class="rng">${money(b.low)} to ${money(b.high)}<br>${b.n} sales</span></button>`;
      }).join("")}</div>
      <div class="chartbox"><div class="legend"><span><i style="background:var(--brass)"></i>Median sold, Very Good</span><span><i style="background:var(--brass);opacity:.25"></i>Typical range</span>${tr == null ? "" : `<span>${tr >= 0 ? "Up" : "Down"} <span class="num">${Math.abs(tr * 100).toFixed(0)}%</span> over 12 months</span>`}</div>${chart(g)}</div>
      <div class="checker"><div class="inputs"><div class="field"><label for="quote">Price you were quoted ($)</label>
        <input id="quote" type="number" inputmode="decimal" min="0" step="1" placeholder="${Math.round((band(g, tier).median || 0) * 1.15)}" value="${quote ?? ""}"></div>
        <div class="field"><label for="tierSel">Condition</label><select id="tierSel">${TIERS.map((t, i) => `<option value="${i}"${i === tier ? " selected" : ""}>${t[1]}</option>`).join("")}</select></div></div>
        <div id="vbox">${verdict(g)}</div></div>`;
    el.querySelectorAll(".tier").forEach((b) => (b.onclick = () => { tier = +b.dataset.t; renderDetail(); }));
    $("#tierSel").onchange = (e) => { tier = +e.target.value; renderDetail(); };
    $("#quote").oninput = (e) => { quote = e.target.value === "" ? null : +e.target.value; $("#vbox").innerHTML = verdict(g); };
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
    return `<svg width="80" height="24" viewBox="0 0 80 24" aria-hidden="true"><polyline points="${pts.join(" ")}" fill="none" stroke="var(--od)" stroke-width="1.5"/><circle cx="${X(last)}" cy="${Y(h[last])}" r="2.5" fill="var(--od)"/></svg>`;
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
    }).join("")}</tr></thead><tbody>${rows.map((a) => `<tr>
      <td><b>${esc(a.name)}</b>${a.historical ? '<span class="tag">Historical</span>' : ""}</td><td>${esc(a.load)}</td>
      <td class="r num">${cents(a.median)}</td>
      <td class="r num">${cents(a.low_today)}${a.best ? `<span class="best">${esc(a.best.retailer)}</span>` : ""}</td>
      <td class="r num ${a.change_90d > 0 ? "up" : a.change_90d < 0 ? "down" : ""}">${pctTxt(a.change_90d)}</td>
      <td class="r">${spark(a.history)}</td></tr>`).join("")}</tbody>`;
    document.querySelectorAll("#ammoTable th button").forEach((b) => (b.onclick = () => {
      const k = b.dataset.k; sortDir = k === sortKey ? -sortDir : 1; sortKey = k; renderAmmo();
      const nb = document.querySelector(`#ammoTable th button[data-k="${k}"]`); if (nb) nb.focus();
    }));
  }
  function ammoCheck() {
    const a = AMMO[+$("#aCal").value], p = +$("#aPrice").value, c = +$("#aCount").value, out = $("#aOut");
    if (!a || !(p > 0 && c > 0) || a.median == null) { out.className = "ammoout v-fair"; out.textContent = "Enter a box price and round count."; return; }
    const cpr = p / c, d = ((cpr - a.median) / a.median) * 100;
    out.className = "ammoout " + (cpr <= a.low_today ? "v-good" : cpr <= a.median * 1.05 ? "v-fair" : cpr <= a.median * 1.25 ? "v-warn" : "v-bad");
    out.innerHTML = `<strong>${cents(cpr)} / rd</strong>${d >= 0 ? "+" : ""}${d.toFixed(0)}% vs. ${cents(a.median)} median for ${esc(a.name)}`;
  }

  /* ---------- Landed cost ---------- */
  function landed() {
    const n = (s) => Math.max(0, +$(s).value || 0);
    const p = n("#lPrice"), sh = n("#lShip"), f = n("#lFfl"), t = n("#lTax"), loc = n("#lLocal");
    const tax = ((p + sh) * t) / 100, tot = p + sh + f + tax, diff = loc - tot;
    let cmp;
    if (!loc) cmp = `<div class="cmp v-fair">Enter the store's out the door price to compare.</div>`;
    else if (diff > 25) cmp = `<div class="cmp v-good"><b>Online saves ${money(diff)}.</b> Ask the store to match, or buy online and transfer.</div>`;
    else if (diff < -25) cmp = `<div class="cmp v-warn"><b>The store is ${money(-diff)} cheaper.</b> Buy local and skip the wait.</div>`;
    else cmp = `<div class="cmp v-fair"><b>Within ${money(Math.abs(diff))}.</b> Buy local and keep the relationship.</div>`;
    $("#receipt").innerHTML = `<span class="eyebrow">Online, delivered to your FFL</span>
      <div class="line"><span>Price</span><span>${money(p)}</span></div><div class="line"><span>Shipping</span><span>${money(sh)}</span></div>
      <div class="line"><span>Transfer fee</span><span>${money(f)}</span></div><div class="line"><span>Tax (${t}%)</span><span>${money(tax)}</span></div>
      <div class="line tot"><span>Landed cost</span><span>${money(tot)}</span></div>
      <div class="line"><span>Store, out the door</span><span>${loc ? money(loc) : "n/a"}</span></div>${cmp}
      <span style="font-family:var(--body);font-size:12px;color:var(--muted)">Tax rules vary by state and seller. Transfer fees run roughly $25 to $75.</span>`;
  }

  /* ---------- Boot ---------- */
  function notice() {
    const d = META.as_of ? new Date(META.as_of + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
    if (META.as_of && $("#asof")) $("#asof").textContent = new Date(META.as_of + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }).replace(" ", ". ").toUpperCase();
    $("#notice").innerHTML = META.sample
      ? `<b>Preview:</b> prices shown are sample data, not live market prices.`
      : `Prices from completed sales and retailer listings. Updated ${d}.`;
  }

  async function boot() {
    renderCats();
    ["#lPrice", "#lShip", "#lFfl", "#lTax", "#lLocal"].forEach((s) => $(s).addEventListener("input", landed));
    landed();
    $("#q").addEventListener("input", (e) => {
      query = e.target.value.trim().toLowerCase(); renderList();
      const v = visible(); if (v.length && !v.includes(sel)) { sel = v[0]; quote = null; renderDetail(); renderList(); }
    });
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
    renderList(); renderDetail(); renderAmmo(); ammoCheck();
  }
  boot();
})();
