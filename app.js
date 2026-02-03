/* ═══════════════════════════════════════════
   SCHOLARFETCH — FRONTEND LOGIC
   ═══════════════════════════════════════════ */

// ─────────────────────────────────────────────
//  ⚙️  CONFIG — UPDATE THIS URL AFTER DEPLOYING BACKEND
//      Example: "https://scholar-downloader-api.onrender.com"
// ─────────────────────────────────────────────
const API_BASE = "YOUR_RENDER_URL_HERE";
// Example: const API_BASE = "https://scholar-downloader-api.onrender.com";


/* ── DOM refs ── */
const searchInput = document.getElementById("searchInput");
const numSelect = document.getElementById("numResults");
const btnSearch = document.getElementById("btnSearch");
const cardsGrid = document.getElementById("cardsGrid");
const loader = document.getElementById("loader");
const errorBanner = document.getElementById("errorBanner");
const errorMsg = document.getElementById("errorMsg");
const statsBar = document.getElementById("statsBar");
const statTotal = document.getElementById("statTotal");
const statPdf = document.getElementById("statPdf");
const statSelected = document.getElementById("statSelected");
const btnZip = document.getElementById("btnZip");
const serverStatus = document.getElementById("serverStatus");
const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");

/* ── State ── */
let currentPapers = [];   // all papers from last search
let selectedPapers = new Set(); // indices of selected papers


// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 3000) {
    toastMsg.textContent = msg;
    toast.classList.add("show");
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, duration);
}


// ─────────────────────────────────────────────
//  SERVER HEALTH CHECK
// ─────────────────────────────────────────────
async function checkHealth() {
    try {
        const res = await fetch(API_BASE + "/api/health", { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            serverStatus.textContent = "● Server online";
            serverStatus.className = "topbar-status online";
        } else { throw new Error(); }
    } catch {
        serverStatus.textContent = "● Server offline — check API_BASE URL";
        serverStatus.className = "topbar-status offline";
    }
}


// ─────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────
async function doSearch() {
    const topic = searchInput.value.trim();
    if (!topic) { showToast("Please type a search topic."); return; }

    const num = parseInt(numSelect.value);

    // UI reset
    btnSearch.disabled = true;
    cardsGrid.innerHTML = "";
    errorBanner.classList.add("hidden");
    statsBar.classList.add("hidden");
    loader.classList.remove("hidden");
    currentPapers = [];
    selectedPapers.clear();

    try {
        const res = await fetch(API_BASE + "/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, num_results: num })
        });

        const data = await res.json();

        // hide loader
        loader.classList.add("hidden");

        if (data.error && (!data.papers || data.papers.length === 0)) {
            errorMsg.textContent = data.error;
            errorBanner.classList.remove("hidden");
            btnSearch.disabled = false;
            return;
        }

        currentPapers = data.papers || [];
        renderCards(currentPapers);
        updateStats();

    } catch (err) {
        loader.classList.add("hidden");
        errorMsg.textContent = "Network error — is the backend running? Check API_BASE in app.js.";
        errorBanner.classList.remove("hidden");
    }

    btnSearch.disabled = false;
}


