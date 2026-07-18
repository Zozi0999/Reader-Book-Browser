// content.js
// Leviathan Immersive Reader - Content Script
// Simplified message-based extraction matching the reference project structure

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "parse-content") {
    try {
      // 1. Clone document to avoid modifying the active DOM
      const documentClone = document.cloneNode(true);
      const baseUrl = window.location.href;

      // 2. Resolve relative URLs (images and links) to absolute URLs before parsing
      resolveRelativeUrls(documentClone, baseUrl);

      // 3. Initialize Readability (check if library loaded)
      if (typeof Readability === "undefined") {
        console.error("Readability library is not loaded.");
        sendResponse({ success: false, error: "Readability not loaded" });
        return;
      }

      // 4. Parse content
      const reader = new Readability(documentClone);
      const article = reader.parse();

      if (article) {
        // 5. Store parsed data in chrome.storage.local
        const storageKey = "reader_" + baseUrl;
        const articleData = {
          title: article.title || document.title || "Untitled",
          content: article.content || "<p>Failed to extract article content.</p>",
          byline: article.byline || "",
          siteName: article.siteName || "",
          excerpt: article.excerpt || "",
          dir: article.dir || "ltr",
          lang: article.lang || document.documentElement.lang || "",
          url: baseUrl,
          timestamp: Date.now()
        };

        chrome.storage.local.set({ [storageKey]: articleData }, () => {
          // 6. Redirect active tab to reader page
          const readerUrl = chrome.runtime.getURL("reader.html") + "?url=" + encodeURIComponent(baseUrl);
          window.location.href = readerUrl;
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false, error: "Could not parse article" });
      }
    } catch (error) {
      console.error("Error in Immersive Reader content parser:", error);
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // Keep message channel open for async sendResponse
});

// Helper function to resolve relative paths to absolute URLs
function resolveRelativeUrls(doc, baseUrl) {
  // Fix images
  const images = doc.querySelectorAll("img");
  images.forEach(img => {
    // Resolve src
    const src = img.getAttribute("src");
    if (src) {
      try {
        img.setAttribute("src", new URL(src, baseUrl).href);
      } catch (e) {
        // Leave as is if URL constructor fails
      }
    }

    // Resolve srcset
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      try {
        const absoluteSrcset = srcset.split(",").map(part => {
          const trimmed = part.trim();
          const spaceIndex = trimmed.indexOf(" ");
          if (spaceIndex === -1) {
            return new URL(trimmed, baseUrl).href;
          }
          const urlPart = trimmed.substring(0, spaceIndex);
          const descriptorPart = trimmed.substring(spaceIndex);
          return new URL(urlPart, baseUrl).href + descriptorPart;
        }).join(", ");
        img.setAttribute("srcset", absoluteSrcset);
      } catch (e) {
        // Leave as is if parsing fails
      }
    }

    // Handle lazy loaded images common attributes
    ["data-src", "data-original-src", "original-src", "lazy-src"].forEach(attr => {
      const lazySrc = img.getAttribute(attr);
      if (lazySrc) {
        try {
          const absLazy = new URL(lazySrc, baseUrl).href;
          img.setAttribute(attr, absLazy);
          if (!img.getAttribute("src") || img.getAttribute("src").startsWith("data:image")) {
            img.setAttribute("src", absLazy);
          }
        } catch (e) {}
      }
    });
  });

  // Fix videos, audios, sources, iframes, embeds, objects
  const mediaElements = doc.querySelectorAll("video, audio, source, iframe, embed, object");
  mediaElements.forEach(el => {
    const src = el.getAttribute("src");
    if (src) {
      try {
        el.setAttribute("src", new URL(src, baseUrl).href);
      } catch (e) {}
    }

    // Handle lazy loaded media
    ["data-src", "data-original-src", "original-src", "lazy-src"].forEach(attr => {
      const lazySrc = el.getAttribute(attr);
      if (lazySrc) {
        try {
          const absLazy = new URL(lazySrc, baseUrl).href;
          el.setAttribute(attr, absLazy);
          if (!el.getAttribute("src")) {
            el.setAttribute("src", absLazy);
          }
        } catch (e) {}
      }
    });
  });

  // Fix hyperlinks
  const links = doc.querySelectorAll("a");
  links.forEach(a => {
    const href = a.getAttribute("href");
    if (href) {
      try {
        // Only convert http/https/relative links, ignore hash anchors or mailto/javascript
        if (!href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:") && !href.startsWith("javascript:")) {
          a.setAttribute("href", new URL(href, baseUrl).href);
        }
      } catch (e) {
        // Leave as is
      }
    }
  });
}
