# Changelog

All notable changes to testbook are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).
The version shown in the app (⋯ menu) and `APP_VERSION` in `testbook.html` must match the newest released version below; a test checks it.

## [Unreleased]

### Added

- "⋯ → How to use (GitHub)" opens the README, so people who only received a test file can find the guide.
- In browsers that cannot overwrite files, the top bar says so before the first save.

### Changed

- The README explains how to start a test file, how several people start from the same file, how to move a file to a new version, and lists the keys in one place.
- When someone saves a test file they received for the first time, the save dialog suggests the name of the file they opened (not a name made from the title), and the notice before it names that file, so picking the file to overwrite is easier.

### Fixed

- After the browser was restarted, the top bar said "autosaving soon" although autosave waits until overwriting the file is allowed. It now says "save with Ctrl+S".
- Opening a copy of a test file (renamed, or the same name in another folder) no longer saves into the original file; the first save asks where to save.

## [0.1.0] - 2026-10-31

First public version.

### Added

- Test cases, results and evidence in one HTML file that works offline in Edge or Chrome, with no install and no external libraries.
- Case sheets with your own columns, results per run, evidence boards for screenshots and notes, and free sheets for descriptions and metrics.
- Merging copies from several people, also through a shared folder, without losing data; conflicts are kept and shown.
- Filters, search and replace, sorting, folding, result history and comments.
- Summary, printable report and CSV export.
- Japanese and English UI.
- Ready-made samples in `samples/`.
- Automated tests that run in headless Chrome or Edge on Windows, Linux and macOS.

[Unreleased]: https://github.com/gyuro-dev/testbook-html/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gyuro-dev/testbook-html/releases/tag/v0.1.0
