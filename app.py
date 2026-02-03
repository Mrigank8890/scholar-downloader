"""
============================================================
  GOOGLE SCHOLAR DOWNLOADER — FLASK BACKEND API
  Endpoints:
      POST /api/search        → Scrape Scholar, return metadata
      POST /api/download      → Download a single PDF (proxy)
      POST /api/download-zip  → Download all found PDFs as ZIP
      GET  /api/health        → Server health check
============================================================
"""

import os
import re
import time
import zipfile
import tempfile
import io
import urllib.parse

import requests
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS

# ─────────────────────────────────────────────
#  APP INIT
# ─────────────────────────────────────────────
app = Flask(__name__)

# CORS: allow any origin in production (lock down in prod if needed)
CORS(app, origins="*")

# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────
REQUEST_DELAY = 2  # seconds between outgoing scrape requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

MAX_RESULTS = 30  # cap per search


# ─────────────────────────────────────────────
#  UTILITY FUNCTIONS
# ─────────────────────────────────────────────
def sanitize(name: str) -> str:
    """Safe filename from title."""
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    return name.strip().replace(' ', '_')[:150]


def build_scholar_url(topic: str, start: int = 0) -> str:
    base = "https://scholar.google.com/scholar"
    params = {"q": topic, "start": start, "hl": "en", "as_sdt": "0,5"}
    return base + "?" + urllib.parse.urlencode(params)


def resolve_pdf_url(paper: dict) -> str | None:
    url = paper.get("pdf_link")
    if url:
        if url.startswith("//"):
            url = "https:" + url
        elif url.startswith("/"):
            url = "https://scholar.google.com" + url
        return url
    if paper.get("source_url") and ".pdf" in paper["source_url"].lower():
        return paper["source_url"]
    return None


