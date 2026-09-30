# Develobar – Chrome Web Store Listing Details

## Title

Develobar – Developer Toolbar

## Summary

A developer toolbar for any web page: screenshot, colour picker, ruler, copy CSS, accessibility and SEO checks, all in one bar.

## Description

Develobar adds a compact developer toolbar to any web page, giving you the everyday tools you reach for when building, reviewing or debugging websites, without opening DevTools.

Open it on any page by clicking the toolbar icon or pressing Alt+Shift+D. Develobar only runs on a page when you open it there. Once open, it stays open when you reload the page or follow links within the same site, until you close it.

**Tools included**

- **Screenshot**: capture the visible area, the full scrolling page, or a region you select. Images are saved straight to your computer as PNG files.
- **Colour picker**: hover over any pixel to see its colour as HEX, RGB, HSL and CMYK, with a zoomed magnifier for precise picking. Click to copy the HEX value, or click any format to copy that one.
- **Ruler**: click two points to measure the distance between them in pixels. Hold Shift to snap to horizontal, vertical or 45° lines. Measurements stay in place when you scroll.
- **Copy CSS**: select an element on the page to see the CSS that reproduces its look, ready to copy to your clipboard or download as a .css file.
- **Accessibility**: check text contrast against WCAG AA or AAA, find missing or unhelpful alt text, review the heading outline, and spot keyboard problems such as unlabelled buttons and fields. Show the tab order on the page, and check any two colours with the built-in contrast checker. Click a result to jump to the element.
- **SEO**: see the page's title, meta description, canonical, robots directives and every meta and link tag, with a search result preview and a checklist of common issues. Preview how the page looks when shared on social sites, explore its JSON-LD and microdata, and check whether robots.txt blocks the page. Links open Google's Rich Results Test, the Schema Markup Validator and PageSpeed Insights for deeper checks.
- **Cookies**: see every cookie the site sets, including HttpOnly ones, with its domain, path, expiry and flags. Search, edit, add or delete cookies, and export them as JSON or a cookies.txt file for curl and wget. Cookie access is granted one site at a time, only when you choose to allow it.

**Private by design**

Everything happens locally in your browser. Develobar has no accounts, no analytics and no tracking, and it never sends page content, screenshots or browsing data anywhere.

**Keyboard shortcut**

- Alt+Shift+D: toggle Develobar (you can change this at chrome://extensions/shortcuts)

## Single Purpose Description

Develobar provides a toolbar of front-end developer utilities (screenshot capture, colour picking, on-page measurement, CSS inspection, accessibility and SEO checks, and cookie inspection) that the user can open on any web page to inspect and capture that page.

## Permission Justifications

### activeTab

Develobar only runs on a page when the user asks for it by clicking the toolbar icon or pressing the keyboard shortcut. activeTab gives it temporary access to that tab so it can add the toolbar to the page and capture the visible tab for the screenshot and colour picker tools. When the page is reloaded or the user follows a link within the same site, Develobar uses this same temporary access to put the toolbar back; as soon as the tab moves to a different site, the access ends and the toolbar is not restored. It requests no standing access to any website.

### scripting

The scripting permission is used to inject Develobar's toolbar and tool scripts into the current tab when the user clicks the toolbar icon or presses the keyboard shortcut, and to re-add the toolbar after that tab reloads within the same site. Only scripts bundled with the extension are injected; no remote code is executed.

### storage

The storage permission is used only to remember which open tabs currently have the toolbar showing, so it can be restored after the page reloads. This is kept in session storage (chrome.storage.session), which holds just the tab's ID, is never written to disk, and is cleared when the tab or browser is closed. No page content, URLs or browsing data are stored.

### cookies

The cookies permission is used only by the Cookies tool, which shows the user the cookies of the site they are viewing and lets them search, edit, add, delete and export them. Content scripts cannot see HttpOnly cookies or cookie attributes such as domain, path, expiry and SameSite, so the chrome.cookies API is needed. Cookies are only shown to the user and are never transmitted.

### Optional host permissions

Host access is declared as optional and is never granted at install. It is requested one site at a time, only when the user opens the Cookies tool on a site and clicks Allow, followed by Chrome's own permission prompt. The request covers the current host and its parent domains, because cookies set on a parent domain are also sent to the site. chrome.cookies needs this host access to read and change a site's cookies. The user can remove it from the Cookies panel or chrome://extensions at any time.

### Remote code

No. Develobar does not use remote code. All JavaScript and CSS is packaged with the extension.

## Data Usage Disclosures

Develobar does **not** collect or use any of the following user data categories:

- Personally identifiable information
- Health information
- Financial and payment information
- Authentication information
- Personal communications
- Location
- Web history
- User activity
- Website content

Certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.
