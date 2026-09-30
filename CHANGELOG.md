# Changelog

All notable changes to Develobar are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-30

### Added

- **Cookies** tool: view every cookie the current site sets, including HttpOnly ones, with its domain, path, expiry and flags. Search, add, edit and delete cookies, and export them as JSON or a Netscape cookies.txt file for curl and wget. Cookie access is asked for one site at a time.

### Changed

- The Develobar logo in the toolbar now links to [iangunter.co.uk](https://iangunter.co.uk/#extensions).
- The SEO tool now calls it the "Robots meta tag" and explains that it is optional and separate from robots.txt. When the tag isn't set, the tool says that the default (index, follow) applies.

### Fixed

- Toolbar button labels no longer wrap onto two lines. On narrow windows (1000px or less) the buttons show just their icon, with the name as a tooltip.

## [0.1.0] - 2026-09-29

First public release.

### Added

- Developer toolbar that opens on any page from the toolbar icon or Alt+Shift+D. It stays open when you reload the page or follow links within the same site, until you close it.
- **Screenshot**: capture the visible area, the full scrolling page or a selected region, and save it as a PNG.
- **Colour picker**: see any pixel as HEX, RGB, HSL and CMYK using a zoomed magnifier, then click to copy it.
- **Ruler**: measure the distance between two points in pixels, with Shift to snap to horizontal, vertical or 45° lines.
- **Copy CSS**: select an element to get the CSS that reproduces its look, then copy it or download it as a .css file.
- **Accessibility**: check contrast against WCAG AA and AAA, review alt text and the heading outline, find keyboard problems, show the tab order, and compare two colours with the contrast checker.
- **SEO**: review meta and link tags, preview the search result and social shares, check common issues, explore JSON-LD and microdata, and test robots.txt. Includes links to Google's Rich Results Test, the Schema Markup Validator, PageSpeed Insights and a Social Meta Checker.

[Unreleased]: https://github.com/igunter/develobar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/igunter/develobar/releases/tag/v0.1.0
