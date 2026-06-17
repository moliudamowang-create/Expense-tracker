// ── AI 记账本 PWA — app.js ─────────────────────────────────────

const CATEGORIES = ["餐饮","交通","购物","娱乐","医疗","住宿","学习","日用品","转账","其他"];
const CAT_COLORS  = {
  "餐饮":"#FF6B6B","交通":"#4ECDC4","购物":"#45B7D1","娱乐":"#96CEB4",
  "医疗":"#FFEAA7","住宿":"#DDA0DD","学习":"#98D8C8","日用品":"#F7DC6F",
  "转账":"#AEB6BF","其他":"#D5D8DC"
};

let entries = JSON.parse(localStorage.getItem("expense_entries") || "[]");
let editId   = null;

// ── persistence ───────────────────────────────────────────────
function save() {
  localStorage.setItem("expense_entries", JSON.stringify(entries));
}

// ── render ────────────────────────────────────────────────────
function render() {
  // stats
  const total = entries.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  document.getElementById("stat-total").textContent = total.toFixed(2);
  document.getElementById("stat-count").textContent = entries.length;

  const catTotals = {};
  entries.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + parseFloat(e.amount||0); });
  const top = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];
  const topEl = document.getElementById("stat-top");
  if (top) {
    topEl.innerHTML = `<span class="tag" style="background:${CAT_COLORS[top[0]]||'#eee'}">${top[0]}</span> ${top[1].toFixed(2)}`;
  } else {
    topEl.textContent = "—";
  }
  document.getElementById("stats-bar").style.display = entries.length ? "flex" : "none";

  // table
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";
  if (!entries.length) {
    document.getElementById("empty").style.display = "flex";
    document.getElementById("table-wrap").style.display = "none";
    document.getElementById("dl-bar").style.display = "none";
    return;
  }
  document.getElementById("empty").style.display = "none";
  document.getElementById("table-wrap").style.display = "block";
  document.getElementById("dl-bar").style.display = "flex";

  entries.forEach((e, i) => {
    const tr = document.createElement("tr");
    tr.className = i % 2 === 0 ? "row-even" : "row-odd";
    if (editId === e.id) {
      tr.innerHTML = `
        <td><input class="cell-input" value="${esc(e.date)}" data-f="date" style="width:88px"></td>
        <td><input class="cell-input" value="${esc(e.amount)}" data-f="amount" style="width:60px"></td>
        <td><input class="cell-input" value="${esc(e.currency)}" data-f="currency" style="width:44px"></td>
        <td><input class="cell-input" value="${esc(e.merchant)}" data-f="merchant" style="width:80px"></td>
        <td>
          <select class="cell-input" data-f="category">
            ${CATEGORIES.map(c=>`<option${c===e.category?" selected":""}>${c}</option>`).join("")}
          </select>
        </td>
        <td><input class="cell-input" value="${esc(e.paymethod||'')}" data-f="paymethod" placeholder="支付宝/尾号1234" style="width:80px"></td>
        <td><input class="cell-input" value="${esc(e.note||'')}" data-f="note" style="width:70px"></td>
        <td class="actions">
          <button class="btn-save" data-id="${e.id}">✓</button>
          <button class="btn-cancel">✕</button>
        </td>`;
    } else {
      tr.innerHTML = `
        <td>${esc(e.date)}</td>
        <td class="amount">${esc(e.amount)}</td>
        <td class="muted">${esc(e.currency)}</td>
        <td>${esc(e.merchant)}</td>
        <td><span class="tag" style="background:${CAT_COLORS[e.category]||'#eee'}">${esc(e.category)}</span></td>
        <td class="paymethod">${e.paymethod ? `<span class="pm-chip">${esc(e.paymethod)}</span>` : '<span class="dash">—</span>'}</td>
        <td class="muted note-cell">${esc(e.note||"")}</td>
        <td class="actions">
          <button class="btn-edit" data-id="${e.id}">✏️</button>
          <button class="btn-del" data-id="${e.id}">🗑️</button>
        </td>`;
    }
    tbody.appendChild(tr);
  });

  // bind edit row inputs
  tbody.querySelectorAll(".btn-save").forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.id);
      const tr = btn.closest("tr");
      const idx = entries.findIndex(e => e.id === id);
      if (idx < 0) return;
      tr.querySelectorAll("[data-f]").forEach(inp => {
        entries[idx][inp.dataset.f] = inp.value;
      });
      editId = null; save(); render();
    };
  });
  tbody.querySelectorAll(".btn-cancel").forEach(btn => {
    btn.onclick = () => { editId = null; render(); };
  });
  tbody.querySelectorAll(".btn-edit").forEach(btn => {
    btn.onclick = () => { editId = parseInt(btn.dataset.id); render(); };
  });
  tbody.querySelectorAll(".btn-del").forEach(btn => {
    btn.onclick = () => {
      if (!confirm("删除这条记录？")) return;
      entries = entries.filter(e => e.id !== parseInt(btn.dataset.id));
      save(); render();
    };
  });
}

