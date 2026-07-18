// reader.js
// Leviathan Immersive Reader - Main Script

document.addEventListener("DOMContentLoaded", () => {
  // State variables
  let articleData = null;
  let originalHtmlContent = "";
  let originalArticleState = null;
  let isPlaying = false;
  let currentTtsIndex = 0;
  let ttsElements = [];
  let speechUtterance = null;
  let selectedText = "";
  let apiKey = localStorage.getItem("gemini_api_key") || "";

  // DOM Elements
  const body = document.body;
  const articleContainer = document.getElementById("article-container");
  const articleHtml = document.getElementById("article-html-content");
  const articleTitle = document.getElementById("article-title");
  const articleByline = document.getElementById("article-byline");
  const articleSiteName = document.getElementById("article-site-name");
  const articleOriginalLink = document.getElementById("article-original-link");

  // Popover panels
  const settingsPopover = document.getElementById("settings-popover");
  const readingPopover = document.getElementById("reading-popover");

  // Toolbar buttons
  const btnExit = document.getElementById("btn-exit");
  const btnSettings = document.getElementById("btn-settings");
  const btnReading = document.getElementById("btn-reading");
  const btnCopilot = document.getElementById("btn-copilot");
  const btnToggleInteractive = document.getElementById("toggle-interactive-btn");
  const interactiveContainer = document.getElementById("interactive-container");
  const interactiveIframe = document.getElementById("interactive-iframe");

  // TTS controls
  const btnTtsPlay = document.getElementById("btn-tts-play");
  const btnTtsStop = document.getElementById("btn-tts-stop");
  const btnTtsPrev = document.getElementById("btn-tts-prev");
  const btnTtsNext = document.getElementById("btn-tts-next");
  const ttsControls = document.getElementById("tts-controls");
  const ttsVoice = document.getElementById("tts-voice");
  const ttsSpeed = document.getElementById("tts-speed");

  // Copilot elements (AI Panel)
  const copilotSidebar = document.getElementById("copilot-sidebar");
  const btnCloseCopilot = document.getElementById("btn-close-copilot");

  // Line focus elements
  const lineFocusTop = document.getElementById("line-focus-top");
  const lineFocusBottom = document.getElementById("line-focus-bottom");

  // API Key config elements
  const inputApiKey = document.getElementById("input-api-key");
  const btnSaveApiKey = document.getElementById("btn-save-api-key");
  const apiKeyStatus = document.getElementById("api-key-status");

  // 1. Initial Load & Fetch parsed article
  const urlParams = new URLSearchParams(window.location.search);
  const targetUrl = urlParams.get("url");
  const isPdf = urlParams.get("type") === "pdf" || (targetUrl && targetUrl.split(/[?#]/)[0].toLowerCase().endsWith(".pdf"));

  if (targetUrl) {
    if (isPdf) {
      renderPdf(targetUrl);
    } else {
      // Retry up to 5 times (500ms apart) — background.js may write storage slightly after redirect
      const storageKey = "reader_" + targetUrl;
      let retries = 0;
      const maxRetries = 5;

      function tryLoadArticle() {
        chrome.storage.local.get(null, (allResult) => {
          let foundData = allResult[storageKey];
          if (!foundData && targetUrl) {
            const targetClean = targetUrl.split(/[?#]/)[0].replace(/\/$/, "").toLowerCase();
            for (let k in allResult) {
              if (k.startsWith("reader_")) {
                const data = allResult[k];
                if (data && data.url) {
                  const dataClean = data.url.split(/[?#]/)[0].replace(/\/$/, "").toLowerCase();
                  if (dataClean === targetClean) {
                    foundData = data;
                    break;
                  }
                }
              }
            }
          }

          if (foundData) {
            articleData = foundData;
            renderArticle();
          } else if (retries < maxRetries) {
            retries++;
            setTimeout(tryLoadArticle, 500);
          } else {
            showError("Gagal memuat artikel. Coba klik ikon ekstensi lagi di halaman web yang ingin dibaca.");
          }
        });
      }
      tryLoadArticle();
    }
  } else {
    showError("Tidak ada URL yang ditentukan. Buka pembaca via ikon ekstensi.");
  }

  async function renderPdf(url) {
    articleTitle.textContent = "Loading PDF...";
    articleHtml.innerHTML = `<div class="placeholder-text"><span class="pulse-ring" style="position:relative; display:inline-block; width:12px; height:12px; margin-right:8px;"></span>Reading PDF content. This may take a moment depending on the document size...</div>`;
    
    try {
      // Set worker source
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
      
      // Fetch the PDF as array buffer
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF (HTTP ${response.status})`);
      }
      const arrayBuffer = await response.arrayBuffer();
      
      // Load PDF via PDF.js
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      let fullHtml = "";
      
      // Loop through pages and extract text
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Reconstruct lines based on Y-coordinate (transform[5])
        const items = textContent.items;
        if (items.length === 0) continue;
        
        // Sort items vertically first (top to bottom), then horizontally (left to right)
        items.sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) < 5) { // Same line (threshold of 5 units)
            return a.transform[4] - b.transform[4];
          }
          return yDiff;
        });
        
        let pageText = `<h3 class="pdf-page-header">Page ${pageNum} of ${pdf.numPages}</h3>`;
        let currentY = null;
        let currentLine = "";
        
        items.forEach(item => {
          if (currentY === null) {
            currentY = item.transform[5];
            currentLine = item.str;
          } else if (Math.abs(item.transform[5] - currentY) < 5) {
            // Add space between items if necessary
            if (currentLine && !currentLine.endsWith(" ") && !item.str.startsWith(" ")) {
              currentLine += " ";
            }
            currentLine += item.str;
          } else {
            // New line detected
            if (currentLine.trim()) {
              pageText += `<p>${escapeHtml(currentLine.trim())}</p>`;
            }
            currentY = item.transform[5];
            currentLine = item.str;
          }
        });
        
        if (currentLine.trim()) {
          pageText += `<p>${escapeHtml(currentLine.trim())}</p>`;
        }
        
        fullHtml += `<div class="pdf-page-container">${pageText}</div><hr class="pdf-page-divider">`;
      }
      
      // Extract title from URL
      let docTitle = "PDF Document";
      try {
        const pathParts = url.split(/[?#]/)[0].split("/");
        const fileName = decodeURIComponent(pathParts[pathParts.length - 1]);
        if (fileName && fileName.toLowerCase().endsWith(".pdf")) {
          docTitle = fileName;
        }
      } catch (e) {}
      
      // Determine site/source name
      let site = "Local PDF File";
      if (url.startsWith("http")) {
        try {
          site = new URL(url).hostname;
        } catch (e) {}
      }
      
      // Populate articleData
      articleData = {
        title: docTitle,
        content: fullHtml || "<p>No text content found in this PDF file.</p>",
        byline: `PDF Document (${pdf.numPages} Pages)`,
        siteName: site,
        url: url,
        timestamp: Date.now()
      };
      
      // Render the article page
      renderArticle();
      
    } catch (error) {
      console.error("PDF Parsing Error:", error);
      showError(`Failed to load or parse PDF document. Details: ${error.message}<br><br><em>Note: If loading a local 'file://' PDF, make sure you have allowed the extension access to file URLs in browser extension settings (chrome://extensions).</em>`);
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cleanArticleFormatting(container) {
    if (!container) return;

    // 1. Clean up images, SVGs & media consistency ("foto tidak konsisten" & giant logo/icon fix)
    const images = container.querySelectorAll("img, figure, picture, video, svg");
    images.forEach(el => {
      el.removeAttribute("align");
      el.removeAttribute("border");
      el.removeAttribute("hspace");
      el.removeAttribute("vspace");
      if (el.style) {
        el.style.float = "none";
        el.style.margin = "";
        el.style.display = "";
        // DO NOT wipe out style.width / style.height if explicitly set by original site!
      }
      if (el.tagName.toLowerCase() === "img") {
        let w = parseInt(el.getAttribute("width") || "0", 10);
        let h = parseInt(el.getAttribute("height") || "0", 10);
        // If no explicit width/height attributes, try natural dimensions
        if (w === 0 && el.naturalWidth) w = el.naturalWidth;
        if (h === 0 && el.naturalHeight) h = el.naturalHeight;
        const src = el.getAttribute("src") || "";
        const alt = el.getAttribute("alt") || "";
        const cls = el.className && typeof el.className === "string" ? el.className : "";
        
        // Already inside an extracted-card? Don't reclassify.
        const insideCard = el.closest(".extracted-card");
        if (insideCard) return;
        
        if ((w > 0 && w <= 36) || (h > 0 && h <= 36) || cls.includes("icon") || cls.includes("emoji") || alt.includes("icon")) {
          el.classList.add("inline-icon");
        } else if (src.includes("avatar") || src.includes("profile") || src.includes("user") || alt.toLowerCase().includes("avatar") || cls.toLowerCase().includes("avatar") || cls.toLowerCase().includes("user") || ((w > 36 && w <= 120) && (h > 36 && h <= 120) && w > 0 && h > 0 && Math.abs(w - h) <= 8)) {
          el.classList.add("avatar-image");
        } else if (src.includes("logo") || src.includes("icon") || alt.toLowerCase().includes("logo") || cls.toLowerCase().includes("logo") || (w > 0 && w <= 240 && h > 0 && h <= 120)) {
          el.classList.add("logo-image");
        } else {
          el.classList.add("article-photo");
        }
      }
    });

    // 1b. Fix YouTube & Embedded Video Players + Remove tracking/empty/non-video iframes
    const iframes = container.querySelectorAll("iframe, embed, object");
    iframes.forEach(ifr => {
      let src = ifr.getAttribute("src") || "";
      const isVideo = src.includes("youtube") || src.includes("youtu.be") || src.includes("vimeo") || src.includes("dailymotion") || src.includes("player") || src.includes("video") || src.includes("mp4") || src.includes("watch") || src.includes("embed") || src.includes("bilibili") || src.includes("twitch") || src.includes("tiktok") || src.includes("instagram");
      
      // If it's empty or tracking or analytics or ads, remove it!
      if (!src || src.includes("googletagmanager") || src.includes("doubleclick") || src.includes("googleadservices") || src.includes("analytics") || src.includes("facebook.com/tr") || src.includes("scorecardresearch") || src.includes("adsystem") || src.includes("tracker") || src.includes("pixel") || src.includes("beacon") || src.includes("hs-script") || src.includes("marketo") || ifr.getAttribute("hidden") !== null || (ifr.style && (ifr.style.display === "none" || ifr.style.visibility === "hidden"))) {
        ifr.remove();
        return;
      }

      if (isVideo) {
        ifr.classList.add("video-embed");
        try {
          let urlObj = new URL(src, window.location.href);
          
          if (urlObj.hostname.includes("youtube") || urlObj.hostname.includes("youtu.be")) {
            let videoId = "";
            if (urlObj.pathname.includes("/embed/")) {
              videoId = urlObj.pathname.split("/embed/")[1]?.split("/")[0]?.split("?")[0];
            } else if (urlObj.pathname.includes("/watch")) {
              videoId = urlObj.searchParams.get("v");
            } else if (urlObj.hostname === "youtu.be") {
              videoId = urlObj.pathname.slice(1).split("?")[0];
            }

            if (videoId) {
              // Build clean embed URL without origin, enablejsapi, or widgetid restrictions!
              // Use standard www.youtube.com so declarativeNetRequest Referer/Origin bypass works 100% reliably
              urlObj = new URL(`https://www.youtube.com/embed/${videoId}`);
              urlObj.searchParams.set("rel", "0");
              urlObj.searchParams.set("modestbranding", "1");
              urlObj.searchParams.set("playsinline", "1");
              src = urlObj.toString();
              ifr.setAttribute("src", src);
            }
          }

          ifr.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
          ifr.setAttribute("allowfullscreen", "true");
          ifr.removeAttribute("referrerpolicy");
          ifr.removeAttribute("sandbox");
          
          ifr.style.display = "block";
          ifr.style.width = "100%";
          ifr.style.maxWidth = "800px";
          ifr.style.aspectRatio = "16 / 9";
          ifr.style.height = "auto";
          ifr.style.margin = "28px auto";
          ifr.style.borderRadius = "12px";
          ifr.style.boxShadow = "0 6px 24px rgba(0, 0, 0, 0.22)";
          ifr.style.border = "none";
        } catch (e) {
          console.error("Video iframe clean error:", e);
        }
      } else {
        // Non-video iframe/widget: do not force 16:9 or black background!
        if (ifr.style) {
          ifr.style.maxWidth = "100%";
          ifr.style.border = "none";
          ifr.style.background = "transparent";
        }
      }
    });

    // 1c. Fix HTML5 <video> & <source> players + Handle Blob/Social Media Protected Streams
    const videos = container.querySelectorAll("video");
    videos.forEach(vid => {
      let src = vid.getAttribute("src") || "";
      const sourceTag = vid.querySelector("source[src]");
      if (!src && sourceTag) {
        src = sourceTag.getAttribute("src") || "";
      }
      if (!src) {
        src = vid.getAttribute("data-src") || vid.getAttribute("data-video-url") || "";
      }

      // If src starts with blob: (common on LinkedIn, TikTok, Twitter/X, Instagram) OR if src is missing/unplayable across origins:
      // Browser extensions cannot play blob: URLs from another origin. We create an elegant interactive fallback player card!
      if (!src || src.startsWith("blob:") || src.includes("linkedin.com") || src.includes("facebook.com") || src.includes("twitter.com") || src.includes("tiktok.com")) {
        const fallbackCard = document.createElement("div");
        fallbackCard.className = "video-fallback-card";
        fallbackCard.style.cssText = "background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px; padding: 28px 24px; text-align: center; margin: 28px auto; max-width: 680px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);";
        
        let originalPageUrl = "";
        try {
          if (typeof articleData !== "undefined" && articleData && articleData.url) {
            originalPageUrl = articleData.url;
          } else {
            originalPageUrl = window.location.href;
          }
        } catch (e) {}

        fallbackCard.innerHTML = `
          <div style="font-size: 2.6rem; margin-bottom: 12px;">🎬</div>
          <h4 style="margin: 0 0 8px 0; color: var(--text-color); font-size: 1.2rem; font-weight: 700;">Video Media Sosial & Streaming Terproteksi</h4>
          <p style="margin: 0 auto 18px auto; color: var(--text-muted); font-size: 0.94rem; line-height: 1.5; max-width: 520px;">
            Video dari media sosial atau platform SPA menggunakan enkripsi stream / sesi login lokal (blob) sehingga memerlukan akses langsung di halaman aslinya.
          </p>
          <a href="${originalPageUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--accent-color); color: #ffffff; padding: 12px 24px; border-radius: 30px; font-weight: 600; font-size: 0.95rem; text-decoration: none; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); transition: transform 0.2s ease, box-shadow 0.2s ease;">
            <span>▶</span> Putar / Tonton Video di Situs Asli
          </a>
        `;
        vid.parentNode.insertBefore(fallbackCard, vid);
        vid.remove();
        return;
      }

      // Standard CDN or playable MP4/WEBM video
      vid.removeAttribute("crossorigin");
      vid.setAttribute("controls", "true");
      vid.setAttribute("playsinline", "true");
      if (vid.hasAttribute("loop") || vid.getAttribute("autoplay") !== null || vid.classList.contains("bg-P1hz")) {
        vid.setAttribute("loop", "true");
      }
      vid.removeAttribute("autoplay");
      vid.style.display = "block";
      vid.style.width = "100%";
      vid.style.maxWidth = "800px";
      vid.style.aspectRatio = "16 / 9";
      vid.style.height = "auto";
      vid.style.margin = "28px auto";
      vid.style.borderRadius = "12px";
      vid.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.25)";
      vid.style.backgroundColor = "#000";
      vid.classList.add("video-embed");
    });

    // 2. Clean up tables for overflow and consistency
    const tables = container.querySelectorAll("table");
    tables.forEach(tbl => {
      if (tbl.parentElement && !tbl.parentElement.classList.contains("table-responsive")) {
        const wrapper = document.createElement("div");
        wrapper.className = "table-responsive";
        tbl.parentNode.insertBefore(wrapper, tbl);
        wrapper.appendChild(tbl);
      }
    });

    // 3. Fix inconsistent checkmarks, bullets, and list items ("centang tidak konsisten" fix)
    const checkmarkRegex = /^(\s*[\u2705\u2714\u2713\u2611\u2610\u2022\u25CF\u25A0\u25AA\u25AB\u2B50\u2605\u2606\u2728\u2764\uD83D\uDC49\uD83D\uDCC4\uD83D\uDCCC\uD83D\uDD38\uD83D\uDD39\uD83D\uDFE2\uD83D\uDFE0\uD83D\uDFE1\uD83D\uDFE3\uD83D\uDFE4\uD83D\uDFE5]|[\+\-\*]\s)/i;
    const standaloneBulletRegex = /^\s*[\u2705\u2714\u2713\u2611\u2610\u2022\u25CF\u25A0\u25AA\u25AB\u2B50\u2605\u2606\u2728\u2764\uD83D\uDC49\uD83D\uDFE2\uD83D\uDFE0\uD83D\uDFE1\uD83D\uDFE3\uD83D\uDFE4\uD83D\uDFE5\+\-\*]\s*$/i;

    // 3a. Merge standalone floating checkmarks/bullets into their corresponding text item.
    // Also handle cases where the checkmark is the sole content of a wrapper <div> or <span>.
    container.querySelectorAll("p, div, span, h1, h2, h3, h4, h5, h6, li").forEach(el => {
      const text = el.textContent.trim();
      if (!standaloneBulletRegex.test(text)) return;
      
      // Try merging into next sibling first
      let target = el.nextElementSibling;
      // If next sibling is also a standalone bullet, skip it and look further
      while (target && standaloneBulletRegex.test(target.textContent.trim())) {
        target = target.nextElementSibling;
      }
      if (target && target.textContent.trim().length > 0) {
        target.innerHTML = `<span class="inline-bullet-icon">${text}</span>` + target.innerHTML;
        target.classList.add("custom-bullet-item", "p-bullet");
        el.remove();
        return;
      }
      
      // Try merging into previous sibling if no suitable next sibling
      let prevTarget = el.previousElementSibling;
      if (prevTarget && prevTarget.textContent.trim().length > 3 && !standaloneBulletRegex.test(prevTarget.textContent.trim())) {
        prevTarget.innerHTML = prevTarget.innerHTML + ` <span class="inline-bullet-icon">${text}</span>`;
        el.remove();
        return;
      }
      
      // If completely orphaned (no adjacent content), just remove it to avoid visual clutter
      el.remove();
    });

    container.querySelectorAll("li").forEach(li => {
      const text = li.textContent.trim();
      if (checkmarkRegex.test(text)) {
        li.classList.add("custom-bullet-item");
        li.style.listStyleType = "none";
      }
    });

    container.querySelectorAll("p, div").forEach(el => {
      if (el.children.length > 3 && el.tagName === "DIV") return;
      const text = el.textContent.trim();
      if (checkmarkRegex.test(text) && text.length < 800) {
        el.classList.add("custom-bullet-item", "p-bullet");
      }
    });

    // 4. Group headings with their following content ("Informasi Produk dan Kinerja" problem)
    container.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(h => {
      h.classList.add("section-heading");
      if (h.style) {
        h.style.marginTop = "";
        h.style.marginBottom = "";
        h.style.paddingBottom = "";
      }
      if (h.parentElement && h.parentElement.tagName.toLowerCase() === "p" && h.parentElement.children.length === 1) {
        h.parentElement.replaceWith(h);
      }
    });

    // Convert bold short paragraphs that act as headings into section headings!
    container.querySelectorAll("p").forEach(p => {
      const text = p.textContent.trim();
      if (text.length > 0 && text.length < 100 && !/[.\?\!;\:]$/.test(text)) {
        const firstChild = p.firstElementChild;
        if (firstChild && (firstChild.tagName === "STRONG" || firstChild.tagName === "B") && firstChild.textContent.trim() === text) {
          p.classList.add("section-heading", "p-heading");
        }
      }
    });
  }

  function renderArticle() {
    articleTitle.textContent = articleData.title;
    articleByline.textContent = articleData.byline ? `By ${articleData.byline}` : "";
    
    let hostname = "";
    try {
      hostname = new URL(articleData.url).hostname;
    } catch (e) {}
    articleSiteName.textContent = articleData.siteName || hostname || "Local File";
    
    articleOriginalLink.href = articleData.url;
    articleHtml.innerHTML = articleData.content;
    
    // Update DeclarativeNetRequest rules in background.js to spoof Referer & Origin to the article's own domain!
    // This bypasses YouTube Error 153 (configuration/scheme error) and Error 152 (domain restriction error)!
    try {
      chrome.runtime.sendMessage({ action: "update-video-referer", url: articleData.url });
    } catch (e) {}

    // Clean and normalize article formatting (headings grouping, checkmark alignment, image consistency)
    cleanArticleFormatting(articleHtml);
    
    // Save original content for resetting grammar tools
    originalHtmlContent = articleHtml.innerHTML;
    originalArticleState = {
      title: articleTitle ? articleTitle.innerHTML : "",
      byline: articleByline ? articleByline.innerHTML : "",
      content: articleHtml ? articleHtml.innerHTML : "",
      dir: articleData.dir || "ltr"
    };

    // Apply document text direction
    if (articleData.dir) {
      articleContainer.setAttribute("dir", articleData.dir);
      articleContainer.classList.add(articleData.dir);
    }

    // Set html lang so browser translate can detect the source language
    if (articleData.lang) {
      document.documentElement.setAttribute("lang", articleData.lang);
    }

    // Initialize TTS elements
    updateTtsElementsList();
    
    // Load options
    loadUserPreferences();
  }

  function showError(msg) {
    articleTitle.textContent = "Error";
    articleByline.textContent = "";
    articleSiteName.textContent = "";
    articleOriginalLink.style.display = "none";
    articleHtml.innerHTML = `<div style="padding: 20px; border: 1px solid var(--card-border); border-radius: 8px; background-color: var(--card-bg);">
      <p style="color: var(--accent-color); font-weight: bold; margin-bottom: 10px;">Warning</p>
      <p>${msg}</p>
    </div>`;
  }

  // Back to original website button
  btnExit.addEventListener("click", () => {
    if (articleData && articleData.url) {
      window.location.href = articleData.url;
    } else {
      window.history.back();
    }
  });

  // 2. Preferences Management
  function loadUserPreferences() {
    chrome.storage.local.get(["reader_theme", "reader_font", "reader_size", "reader_width", "reader_scrollbar"], (pref) => {
      // Theme
      const theme = pref.reader_theme || "theme-sepia";
      body.className = body.className.replace(/\btheme-\S+/g, "");
      body.classList.add(theme);
      document.querySelectorAll(".theme-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.theme === theme);
      });

      // Font
      const font = pref.reader_font || "font-serif";
      body.className = body.className.replace(/\bfont-\S+/g, "");
      body.classList.add(font);
      document.querySelectorAll(".font-option").forEach(b => {
        b.classList.toggle("active", b.dataset.font === font);
      });

      // Size
      const size = pref.reader_size || "18";
      document.documentElement.style.setProperty("--font-size-base", `${size}px`);
      document.getElementById("slider-font-size").value = size;
      document.getElementById("font-size-val").textContent = `${size}px`;

      // Width
      const width = pref.reader_width || "width-medium";
      body.className = body.className.replace(/\bwidth-\S+/g, "");
      body.classList.add(width);
      document.querySelectorAll(".width-option").forEach(b => {
        b.classList.toggle("active", b.dataset.width === width);
      });

      // Scrollbar
      const showScrollbar = pref.reader_scrollbar !== false; // default to true
      const toggleScrollbar = document.getElementById("toggle-scrollbar");
      if (toggleScrollbar) {
        toggleScrollbar.checked = showScrollbar;
      }
      if (showScrollbar) {
        document.documentElement.classList.remove("hide-scrollbar");
        document.body.classList.remove("hide-scrollbar");
      } else {
        document.documentElement.classList.add("hide-scrollbar");
        document.body.classList.add("hide-scrollbar");
      }
    });

    // Populate API Key config
    if (apiKey) {
      inputApiKey.value = apiKey;
      apiKeyStatus.textContent = "API key aktif.";
    }
  }

  // API Key save handler
  btnSaveApiKey.addEventListener("click", () => {
    const newKey = inputApiKey.value.trim();
    if (newKey) {
      localStorage.setItem("gemini_api_key", newKey);
      apiKey = newKey;
      apiKeyStatus.textContent = "Tersimpan! AI Gemini aktif.";
    } else {
      localStorage.removeItem("gemini_api_key");
      apiKey = "";
      apiKeyStatus.textContent = "API key dihapus. Mode simulasi aktif.";
    }
    setTimeout(() => { apiKeyStatus.textContent = ""; }, 3000);
  });

  // Popover Toggles
  btnSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPopover.classList.toggle("hidden");
    readingPopover.classList.add("hidden");
  });

  btnReading.addEventListener("click", (e) => {
    e.stopPropagation();
    readingPopover.classList.toggle("hidden");
    settingsPopover.classList.add("hidden");
  });

  document.addEventListener("click", () => {
    settingsPopover.classList.add("hidden");
    readingPopover.classList.add("hidden");
  });

  settingsPopover.addEventListener("click", (e) => e.stopPropagation());
  readingPopover.addEventListener("click", (e) => e.stopPropagation());

  // Size Controls
  const sizeSlider = document.getElementById("slider-font-size");
  sizeSlider.addEventListener("input", (e) => {
    const size = e.target.value;
    document.documentElement.style.setProperty("--font-size-base", `${size}px`);
    document.getElementById("font-size-val").textContent = `${size}px`;
    chrome.storage.local.set({ reader_size: size });
  });

  document.getElementById("btn-font-dec").addEventListener("click", () => {
    let size = parseInt(sizeSlider.value) - 1;
    if (size >= parseInt(sizeSlider.min)) {
      sizeSlider.value = size;
      sizeSlider.dispatchEvent(new Event("input"));
    }
  });

  document.getElementById("btn-font-inc").addEventListener("click", () => {
    let size = parseInt(sizeSlider.value) + 1;
    if (size <= parseInt(sizeSlider.max)) {
      sizeSlider.value = size;
      sizeSlider.dispatchEvent(new Event("input"));
    }
  });

  // Font Change
  document.querySelectorAll(".font-option").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".font-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const font = btn.dataset.font;
      body.className = body.className.replace(/\bfont-\S+/g, "");
      body.classList.add(font);
      chrome.storage.local.set({ reader_font: font });
    });
  });

  // Width Change
  document.querySelectorAll(".width-option").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".width-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const width = btn.dataset.width;
      body.className = body.className.replace(/\bwidth-\S+/g, "");
      body.classList.add(width);
      chrome.storage.local.set({ reader_width: width });
    });
  });

  // Theme Change
  document.querySelectorAll(".theme-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".theme-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const theme = btn.dataset.theme;
      body.className = body.className.replace(/\btheme-\S+/g, "");
      body.classList.add(theme);
      chrome.storage.local.set({ reader_theme: theme });
    });
  });

  // Scrollbar Toggle Event Listener
  const toggleScrollbarBtn = document.getElementById("toggle-scrollbar");
  if (toggleScrollbarBtn) {
    toggleScrollbarBtn.addEventListener("change", (e) => {
      const showScrollbar = e.target.checked;
      chrome.storage.local.set({ reader_scrollbar: showScrollbar });
      if (showScrollbar) {
        document.documentElement.classList.remove("hide-scrollbar");
        document.body.classList.remove("hide-scrollbar");
      } else {
        document.documentElement.classList.add("hide-scrollbar");
        document.body.classList.add("hide-scrollbar");
      }
    });
  }

  // Live Interactive Mode Toggle
  if (btnToggleInteractive && interactiveContainer && interactiveIframe) {
    btnToggleInteractive.addEventListener("click", () => {
      const isInteractiveActive = btnToggleInteractive.classList.toggle("active");
      
      if (isInteractiveActive) {
        // Show iframe, hide main content container
        articleContainer.classList.add("hidden");
        interactiveContainer.classList.remove("hidden");
        
        // Set iframe src to original URL if not already loaded
        if (articleData && articleData.url && interactiveIframe.src !== articleData.url) {
          interactiveIframe.src = articleData.url;
        }
        
        btnToggleInteractive.querySelector("span").textContent = "Reader View";
      } else {
        // Show main content, hide iframe
        articleContainer.classList.remove("hidden");
        interactiveContainer.classList.add("hidden");
        
        btnToggleInteractive.querySelector("span").textContent = "Interactive View";
      }
    });
  }

  // 3. Text-to-Speech (Read Aloud)
  function updateTtsElementsList() {
    const textNodes = articleHtml.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, li");
    ttsElements = Array.from(textNodes).filter(el => el.innerText.trim().length > 0);
  }

  // Load voices dynamically
  function populateVoices() {
    if (typeof speechSynthesis === "undefined") return;
    const voices = speechSynthesis.getVoices();
    ttsVoice.innerHTML = "";
    voices.forEach(voice => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      // Choose default English or Indonesian voice
      if (voice.default || voice.lang.startsWith("en-") || voice.lang.startsWith("id-")) {
        option.selected = true;
      }
      ttsVoice.appendChild(option);
    });
  }

  populateVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }

  btnTtsPlay.addEventListener("click", () => {
    if (isPlaying) {
      pauseSpeech();
    } else {
      playSpeech();
    }
  });

  btnTtsStop.addEventListener("click", stopSpeech);

  btnTtsPrev.addEventListener("click", () => {
    if (currentTtsIndex > 0) {
      currentTtsIndex--;
      speakCurrent();
    }
  });

  btnTtsNext.addEventListener("click", () => {
    if (currentTtsIndex < ttsElements.length - 1) {
      currentTtsIndex++;
      speakCurrent();
    }
  });

  function playSpeech() {
    isPlaying = true;
    btnTtsPlay.querySelector(".icon-play").classList.add("hidden");
    btnTtsPlay.querySelector(".icon-pause").classList.remove("hidden");
    ttsControls.classList.remove("hidden");

    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    } else {
      speakCurrent();
    }
  }

  function pauseSpeech() {
    isPlaying = false;
    btnTtsPlay.querySelector(".icon-play").classList.remove("hidden");
    btnTtsPlay.querySelector(".icon-pause").classList.add("hidden");
    speechSynthesis.pause();
  }

  function stopSpeech() {
    isPlaying = false;
    btnTtsPlay.querySelector(".icon-play").classList.remove("hidden");
    btnTtsPlay.querySelector(".icon-pause").classList.add("hidden");
    ttsControls.classList.add("hidden");
    speechSynthesis.cancel();
    currentTtsIndex = 0;
    ttsElements.forEach(el => el.classList.remove("current-speech-word"));
  }

  function speakCurrent() {
    speechSynthesis.cancel();

    if (currentTtsIndex >= ttsElements.length) {
      stopSpeech();
      return;
    }

    ttsElements.forEach((el, index) => {
      el.classList.toggle("current-speech-word", index === currentTtsIndex);
    });

    const targetEl = ttsElements[currentTtsIndex];
    
    // Auto-scroll to view currently read element
    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

    speechUtterance = new SpeechSynthesisUtterance(targetEl.innerText);
    
    // Select Voice
    const selectedVoiceName = ttsVoice.value;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === selectedVoiceName);
    if (voice) speechUtterance.voice = voice;

    // Set Speed
    speechUtterance.rate = parseFloat(ttsSpeed.value);

    speechUtterance.onend = () => {
      if (isPlaying) {
        currentTtsIndex++;
        speakCurrent();
      }
    };

    speechUtterance.onerror = (e) => {
      console.error("SpeechSynthesis error:", e);
      if (isPlaying) {
        currentTtsIndex++;
        speakCurrent();
      }
    };

    speechSynthesis.speak(speechUtterance);
  }

  // 4. Line Focus Mode
  let activeFocusMode = "focus-off";

  document.querySelectorAll(".focus-option").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".focus-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFocusMode = btn.dataset.focus;

      if (activeFocusMode === "focus-off") {
        lineFocusTop.style.display = "none";
        lineFocusBottom.style.display = "none";
        document.removeEventListener("mousemove", updateLineFocusPosition);
        document.removeEventListener("scroll", updateLineFocusPosition);
      } else {
        lineFocusTop.style.display = "block";
        lineFocusBottom.style.display = "block";
        document.addEventListener("mousemove", updateLineFocusPosition);
        document.addEventListener("scroll", updateLineFocusPosition);
      }
    });
  });

  function updateLineFocusPosition(e) {
    if (activeFocusMode === "focus-off") return;

    let y = 0;
    if (e.type === "mousemove") {
      y = e.clientY;
      // Save last mouse Y coordinates on window for scroll events
      window.lastMouseY = y;
    } else if (e.type === "scroll") {
      y = window.lastMouseY || window.innerHeight / 2;
    }

    let focusHeight = 60; // Default for 1 line
    if (activeFocusMode === "focus-3") {
      focusHeight = 130;
    } else if (activeFocusMode === "focus-5") {
      focusHeight = 220;
    }

    const topLimit = y - (focusHeight / 2);
    const bottomLimit = y + (focusHeight / 2);

    lineFocusTop.style.top = "0px";
    lineFocusTop.style.height = `${Math.max(0, topLimit)}px`;

    lineFocusBottom.style.top = `${bottomLimit}px`;
    lineFocusBottom.style.height = `${Math.max(0, window.innerHeight - bottomLimit)}px`;
  }

  // 5. Grammar & Syllable Highlight Tools
  const toggleNouns = document.getElementById("toggle-nouns");
  const toggleVerbs = document.getElementById("toggle-verbs");
  const toggleAdjectives = document.getElementById("toggle-adjectives");
  const toggleSyllables = document.getElementById("toggle-syllables");

  const ENGLISH_LEXICON = {
    nouns: new Set(['health', 'insurance', 'company', 'use', 'article', 'people', 'world', 'system', 'web', 'page', 'reader', 'text', 'mode', 'content', 'company', 'information', 'name', 'type', 'industry', 'data', 'history']),
    verbs: new Set(['is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'read', 'see', 'find', 'make', 'use', 'create', 'write', 'go', 'come', 'founded', 'managed', 'traded', 'show']),
    adjectives: new Set(['clean', 'beautiful', 'cleanest', 'good', 'bad', 'great', 'new', 'old', 'free', 'first', 'last', 'active', 'immersive', 'original', 'public', 'private', 'healthier', 'worth'])
  };

  function getWordType(word) {
    const w = word.toLowerCase();
    
    if (ENGLISH_LEXICON.nouns.has(w)) return 'noun';
    if (ENGLISH_LEXICON.verbs.has(w)) return 'verb';
    if (ENGLISH_LEXICON.adjectives.has(w)) return 'adjective';
    
    // Suffixes checking
    if (w.endsWith('tion') || w.endsWith('ness') || w.endsWith('ment') || w.endsWith('ity') || w.endsWith('ance') || w.endsWith('ence') || w.endsWith('ism') || w.endsWith('ship')) {
      return 'noun';
    }
    if (w.endsWith('ing') || w.endsWith('ize') || w.endsWith('ise') || w.endsWith('ate') || w.endsWith('ify') || (w.endsWith('ed') && w.length > 4)) {
      return 'verb';
    }
    if (w.endsWith('ful') || w.endsWith('less') || w.endsWith('able') || w.endsWith('ible') || w.endsWith('ive') || w.endsWith('ous') || (w.endsWith('al') && w.length > 4)) {
      return 'adjective';
    }
    
    return null;
  }

  function splitWordSyllables(word) {
    // Basic heuristic to insert separation dots for syllables
    if (word.length <= 3) return word;
    return word.replace(/([aeiouy]+)([^aeiouy\s\d\W]+)/gi, '$1•$2');
  }

  function applyGrammarProcess() {
    // Reset contents
    articleHtml.innerHTML = originalHtmlContent;

    const nounActive = toggleNouns.checked;
    const verbActive = toggleVerbs.checked;
    const adjActive = toggleAdjectives.checked;
    const syllableActive = toggleSyllables.checked;

    if (!nounActive && !verbActive && !adjActive && !syllableActive) {
      updateTtsElementsList();
      return;
    }

    const config = { noun: nounActive, verb: verbActive, adjective: adjActive, syllable: syllableActive };
    
    // Traverse DOM text nodes and highlight
    traverseAndHighlight(articleHtml, config);
    updateTtsElementsList();
  }

  function traverseAndHighlight(node, config) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentNode;
      if (parent && parent.classList.contains('grammar-word')) return;
      if (parent && ['SCRIPT', 'STYLE', 'PRE', 'CODE', 'A'].includes(parent.tagName)) return;

      const text = node.textContent;
      // Split by words
      const words = text.split(/(\b\w+\b)/);
      let changed = false;
      const fragment = document.createDocumentFragment();

      words.forEach(word => {
        if (/^[a-zA-Z]+$/.test(word)) {
          const type = getWordType(word);
          let textVal = word;
          if (config.syllable) {
            textVal = splitWordSyllables(word);
          }

          if (type && config[type]) {
            const span = document.createElement('span');
            span.className = `grammar-word highlighted-${type}`;
            span.textContent = textVal;
            fragment.appendChild(span);
            changed = true;
          } else if (config.syllable && textVal !== word) {
            const span = document.createElement('span');
            span.className = `grammar-word`;
            span.textContent = textVal;
            fragment.appendChild(span);
            changed = true;
          } else {
            fragment.appendChild(document.createTextNode(word));
          }
        } else {
          fragment.appendChild(document.createTextNode(word));
        }
      });

      if (changed) {
        parent.replaceChild(fragment, node);
      }
    } else {
      // Loop backwards to handle replacements correctly without throwing off indexing
      const children = Array.from(node.childNodes);
      for (let child of children) {
        traverseAndHighlight(child, config);
      }
    }
  }

  [toggleNouns, toggleVerbs, toggleAdjectives, toggleSyllables].forEach(input => {
    input.addEventListener("change", applyGrammarProcess);
  });

  // 6. AI Copilot Integration (Sidebar, Summarize, Explain, Chat)
  btnCopilot.addEventListener("click", () => {
    copilotSidebar.classList.remove("hidden");
    articleContainer.classList.add("shifted-sidebar");
  });

  btnCloseCopilot.addEventListener("click", () => {
    copilotSidebar.classList.add("hidden");
    articleContainer.classList.remove("shifted-sidebar");
  });

  // === AI Copilot Panel — iframe + overlay logic ===
  let currentAiUrl = localStorage.getItem("copilot_webview_url") || "";

  // Sites known to use Cloudflare bot-detection or JS iframe-detection that cannot be embedded.
  // These must be opened in a popup window instead of an iframe.
  const IFRAME_BLOCKED_PATTERNS = [
    "deepseek.com",
    "copilot.microsoft.com",
    "bing.com/chat",
    "perplexity.ai",
    "you.com"
  ];

  function isIframeBlocked(url) {
    try {
      const host = new URL(url).hostname + new URL(url).pathname;
      return IFRAME_BLOCKED_PATTERNS.some(p => host.includes(p));
    } catch (_) { return false; }
  }

  function showBlockedOverlay(url) {
    const blockedOverlay = document.getElementById("copilot-blocked-overlay");
    const idleOverlay = document.getElementById("copilot-overlay");
    const nameEl = document.getElementById("blocked-site-name");
    if (idleOverlay) idleOverlay.classList.add("hidden");
    if (blockedOverlay) blockedOverlay.classList.remove("hidden");
    if (nameEl) {
      try {
        nameEl.textContent = new URL(url).hostname + " tidak bisa dibuka dalam panel.";
      } catch(_) {}
    }
  }

  function hideAllOverlays() {
    const blockedOverlay = document.getElementById("copilot-blocked-overlay");
    const idleOverlay = document.getElementById("copilot-overlay");
    if (idleOverlay) idleOverlay.classList.add("hidden");
    if (blockedOverlay) blockedOverlay.classList.add("hidden");
  }

  function loadAiUrl(url) {
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    currentAiUrl = url;
    localStorage.setItem("copilot_webview_url", url);

    const iframe = document.getElementById("copilot-webview-iframe");
    const urlInput = document.getElementById("copilot-webview-url");

    if (urlInput) urlInput.value = url;

    document.querySelectorAll(".ai-preset-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.url === url);
    });

    // Known iframe-blocked sites: skip the iframe attempt, go straight to popup
    if (isIframeBlocked(url)) {
      showBlockedOverlay(url);
      if (iframe) iframe.src = "about:blank";
      return;
    }

    if (iframe) {
      hideAllOverlays();
      iframe.src = url;

      clearTimeout(window._aiBlankTimer);

      // Detect blank iframe (connection refused / X-Frame-Options block)
      // onerror fires for net-level failures; onload is checked for empty body
      iframe.onerror = () => showBlockedOverlay(url);

      iframe.onload = () => {
        clearTimeout(window._aiBlankTimer);
        window._aiBlankTimer = setTimeout(() => {
          try {
            const body = iframe.contentDocument?.body;
            if (body && body.innerHTML.trim() === "") showBlockedOverlay(url);
          } catch (_) {
            // Cross-origin = page loaded normally, do nothing
          }
        }, 2000);
      };
    }
  }

  // Open AI Side Panel (menempel di sisi kanan browser)
  function openAiPopup() {
    chrome.runtime.sendMessage({ action: "open-ai-popup" });
  }

  // Delegate all AI panel button events on document
  document.addEventListener("click", (e) => {
    const target = e.target;

    // ── Buka / Save URL button ──
    if (target.id === "btn-save-copilot-url" || target.closest("#btn-save-copilot-url")) {
      const urlInput = document.getElementById("copilot-webview-url");
      if (urlInput) loadAiUrl(urlInput.value.trim());
    }

    // ── Preset AI buttons ──
    const presetBtn = target.closest(".ai-preset-btn");
    if (presetBtn && presetBtn.dataset.url) {
      loadAiUrl(presetBtn.dataset.url);
    }

    // ── Fallback: Buka di Jendela Samping button (idle overlay) ──
    if (target.id === "btn-open-ai-popup" || target.closest("#btn-open-ai-popup")) {
      const url = currentAiUrl || "https://gemini.google.com";
      chrome.runtime.sendMessage({ action: "open-compact-popup", url });
    }

    // ── Blocked overlay: Buka di Jendela Terpisah ──
    if (target.id === "btn-open-ai-popup-blocked" || target.closest("#btn-open-ai-popup-blocked")) {
      const url = currentAiUrl || "https://gemini.google.com";
      chrome.runtime.sendMessage({ action: "open-compact-popup", url });
    }

    // ── Toggle Controls Button (Sembunyikan/Tampilkan URL bar & preset) ──
    if (target.id === "btn-toggle-controls" || target.closest("#btn-toggle-controls")) {
      const btn = target.closest("#btn-toggle-controls") || target;
      const controls = document.getElementById("copilot-controls");
      if (controls) {
        controls.classList.toggle("collapsed");
        btn.classList.toggle("collapsed");
        const isCollapsed = controls.classList.contains("collapsed");
        btn.title = isCollapsed ? "Tampilkan Pengaturan URL" : "Sembunyikan Pengaturan URL";
      }
    }
  });

  // Restore saved URL when sidebar opens
  document.addEventListener("click", (e) => {
    if (e.target.id === "btn-copilot" || e.target.closest("#btn-copilot")) {
      const urlInput = document.getElementById("copilot-webview-url");
      if (currentAiUrl && urlInput) {
        urlInput.value = currentAiUrl;
        // Auto-load saved URL
        const iframe = document.getElementById("copilot-webview-iframe");
        if (iframe && iframe.src === "about:blank" && currentAiUrl) {
          loadAiUrl(currentAiUrl);
        }
      }
    }
  });

  // ── Copy Context button ──
  document.addEventListener("click", (e) => {
    if (e.target.id === "btn-copy-context" || e.target.closest("#btn-copy-context")) {
      const title = articleTitle ? articleTitle.textContent.trim() : document.title;
      const bodyText = articleHtml ? articleHtml.innerText.substring(0, 3000) : "";
      const contextText = `[Artikel: ${title}]\n\n${bodyText}\n\n---\nBerikan saya analisis, ringkasan, atau jawab pertanyaan saya tentang artikel ini.`;
      navigator.clipboard.writeText(contextText).then(() => {
        const status = document.getElementById("context-copy-status");
        if (status) {
          status.classList.remove("hidden");
          setTimeout(() => status.classList.add("hidden"), 3000);
        }
      }).catch(err => console.error("Clipboard error:", err));
    }
  });

  // === Resize Handle Logic (Geser untuk ubah lebar sidebar) ===
  let isResizingSidebar = false;
  document.addEventListener("mousedown", (e) => {
    if (e.target.id === "copilot-resize-handle" || e.target.closest("#copilot-resize-handle")) {
      isResizingSidebar = true;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      const handle = document.getElementById("copilot-resize-handle");
      if (handle) handle.classList.add("dragging");
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizingSidebar) return;
    const sidebarEl = document.getElementById("copilot-sidebar");
    if (!sidebarEl) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 280 && newWidth <= 700) {
      sidebarEl.style.width = newWidth + "px";
    }
  });

  document.addEventListener("mouseup", () => {
    if (isResizingSidebar) {
      isResizingSidebar = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const handle = document.getElementById("copilot-resize-handle");
      if (handle) handle.classList.remove("dragging");
    }
  });

  // Helper: version-tolerant & model-tolerant API calling wrapper with caching
  let cachedApiVersion = localStorage.getItem("gemini_working_version") || null;
  let cachedModelName = localStorage.getItem("gemini_working_model") || null;

  async function fetchGeminiAPI(payload) {
    const apiVersions = ["v1", "v1beta"];
    const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    let lastError = null;

    // 1. Try cached working configuration first
    if (cachedApiVersion && cachedModelName) {
      const url = `https://generativelanguage.googleapis.com/${cachedApiVersion}/models/${cachedModelName}:generateContent`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            return data.candidates[0].content.parts[0].text;
          }
        }
      } catch (err) {
        console.warn("Cached Gemini configuration failed, starting auto-discovery...", err);
        localStorage.removeItem("gemini_working_version");
        localStorage.removeItem("gemini_working_model");
        cachedApiVersion = null;
        cachedModelName = null;
      }
    }

    // 2. Auto-discovery loop (try all models and versions)
    for (const model of models) {
      for (const version of apiVersions) {
        // Skip gemini-pro (text-only) if payload contains inlineData (multimodal image requests)
        const isMultimodalRequest = payload.contents && 
                                    payload.contents[0] && 
                                    payload.contents[0].parts && 
                                    payload.contents[0].parts.some(p => p.inlineData);
        if (model === "gemini-pro" && isMultimodalRequest) {
          continue; 
        }

        const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`;
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            const data = await response.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
              // Cache working configuration
              localStorage.setItem("gemini_working_version", version);
              localStorage.setItem("gemini_working_model", model);
              cachedApiVersion = version;
              cachedModelName = model;
              return data.candidates[0].content.parts[0].text;
            }
          } else {
            const errData = await response.json().catch(() => ({}));
            lastError = new Error(errData.error?.message || `HTTP ${response.status}`);
            
            // If the model or version is not found/supported, try next combination
            if (response.status === 404 || response.status === 400) {
              continue;
            }
            throw lastError;
          }
        } catch (err) {
          lastError = err;
        }
      }
    }
    throw lastError || new Error("Failed to contact Gemini API after trying all supported models and versions.");
  }

  // Helper: call Gemini API or fall back to mock
  async function callAI(prompt, systemInstruction = "", generationConfig = undefined) {
    if (!apiKey) {
      // Wait to simulate thinking
      await new Promise(resolve => setTimeout(resolve, 1500));
      return getSimulatedAIResponse(prompt);
    }

    try {
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generationConfig: generationConfig
      };
      return await fetchGeminiAPI(payload);
    } catch (err) {
      console.error("AI Error:", err);
      return `❌ AI API Error: ${err.message}. Showing simulated local processing instead:\n\n${getSimulatedAIResponse(prompt)}`;
    }
  }

  function getSimulatedAIResponse(prompt) {
    const p = prompt.toLowerCase();
    
    // Check if it's a summary request
    if (p.includes("summary") || p.includes("ringkas")) {
      const bullets = [];
      const h2s = Array.from(articleHtml.querySelectorAll("h2, h3")).map(h => h.innerText);
      const paragraphs = Array.from(articleHtml.querySelectorAll("p")).map(p => p.innerText.substring(0, 120) + "...");
      
      bullets.push(`Article Overview: Analyzed "${articleTitle.textContent}" sourced from ${articleSiteName.textContent}.`);
      if (h2s.length > 0) {
        bullets.push(`Key Sections Discovered: ${h2s.slice(0, 3).join(", ")}.`);
      }
      bullets.push(`Primary Insight: ${paragraphs[0] || "No body paragraphs found."}`);
      if (paragraphs[1]) bullets.push(`Context details: ${paragraphs[1]}`);
      bullets.push(`⚠️ Note: Configure your Gemini API Key in the settings panel above for real-time live AI analysis.`);

      return `## Article Summary (Simulated Agent Mode)\n\n` + bullets.map(b => `- ${b}`).join("\n");
    }

    // Check if it's explaining text
    if (p.includes("explain") || p.includes("jelaskan")) {
      const term = selectedText || "the document";
      return `### Explanation (Simulated Agent Mode)\n\nYou highlighted: "${term}"\n\n**Analysis:**\n1. Contextually, this refers to critical variables inside the article regarding **${articleTitle.textContent}**.\n2. In a broader scope, it shows key attributes parsed by the Leviathan reader engine.\n3. *Tip:* Add a valid Gemini API Key above to generate an authentic neural explanation.`;
    }

    // General chat prompt
    return `🤖 **Leviathan Assistant (Offline Mode)**\n\nI parsed the article "${articleTitle.textContent}". Based on my offline heuristics:
- Source: ${articleSiteName.textContent}
- Length: ${ttsElements.length} elements
- Original URL: ${articleOriginalLink.href}

Ask me specific questions after entering a Gemini API Key to activate my live deep neural model. How else can I assist you in offline mode?`;
  }

  // Legacy Summary, Explain, and Chat features are replaced by the AI Webview.

  // Simple Markdown-to-HTML parser for responses
  function formatMarkdown(text) {
    let html = text;
    // Escaping HTML characters
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Bullet points
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    // Fix multiple consecutive uls
    html = html.replace(/<\/ul>\s*<ul>/g, "");
    
    // Blockquote
    html = html.replace(/^\>\s+(.*$)/gim, '<blockquote>$1</blockquote>');
    
    // Linebreaks
    html = html.replace(/\n/g, '<br>');
    
    return html;
  }

  // ==========================================
  // 6.5. In-Place Page & Image Translator
  // ==========================================
  const selectPageTranslate = document.getElementById("select-page-translate");
  
  if (selectPageTranslate) {
    selectPageTranslate.addEventListener("change", async (e) => {
      const targetLang = e.target.value;
      if (!targetLang) return;

      // Google Translate web proxy — buka artikel asli via translate.google.com
      // Ini satu-satunya cara mendapat "browser translate" sejati karena Chrome tidak
      // bisa menerjemahkan halaman chrome-extension://
      if (targetLang.startsWith("gt:")) {
        const lang = targetLang.replace("gt:", "");
        const articleUrl = articleData?.url;
        if (articleUrl) {
          const gtUrl = `https://translate.google.com/translate?sl=auto&tl=${lang}&u=${encodeURIComponent(articleUrl)}`;
          window.open(gtUrl, "_blank");
        }
        selectPageTranslate.value = "";
        return;
      }

      const originalOptionText = selectPageTranslate.options[selectPageTranslate.selectedIndex].text;
      selectPageTranslate.options[selectPageTranslate.selectedIndex].text = "⏳ Translating...";
      selectPageTranslate.disabled = true;

      try {
        // Jika user memilih "original", segera kembalikan ke teks dan arah awal (tanpa request API)
        if (targetLang === "original") {
          if (originalArticleState) {
            if (articleTitle) articleTitle.innerHTML = originalArticleState.title;
            if (articleByline) articleByline.innerHTML = originalArticleState.byline;
            if (articleHtml) articleHtml.innerHTML = originalArticleState.content;
            if (articleContainer) {
              articleContainer.setAttribute("dir", originalArticleState.dir || "ltr");
              articleContainer.classList.remove("rtl", "ltr");
              articleContainer.classList.add(originalArticleState.dir || "ltr");
            }
          }
          return;
        }

        // Sebelum menerjemahkan ke bahasa apa pun, jika kita punya originalArticleState,
        // pulihkan struktur DOM original agar terjemahan selalu dari teks sumber yang bersih (mencegah akumulasi error/mutasi DOM)
        if (originalArticleState) {
          if (articleTitle) articleTitle.innerHTML = originalArticleState.title;
          if (articleByline) articleByline.innerHTML = originalArticleState.byline;
          if (articleHtml) articleHtml.innerHTML = originalArticleState.content;
        }

        // Dynamically toggle LTR/RTL text direction layout
        const rtlLanguages = ["ar", "he", "fa", "ur", "arc", "dv", "ha", "khw", "ks", "ku", "ps", "yi"];
        const isRtl = rtlLanguages.includes(targetLang);
        
        if (articleContainer) {
          if (isRtl) {
            articleContainer.setAttribute("dir", "rtl");
            articleContainer.classList.remove("ltr");
            articleContainer.classList.add("rtl");
          } else {
            articleContainer.setAttribute("dir", "ltr");
            articleContainer.classList.remove("rtl");
            articleContainer.classList.add("ltr");
          }
        }

        // Collect all translatable block elements using our universal leaf-text algorithm
        const blocks = [];
        if (articleTitle && articleTitle.textContent.trim()) blocks.push(articleTitle);
        if (articleByline && articleByline.textContent.trim()) blocks.push(articleByline);
        
        const contentBlocks = getTranslatableElements(articleHtml);
        blocks.push(...contentBlocks);

        await translateHtmlBlocksBatched(blocks, targetLang);
      } catch (err) {
        console.error("Page translation error:", err);
        alert("Gagal menerjemahkan halaman: " + (err.message || err));
      } finally {
        selectPageTranslate.options[selectPageTranslate.selectedIndex].text = originalOptionText;
        selectPageTranslate.disabled = false;
        selectPageTranslate.value = "";
      }
    });
  }

  function getTranslatableElements(root) {
    const blocks = [];
    const blockTags = new Set([
      "P", "DIV", "SECTION", "ARTICLE", "MAIN", "ASIDE", "HEADER", "FOOTER", 
      "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "UL", "OL", 
      "TABLE", "TR", "THEAD", "TBODY", "DETAILS", "SUMMARY"
    ]);

    function walk(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip scripts, styles, pre, code, and interactive views
        const name = node.nodeName;
        if (name === "SCRIPT" || name === "STYLE" || name === "PRE" || name === "CODE" || node.classList.contains("interactive-container")) {
          return;
        }

        // Check if this element contains any block-level child elements
        let hasBlockChild = false;
        for (let child of node.childNodes) {
          if (child.nodeType === Node.ELEMENT_NODE && blockTags.has(child.nodeName)) {
            hasBlockChild = true;
            break;
          }
        }

        if (hasBlockChild) {
          // Recurse into children to find smaller block containers
          for (let child of node.childNodes) {
            walk(child);
          }
        } else {
          // If it contains no block children and has text content, it's a leaf translatable block
          if (node.textContent.trim().length > 0) {
            blocks.push(node);
          }
        }
      }
    }

    walk(root);
    return blocks;
  }

  async function translateHtmlBlocksBatched(elements, targetLang) {
    if (!elements || elements.length === 0) return;

    const validElements = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el && el.textContent && el.textContent.trim().length > 0) {
        validElements.push(el);
      }
    }

    if (validElements.length === 0) return;

    // ============================================================
    // NEW STRATEGY: Translate via TEXT-NODE walking, not raw HTML
    //
    // The old approach of combining innerHTML into one big HTML string
    // and letting Google Translate parse it caused two failure modes:
    //   1. Google silently truncates long HTML responses → partial translation
    //   2. Google strips/scrambles HTML attributes (data-id) → element matching fails
    //
    // The new approach:
    //   - Walk each element's child TEXT NODES recursively
    //   - Collect only the raw text strings
    //   - Batch them into groups of MAX 15 plain-text lines per API call
    //   - Use a SEPARATOR ("\n~~~\n") between texts that Google preserves
    //   - After translation, split on separator and map back to text nodes
    //   - HTML structure stays 100% intact at all times
    // ============================================================

    // 1. Collect all leaf text nodes across all valid elements
    const textNodeEntries = [];
    for (let i = 0; i < validElements.length; i++) {
      collectLeafTextNodes(validElements[i], textNodeEntries);
    }

    if (textNodeEntries.length === 0) return;

    // 2. Filter out whitespace-only text nodes and deduplicate
    const translatableEntries = textNodeEntries.filter(entry => entry.node.textContent.trim().length > 0);

    if (translatableEntries.length === 0) return;

    // 3. Batch into groups of MAX 15 text nodes per API request
    //    Separator must survive Google Translate without being modified
    const BATCH_SIZE = 15;
    const SEP = " ~~~ ";

    for (let batchStart = 0; batchStart < translatableEntries.length; batchStart += BATCH_SIZE) {
      const batch = translatableEntries.slice(batchStart, batchStart + BATCH_SIZE);
      const originalTexts = batch.map(entry => entry.node.textContent);
      const joinedText = originalTexts.join(SEP);

      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: "translate-text",
            text: joinedText,
            targetLang: targetLang
          }, (res) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(res);
            }
          });
        });

        if (response && response.success && response.translation) {
          // Split translated result back using the separator
          // Use a loose regex to handle any spacing/newline variations Google may introduce
          const translatedParts = response.translation.split(/\s*~~~\s*/);

          if (translatedParts.length === batch.length) {
            for (let k = 0; k < batch.length; k++) {
              const translatedText = translatedParts[k];
              if (translatedText !== undefined && translatedText.trim().length > 0) {
                batch[k].node.textContent = translatedText.trim();
              }
            }
          } else {
            // Separator was mangled — fall back to individual translation
            await translateTextNodesIndividually(batch, targetLang);
          }
        } else if (response && !response.success) {
          console.warn("Batch text translation failed, retrying individually:", response.error);
          await translateTextNodesIndividually(batch, targetLang);
        }
      } catch (err) {
        console.error("Batch text node translation exception:", err);
        await translateTextNodesIndividually(batch, targetLang);
      }

      // Polite delay between batches to prevent rate limiting
      if (batchStart + BATCH_SIZE < translatableEntries.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }

  function collectLeafTextNodes(element, result) {
    // Skip non-translatable tags
    const skipTags = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT", "TEMPLATE"]);
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (skipTags.has(element.nodeName)) return;
    if (element.classList && element.classList.contains("interactive-container")) return;

    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Only include text nodes with actual content
        if (child.textContent.trim().length > 0) {
          result.push({ node: child });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        collectLeafTextNodes(child, result);
      }
    }
  }

  async function translateTextNodesIndividually(batch, targetLang) {
    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j];
      const originalText = entry.node.textContent;
      if (!originalText.trim()) continue;

      try {
        const res = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: "translate-text",
            text: originalText,
            targetLang: targetLang
          }, (r) => resolve(r));
        });
        if (res && res.success && res.translation) {
          entry.node.textContent = res.translation;
        }
      } catch (e) {
        console.error("Individual text node fallback error:", e);
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  // Legacy fallback kept for compatibility
  async function translateIndividually(chunk, targetLang) {
    for (let j = 0; j < chunk.length; j++) {
      const item = chunk[j];
      const textEntries = [];
      collectLeafTextNodes(item.el, textEntries);
      await translateTextNodesIndividually(textEntries, targetLang);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

});