# ─────────────────────────────────────────────
#  SCRAPER CORE
# ─────────────────────────────────────────────
def scrape_scholar(topic: str, num_results: int = 10) -> list[dict]:
    """
    Scrapes Google Scholar for `topic`.
    Returns list of paper metadata dicts.
    """
    all_papers = []
    pages_needed = (num_results // 10) + 1

    for page_idx in range(pages_needed):
        offset = page_idx * 10
        url = build_scholar_url(topic, start=offset)

        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as e:
            break

        soup = BeautifulSoup(resp.text, "html.parser")
        results = soup.find_all("div", class_="gs_r")

        if not results:
            break  # CAPTCHA or no more results

        for item in results:
            paper = {}

            # Title
            title_tag = item.find("h3", class_="gs_rt")
            paper["title"] = title_tag.get_text(strip=True) if title_tag else "Untitled"

            # Authors + year
            info_tag = item.find("div", class_="gs_a")
            paper["authors"] = info_tag.get_text(strip=True) if info_tag else "Unknown"
            year_match = re.search(r'\b(19|20)\d{2}\b', paper["authors"])
            paper["year"] = year_match.group() if year_match else "N/A"

            # Abstract
            abs_tag = item.find("div", class_="gs_rs")
            paper["abstract"] = abs_tag.get_text(strip=True) if abs_tag else ""

            # PDF link
            paper["pdf_link"] = None
            pdf_tag = item.find("a", href=True, string=re.compile(r'\[PDF\]', re.IGNORECASE))
            if pdf_tag:
                paper["pdf_link"] = pdf_tag["href"]

            # Source link
            paper["source_url"] = None
            if title_tag:
                t_link = title_tag.find("a", href=True)
                if t_link:
                    paper["source_url"] = t_link["href"]

            # Pre-resolve the PDF URL for the frontend
            paper["download_url"] = resolve_pdf_url(paper)
            paper["has_pdf"] = paper["download_url"] is not None

            all_papers.append(paper)

        if len(all_papers) >= num_results:
            break

        time.sleep(REQUEST_DELAY)

    return all_papers[:num_results]


# ─────────────────────────────────────────────
#  API ROUTES
# ─────────────────────────────────────────────

# ── Health check ──
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Server is running"})


# ── Search ──
@app.route("/api/search", methods=["POST"])
def search():
    """
    Body: { "topic": "KNN nanorods", "num_results": 10 }
    Returns: { "papers": [...], "count": N, "topic": "..." }
    """
    data = request.get_json(silent=True) or {}
    topic = data.get("topic", "KNN nanorods").strip()
    num   = min(int(data.get("num_results", 10)), MAX_RESULTS)

    if not topic:
        return jsonify({"error": "Topic is required"}), 400

    papers = scrape_scholar(topic, num)

    if not papers:
        return jsonify({
            "error": "No results returned. Google Scholar may be blocking automated requests. See README for solutions.",
            "papers": [],
            "count": 0
        }), 200  # 200 so the frontend can still show the message

    return jsonify({
        "papers": papers,
        "count": len(papers),
        "topic": topic
    })


# ── Proxy single PDF download ──
@app.route("/api/download", methods=["POST"])
def download_single():
    """
    Body: { "url": "<pdf_url>", "title": "Paper Title" }
    Streams the PDF back to the browser.
    """
    data = request.get_json(silent=True) or {}
    url   = data.get("url")
    title = data.get("title", "paper")

    if not url:
        return jsonify({"error": "URL is required"}), 400

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30, stream=True)
        resp.raise_for_status()

        # Validate PDF magic bytes
        content = resp.content
        if content[:4] != b'%PDF':
            return jsonify({"error": "The URL does not serve a valid PDF file."}), 400

        filename = sanitize(title) + ".pdf"
        return Response(
            content,
            mimetype="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        return jsonify({"error": f"Download failed: {str(e)}"}), 500


# ── Download ALL as ZIP ──
@app.route("/api/download-zip", methods=["POST"])
def download_zip():
    """
    Body: { "papers": [ { "title": "...", "download_url": "..." }, ... ] }
    Downloads all available PDFs server-side, zips them, sends the ZIP.
    """
    data = request.get_json(silent=True) or {}
    papers = data.get("papers", [])
    topic  = data.get("topic", "research_papers")

    if not papers:
        return jsonify({"error": "No papers provided"}), 400

    # Create an in-memory ZIP
    zip_buffer = io.BytesIO()
    downloaded = 0
    metadata_lines = []

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:

        for i, paper in enumerate(papers):
            url   = paper.get("download_url")
            title = paper.get("title", f"paper_{i+1}")

            # Write metadata for every paper
            metadata_lines.append(f"[{i+1}] {title}")
            metadata_lines.append(f"    Authors  : {paper.get('authors', 'N/A')}")
            metadata_lines.append(f"    Year     : {paper.get('year', 'N/A')}")
            metadata_lines.append(f"    Abstract : {paper.get('abstract', 'N/A')[:200]}")
            metadata_lines.append(f"    PDF URL  : {url or 'N/A'}")
            metadata_lines.append("")

            if not url:
                continue  # skip papers without PDF

            try:
                resp = requests.get(url, headers=HEADERS, timeout=30)
                resp.raise_for_status()
                if resp.content[:4] != b'%PDF':
                    continue  # not a real PDF
                filename = sanitize(title) + ".pdf"
                zf.writestr(filename, resp.content)
                downloaded += 1
            except Exception:
                continue  # skip failed downloads

            time.sleep(1)  # be polite

        # Add metadata report
        metadata_text = (
            f"Research Paper Download Report\n"
            f"Topic : {topic}\n"
            f"Papers: {len(papers)}\n"
            f"Downloaded PDFs: {downloaded}\n"
            f"{'=' * 60}\n\n"
            + "\n".join(metadata_lines)
        )
        zf.writestr("metadata_report.txt", metadata_text)

    # Serve the ZIP
    zip_buffer.seek(0)
    zip_filename = sanitize(topic) + "_papers.zip"
    return Response(
        zip_buffer.read(),
        mimetype="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'}
    )


# ─────────────────────────────────────────────
#  RUN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    # For local development
    app.run(debug=True, host="0.0.0.0", port=5000)