function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── image upload & AI ─────────────────────────────────────────
document.getElementById("file-input").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  await processImage(file);
});

// drag & drop
const dropZone = document.getElementById("drop-zone");
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", async e => {
  e.preventDefault(); dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) await processImage(file);
});

async function processImage(file) {
  const noteText = document.getElementById("note-input").value.trim();
  setLoading(true);
  try {
    const mediaType = file.type || "image/jpeg";
    const base64 = await toBase64(file);
    const today = new Date().toISOString().slice(0,10);
    const prompt = `你是一个记账助手。请从这张截图中提取所有消费记录，以JSON数组返回，每条记录包含：
- date: 日期 (YYYY-MM-DD, 若无则用今天 ${today})
- amount: 金额数字(字符串，只含数字和小数点)
- currency: 货币(DKK/CNY/USD/EUR等, 若看不出默认DKK)
- merchant: 商家或平台名称
- category: 从以下选一个[餐饮,交通,购物,娱乐,医疗,住宿,学习,日用品,转账,其他]
- paymethod: 支付方式，按以下规则填写：若识别到银行卡则填"尾号XXXX"，若是支付宝填"支付宝"，微信支付填"微信支付"，现金填"现金"，识别不到则填""
- raw: 原始文本描述(简短)

用途说明：${noteText || "无"}

只返回JSON数组，不要任何其他文字或markdown，格式：[{"date":"...","amount":"...","currency":"...","merchant":"...","category":"...","paymethod":"...","raw":"..."}]`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt }
        ]}]
      })
    });
    const data = await resp.json();
    const text = data.content?.find(b => b.type === "text")?.text || "[]";
    const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
    const now = Date.now();
    const newEntries = parsed.map((e, i) => ({ ...e, id: now + i, note: noteText || "" }));
    entries = [...newEntries, ...entries];
    save(); render();
    document.getElementById("note-input").value = "";
  } catch(err) {
    alert("识别失败：" + err.message);
  }
  setLoading(false);
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function setLoading(on) {
  document.getElementById("loading").style.display = on ? "flex" : "none";
  document.getElementById("drop-zone").style.opacity = on ? "0.5" : "1";
}

// ── download ──────────────────────────────────────────────────
document.getElementById("btn-xlsx").addEventListener("click", () => {
  if (!window.XLSX) return alert("XLSX 库加载中，请稍候重试");
  const wb = window.XLSX.utils.book_new();
  const data = [["日期","金额","货币","商家/平台","类别","支付方式","备注","原始识别内容"]];
  entries.forEach(e => data.push([e.date, parseFloat(e.amount)||e.amount, e.currency, e.merchant, e.category, e.paymethod||"", e.note, e.raw]));
  const ws = window.XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{wch:12},{wch:10},{wch:8},{wch:20},{wch:10},{wch:14},{wch:18},{wch:28}];
  window.XLSX.utils.book_append_sheet(wb, ws, "账单明细");

  const catT={}, catC={};
  entries.forEach(e=>{ catT[e.category]=(catT[e.category]||0)+parseFloat(e.amount||0); catC[e.category]=(catC[e.category]||0)+1; });
  const s2=[["类别","总金额","笔数"]];
  Object.entries(catT).sort((a,b)=>b[1]-a[1]).forEach(([c,a])=>s2.push([c,parseFloat(a.toFixed(2)),catC[c]]));
  const ws2=window.XLSX.utils.aoa_to_sheet(s2);
  ws2["!cols"]=[{wch:12},{wch:12},{wch:8}];
  window.XLSX.utils.book_append_sheet(wb, ws2, "分类汇总");

  const base64 = window.XLSX.write(wb, { bookType:"xlsx", type:"base64" });
  const a = document.createElement("a");
  a.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + base64;
  a.download = `账单_${new Date().toISOString().slice(0,10)}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
});

document.getElementById("btn-csv").addEventListener("click", () => {
  const headers = ["日期","金额","货币","商家","类别","支付方式","备注","原始描述"];
  const lines = [headers.join(",")];
  entries.forEach(e => {
    lines.push([e.date,e.amount,e.currency,`"${e.merchant}"`,e.category,`"${e.paymethod||""}"`,`"${e.note||""}"`,`"${e.raw||""}"`].join(","));
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF"+lines.join("\n")], {type:"text/csv;charset=utf-8"}));
  a.download = `账单_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
});

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!confirm("确定清空所有记录？")) return;
  entries = []; save(); render();
});

// ── init ──────────────────────────────────────────────────────
render();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
