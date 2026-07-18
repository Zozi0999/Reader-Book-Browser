# Reader Book Browser (Leviathan Immersive Reader)

Distraction-free reading mode for the browser — extracts article/book content from any page, renders it in a clean themeable reader view, and adds text-to-speech, line-focus reading, translation, and an embeddable AI Copilot sidebar.

Available as a Chrome/Edge (Manifest V3) extension and as a Firefox extension, built from a shared codebase.

## Features

- **Reader view** — strips ads/clutter via [Readability.js](https://github.com/mozilla/readability), five themes (sepia, light, dim, dark, galaxy-obsidian)
- **PDF support** — in-browser PDF text extraction via pdf.js
- **Text-to-speech** and **line-focus** reading mode
- **Translation** — in-page translation plus a "via Google Translate" fallback for browsers that can't natively translate extension pages
- **AI Copilot sidebar** — quick access to Gemini/other AI assistants alongside the article, with graceful fallback when a provider blocks iframe embedding (e.g. DeepSeek, Copilot)

## Install (unpacked / developer mode)

### Chrome / Edge

1. Go to `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** and select the [`chrome/`](./chrome) folder

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select any file inside the [`firefox/`](./firefox) folder (e.g. `manifest.json`)

See [`chrome/INSTALL_GUIDE.md`](./chrome/INSTALL_GUIDE.md) and [`firefox/INSTALL_GUIDE_FIREFOX.md`](./firefox/INSTALL_GUIDE_FIREFOX.md) for more detail.

## Project structure

```
reader-book-browser/
├── chrome/     Chrome/Edge extension (Manifest V3)
├── firefox/    Firefox extension (Manifest V3, gecko-specific settings)
├── LICENSE
└── README.md
```

The two folders are near-identical; differences are limited to `manifest.json` (background script vs. service worker, `sidebar_action` vs. `side_panel`, `browser_specific_settings.gecko`). When fixing a bug or adding a feature, apply the change to both folders.

## License

MIT — see [LICENSE](./LICENSE).