// ─────────────────────────────────────────────
//  RENDER CARDS
// ─────────────────────────────────────────────
function renderCards(papers) {
    cardsGrid.innerHTML = "";

    if (papers.length === 0) {
        cardsGrid.innerHTML = `<p style="color:var(--text-dim);font-size:.85rem;grid-column:1/-1;text-align:center;padding:60px 0;">No papers returned.</p>`;
        statsBar.classList.add("hidden");
        return;
    }

    statsBar.classList.remove("hidden");

    papers.forEach((p, i) => {
        const hasPdf = p.has_pdf;
        const card = document.createElement("div");
        card.className = "card";
        card.style.animationDelay = (i * 0.06) + "s"; // staggered entrance

        card.innerHTML = `
      <input type="checkbox" class="card-check" id="chk-${i}" ${!hasPdf ? 'disabled' : ''} />
      <div class="card-badge ${hasPdf ? 'pdf-yes' : 'pdf-no'}">
        <span class="badge-dot"></span>
        ${hasPdf ? 'PDF Available' : 'No PDF'}
      </div>
      <div class="card-title">${escapeHtml(p.title)}</div>
      <div class="card-meta">${escapeHtml(p.authors)}</div>
      <div class="card-abstract">${escapeHtml(p.abstract || "No abstract available.")}</div>
      <div class="card-actions">
        <button class="btn-dl" ${!hasPdf ? 'disabled' : ''} data-idx="${i}">⬇ Download PDF</button>
        ${p.source_url ? `<a href="${escapeHtml(p.source_url)}" target="_blank" class="btn-src">🔗 Source</a>` : ''}
      </div>
    `;

        cardsGrid.appendChild(card);

        // checkbox listener
        const chk = card.querySelector('.card-check');
        chk.addEventListener('change', () => toggleSelect(i, chk.checked));

        // download button listener
        const dlBtn = card.querySelector('.btn-dl');
        if (dlBtn) dlBtn.addEventListener('click', () => downloadSingle(i));
    });
}


// ─────────────────────────────────────────────
//  SELECTION
// ─────────────────────────────────────────────
function toggleSelect(idx, checked) {
    if (checked) selectedPapers.add(idx);
    else selectedPapers.delete(idx);
    updateStats();
}

function updateStats() {
    const total = currentPapers.length;
    const pdfCount = currentPapers.filter(p => p.has_pdf).length;

    statTotal.textContent = total;
    statPdf.textContent = pdfCount;
    statSelected.textContent = selectedPapers.size;

    btnZip.disabled = selectedPapers.size === 0;
}


// ─────────────────────────────────────────────
//  DOWNLOAD SINGLE PDF (via backend proxy)
// ─────────────────────────────────────────────
async function downloadSingle(idx) {
    const paper = currentPapers[idx];
    if (!paper || !paper.download_url) return;

    showToast("Downloading PDF…");

    try {
        const res = await fetch(API_BASE + "/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: paper.download_url, title: paper.title })
        });

        if (!res.ok) {
            const err = await res.json();
            showToast("Download failed: " + (err.error || "Unknown error"));
            return;
        }

        const blob = await res.blob();
        triggerBlobDownload(blob, sanitizeFilename(paper.title) + ".pdf");
        showToast("PDF downloaded!");

    } catch (err) {
        showToast("Download error — check network.");
    }
}


// ─────────────────────────────────────────────
//  DOWNLOAD ZIP (selected papers)
// ─────────────────────────────────────────────
async function downloadZip() {
    if (selectedPapers.size === 0) { showToast("Select at least one paper first."); return; }

    btnZip.disabled = true;
    btnZip.textContent = "⏳ Preparing ZIP…";
    showToast("Preparing ZIP — this may take a moment…", 8000);

    const selected = [...selectedPapers].map(i => currentPapers[i]);
    const topic = searchInput.value.trim() || "research";

    try {
        const res = await fetch(API_BASE + "/api/download-zip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ papers: selected, topic })
        });

        if (!res.ok) {
            const err = await res.json();
            showToast("ZIP error: " + (err.error || "Unknown"));
            btnZip.disabled = false;
            btnZip.textContent = "⬇ Download ZIP";
            return;
        }

        const blob = await res.blob();
        triggerBlobDownload(blob, sanitizeFilename(topic) + "_papers.zip");
        showToast("ZIP downloaded successfully!");

    } catch (err) {
        showToast("ZIP download failed — check network.");
    }

    btnZip.disabled = false;
    btnZip.textContent = "⬇ Download ZIP";
}


// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').slice(0, 150);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}


// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
btnSearch.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
btnZip.addEventListener("click", downloadZip);

// Pre-fill default topic
searchInput.value = "KNN nanorods";

// On page load → health check
checkHealth();