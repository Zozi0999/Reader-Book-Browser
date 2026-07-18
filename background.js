// background.js
// Leviathan Immersive Reader - Background Service Worker

// Initialize Context Menus and Header Rules
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "open-immersive-reader",
    title: "Open in Immersive Reader 📖",
    contexts: ["page"]
  });
  setupHeaderRules();
});

// Run rules on browser startup
chrome.runtime.onStartup.addListener(() => {
  setupHeaderRules();
});

// Handle messages from reader.js and sidepanel.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "open-ai-popup") {
    // Open Side Panel / Sidebar menempel di sisi browser
    const tabId = sender.tab ? sender.tab.id : null;
    if (typeof browser !== "undefined" && browser.sidebarAction && browser.sidebarAction.open) {
      browser.sidebarAction.open();
    } else if (chrome.sidePanel && tabId) {
      chrome.sidePanel.open({ tabId });
    } else if (chrome.sidePanel) {
      chrome.windows.getCurrent((win) => {
        chrome.sidePanel.open({ windowId: win.id });
      });
    } else {
      chrome.windows.create({
        url: chrome.runtime.getURL("sidepanel.html"),
        type: "popup",
        width: 420,
        height: Math.round((screen.availHeight || 900) * 0.85),
        left: Math.max(0, (screen.availWidth || 1920) - 440),
        top: 40
      });
    }
  }

  if (message.action === "update-video-referer" && message.url) {
    updateVideoRefererRules(message.url);
    sendResponse({ status: "ok" });
    return true;
  }

  if (message.action === "open-compact-popup") {
    // Fallback: jendela kecil menempel di kanan layar untuk situs yang blokir iframe
    const url = message.url || "https://gemini.google.com";
    const w = 420;
    const h = Math.round((screen.availHeight || 900) * 0.88);
    const left = Math.max(0, (screen.availWidth || 1920) - w - 8);
    chrome.windows.create({
      url: url,
      type: "popup",
      width: w,
      height: h,
      left: left,
      top: Math.round((screen.availHeight - h) / 2)
    });
  }

  if (message.action === "translate-text" && message.text && message.targetLang) {
    executeUnlimitedTranslation(message.text, message.targetLang, sendResponse);
    return true; // Keep message channel open for async response
  }
});

// ==========================================
// UNLIMITED TRANSLATION ENGINE (Multi-Endpoint Pool, Queue & Cache)
// ==========================================
const translationCache = new Map();
const translationQueue = [];
let activeTranslationWorkers = 0;
const MAX_CONCURRENT_TRANSLATIONS = 2; // Maximum concurrent external requests across ALL open tabs

function executeUnlimitedTranslation(text, targetLang, sendResponse) {
  // 1. Check in-memory hash cache
  const cacheKey = `${targetLang}_${text}`;
  if (translationCache.has(cacheKey)) {
    sendResponse({ success: true, translation: translationCache.get(cacheKey) });
    return;
  }

  // 2. Add request to FIFO Queue
  translationQueue.push({
    text: text,
    targetLang: targetLang,
    cacheKey: cacheKey,
    sendResponse: sendResponse,
    retries: 0
  });

  processTranslationQueue();
}

async function processTranslationQueue() {
  if (activeTranslationWorkers >= MAX_CONCURRENT_TRANSLATIONS || translationQueue.length === 0) {
    return;
  }

  activeTranslationWorkers++;
  const item = translationQueue.shift();

  try {
    const translatedText = await fetchWithEndpointRotation(item.text, item.targetLang, item.retries);
    
    // Save to cache (limit memory cache to last 200 items to prevent memory leaks)
    if (translationCache.size > 200) {
      const firstKey = translationCache.keys().next().value;
      if (firstKey) translationCache.delete(firstKey);
    }
    translationCache.set(item.cacheKey, translatedText);

    item.sendResponse({ success: true, translation: translatedText });
  } catch (error) {
    if (item.retries < 2) {
      // Exponential backoff retry with different endpoint from pool
      item.retries++;
      setTimeout(() => {
        translationQueue.unshift(item);
        processTranslationQueue();
      }, item.retries * 600);
    } else {
      console.error("Unlimited translation exhausted retries:", error);
      item.sendResponse({ success: false, error: error.message || "Gagal menerjemahkan teks setelah beberapa percobaan." });
    }
  } finally {
    activeTranslationWorkers--;
    processTranslationQueue();
  }
}

async function fetchWithEndpointRotation(text, targetLang, retryCount) {
  // Define endpoint rotation pool to avoid rate limits (`429 Too Many Requests`)
  const endpoints = [
    { client: "gtx", url: "https://translate.googleapis.com/translate_a/single" },
    { client: "webapp", url: "https://translate.googleapis.com/translate_a/single" },
    { client: "dict-chrome-ex", url: "https://clients5.google.com/translate_a/t" }
  ];

  // Pick endpoint based on retryCount rotation
  const chosen = endpoints[retryCount % endpoints.length];

  if (chosen.client === "dict-chrome-ex") {
    const url = `${chosen.url}?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetLang)}`;
    const bodyParams = new URLSearchParams({ q: text });
    
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString()
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${chosen.client}`);
    }

    const data = await res.json();
    let translated = "";
    if (Array.isArray(data)) {
      if (typeof data[0] === "string") {
        translated = data.join(" ");
      } else if (Array.isArray(data[0])) {
        data.forEach(item => {
          if (Array.isArray(item) && item[0]) translated += item[0];
          else if (typeof item === "string") translated += item;
        });
      }
    } else if (typeof data === "string") {
      translated = data;
    }
    return translated || text;
  } else {
    // Standard gtx / webapp endpoint
    const bodyParams = new URLSearchParams({
      client: chosen.client,
      sl: "auto",
      tl: targetLang,
      dt: "t",
      q: text
    });

    const res = await fetch(chosen.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString()
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${chosen.client}`);
    }

    const data = await res.json();
    let translatedCombined = "";
    if (data && data[0]) {
      data[0].forEach(item => {
        if (item[0]) {
          translatedCombined += item[0];
        }
      });
    }
    return translatedCombined || text;
  }
}

