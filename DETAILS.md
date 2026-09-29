# Develobar – Chrome Web Store Listing Details

## Title

Develobar – Developer Toolbar

## Summary

A developer toolbar for any web page: screenshot, colour picker, ruler and copy CSS, all in one bar.

## Description

Develobar adds a compact developer toolbar to any web page, giving you the everyday tools you reach for when building, reviewing or debugging websites, without opening DevTools.

Open it on any page by clicking the toolbar icon or pressing Alt+Shift+D. Develobar only runs on a page when you open it there.

**Tools included**

- **Screenshot**: capture the visible area, the full scrolling page, or a region you select. Images are saved straight to your computer as PNG files.
- **Colour picker**: hover over any pixel to see its colour as HEX, RGB, HSL and CMYK, with a zoomed magnifier for precise picking. Click to copy the HEX value, or click any format to copy that one.
- **Ruler**: click two points to measure the distance between them in pixels. Hold Shift to snap to horizontal, vertical or 45° lines. Measurements stay in place when you scroll.
- **Copy CSS**: select an element on the page to see the CSS that reproduces its look, ready to copy to your clipboard or download as a .css file.

**Private by design**

Everything happens locally in your browser. Develobar has no accounts, no analytics and no tracking, and it never sends page content, screenshots or browsing data anywhere.

**Keyboard shortcut**

- Alt+Shift+D: toggle Develobar (you can change this at chrome://extensions/shortcuts)

## Single Purpose Description

Develobar provides a toolbar of front-end developer utilities (screenshot capture, colour picking, on-page measurement and CSS inspection) that the user can open on any web page to inspect and capture that page.

## Permission Justifications

### activeTab

Develobar only runs on a page when the user asks for it by clicking the toolbar icon or pressing the keyboard shortcut. activeTab gives it temporary access to that tab so it can add the toolbar to the page and capture the visible tab for the screenshot and colour picker tools. It requests no standing access to any website.

### scripting

The scripting permission is used to inject Develobar's toolbar and tool scripts into the current tab when the user clicks the toolbar icon or presses the keyboard shortcut. Only scripts bundled with the extension are injected; no remote code is executed.

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