// Context Menu Action Handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-immersive-reader") {
    triggerReader(tab);
  }
});

// Extension Icon Action Handler
chrome.action.onClicked.addListener((tab) => {
  triggerReader(tab);
});

// Helper function to check if a URL is a PDF
function isPdfUrl(url) {
  if (!url) return false;
  try {
    const cleanUrl = url.split(/[?#]/)[0];
    return cleanUrl.toLowerCase().endsWith(".pdf");
  } catch (e) {
    return false;
  }
}

// Helper function to send message to tab to extract content or redirect if PDF
function triggerReader(tab) {
  if (!tab || !tab.id) return;

  if (tab.url && tab.url.includes("reader.html")) {
    try {
      const urlParams = new URL(tab.url).searchParams;
      const origUrl = urlParams.get("url");
      if (origUrl) {
        chrome.tabs.update(tab.id, { url: origUrl });
        return;
      }
    } catch(e) {}
    return;
  }

  if (isPdfUrl(tab.url)) {
    const readerUrl = chrome.runtime.getURL("reader.html") + "?url=" + encodeURIComponent(tab.url) + "&type=pdf";
    chrome.tabs.update(tab.id, { url: readerUrl });
    return;
  }

  // Study the reference project: send message to content script to parse content
  chrome.tabs.sendMessage(tab.id, { action: "parse-content" }, (response) => {
    if (chrome.runtime.lastError) {
      // Content script is not ready/injected yet, inject dynamically
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["Readability.js", "content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to inject scripts dynamically:", chrome.runtime.lastError.message);
          return;
        }
        // Retry sending the message after injection
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: "parse-content" });
        }, 150);
      });
    }
  });
}

// Bypassing X-Frame-Options and Content-Security-Policy to support embedded Live Interactive View
const RULE_ID = 101;

async function setupHeaderRules() {
  if (typeof chrome.declarativeNetRequest !== "undefined") {
    const rules = [
      {
        id: RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            { header: "x-frame-options", operation: "remove" },
            { header: "content-security-policy", operation: "remove" },
            { header: "x-content-security-policy", operation: "remove" },
            { header: "x-webkit-csp", operation: "remove" },
            { header: "cross-origin-opener-policy", operation: "remove" },
            { header: "cross-origin-embedder-policy", operation: "remove" },
            { header: "cross-origin-resource-policy", operation: "remove" }
          ]
        },
        condition: {
          urlFilter: "*",
          resourceTypes: ["sub_frame"]
        }
      },
      {
        id: 102,
        priority: 2,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "Referer", operation: "set", value: "https://www.youtube.com/" },
            { header: "Origin", operation: "set", value: "https://www.youtube.com" }
          ]
        },
        condition: {
          urlFilter: "*://*.youtube*",
          resourceTypes: ["sub_frame"]
        }
      }
    ];

    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [RULE_ID, 102, 103],
        addRules: rules
      });
      console.log("X-Frame-Options removal rules registered successfully.");
    } catch (e) {
      console.error("Failed to register declarativeNetRequest rules:", e);
    }
  }
}

async function updateVideoRefererRules(targetUrl) {
  if (typeof chrome.declarativeNetRequest !== "undefined") {
    try {
      // Always use youtube.com as Referer/Origin for YouTube embeds.
      // YouTube's player REJECTS embeds when Referer is set to a non-YouTube domain!
      // Previous bug: we were setting Referer to the article's source URL (e.g. byteplus.com)
      // which YouTube would reject with Error 150/153.
      const rules = [
        {
          id: 102,
          priority: 2,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Referer", operation: "set", value: "https://www.youtube.com/" },
              { header: "Origin", operation: "set", value: "https://www.youtube.com" }
            ]
          },
          condition: {
            urlFilter: "*://*.youtube*",
            resourceTypes: ["sub_frame", "xmlhttprequest", "media"]
          }
        },
        {
          id: 103,
          priority: 2,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Referer", operation: "set", value: "https://www.youtube.com/" },
              { header: "Origin", operation: "set", value: "https://www.youtube.com" }
            ]
          },
          condition: {
            urlFilter: "*://*.googlevideo.com/*",
            resourceTypes: ["media", "xmlhttprequest"]
          }
        }
      ];

      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [102, 103],
        addRules: rules
      });
      console.log("Updated video Referer/Origin rules (always youtube.com)");
    } catch (e) {
      console.error("Failed to update video Referer rules:", e);
    }
  }
}

// Register rules on worker startup
setupHeaderRules();
