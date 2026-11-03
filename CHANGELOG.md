# Changelog

All notable changes to testbook are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).
The version shown in the app (⋯ menu) and `APP_VERSION` in `testbook.html` must match the newest released version below; a test checks it.

## [Unreleased]

### Security

- An imported file could list the same board item twice and change only its type to a summary card. Text formatting that had not been checked as numbers then reached the page as HTML. Summary cards now convert their values to numbers when drawn, and the checks on an item's values no longer depend on its type.

### Fixed

- A non-text value in a file's image data or issue link template stopped the page from drawing. These values are now discarded on import.

## [0.2.2] - 2026-11-02

### Fixed

- With an issue link template set, text containing an apostrophe (`don't`) showed a broken link to issue 39. A template with both `{n}` and `{key}` could also rewrite the links it had just made.
- Deleting a row or a sheet left the evidence images and files in the saved file, so it never got smaller. They are now removed on save, and undo brings them back. Files saved earlier keep what they already contain.
- "Open comments" in the summary counted comments on deleted rows.
- When a merge kept a deleted row because someone had changed it, its evidence now stays with it.
- When a merge found rows or board items still in use on a deleted sheet, the rows stayed but the sheet did not, so nobody could see them. The sheet now stays, with what was deleted along with it, and the conflict list asks what to do.
- After closing the "Unsaved changes" prompt with Esc, the draft could not be applied later. "⋯ → Unsaved drafts…" now offers "Apply" for it until the test is edited.
- A draft was not offered when a file was picked with "Open", only when the page itself was opened.
- Opening a draft from the list rewrote it a few seconds later even without an edit, which changed its time.
- Ctrl+S, Ctrl+F, Ctrl+M and Ctrl+H still acted behind an open dialog, and could stack a second one. The conflict list left the focus on the table behind it, so keys could change the table. It now takes the focus and closes with Esc.
- The table jumped 40 px narrower while dragging a column edge.
- Alt+↑/↓ moved rows while the table was sorted, unlike dragging.
- Replace counted cells where the text spans a formatting boundary, though nothing was replaced.
- The table of contents and "Go there" in the conflict list did not reach rows hidden by a column filter or a folded group.

### Security

- Deleted board items in an imported file skipped the checks on their values. If a merge brought such an item back, those values could reach the page as HTML. They are now checked like any other item.
- A conflict entry written into an imported file could put unchecked values on a board item, a sheet or a run when "Use their value" was pressed, and those values could reach the page as HTML. The value now goes through the same checks as opening a file, and a value that fails is not used.
- A crafted field name in an imported file could become part of a conflict's ID and reach the page as HTML when the conflict list was opened. Such fields no longer create conflicts, and the ID is escaped when drawn.
- An imported table with no cells, or text with malformed formatting, could stop the board from drawing. They are now repaired on import.

## [0.2.1] - 2026-11-02

### Fixed

- Only the newest unsaved draft could be opened, older ones could not be reached, and no draft could be deleted before it expired. The prompt shown when you open an empty page is now a list of all the drafts in the browser, newest first, with "Open" and "Delete" for each, and "⋯ → Unsaved drafts…" shows the same list at any time. Deleting asks for confirmation.
- When a test with a draft was reopened, pressing Esc or clicking outside the "Unsaved changes" prompt deleted the draft without asking. Now only "Discard" deletes it. Otherwise the draft stays and the prompt comes back the next time the test is opened, unless the test was edited or saved first.
- In dialogs, Enter always confirmed, even with the focus on "Cancel", so it could run a delete. Enter now presses the button that has the focus, and does nothing when the focus has left the dialog.

## [0.2.0] - 2026-11-01

### Added

- "⋯ → How to use (GitHub)" opens the README, so people who only received a test file can find the guide.
- In browsers that cannot overwrite files, the top bar says so before the first save.

### Changed

- The README explains how to start a test file, how several people start from the same file, how to move a file to a new version, and lists the keys in one place.
- When someone saves a test file they received for the first time, the save dialog suggests the name of the file they opened (not a name made from the title), and the notice before it names that file, so picking the file to overwrite is easier.
- When another test file is imported with its sheets, runs with the same name (such as "Run 1") are treated as the same run, so its results and evidence show up under the existing run instead of a second "Run 1".

### Security

- Data from a test file someone else made (imported with "Import", dropped on a free sheet, or pulled from a shared folder) can no longer run script in your `testbook.html`: the issue link template is only used when it starts with `http://` or `https://` and is escaped; image and file contents are shown only when they are base64 data URLs; IDs, element types, colors, coordinates, text styles, result values and metric numbers are checked when a file is read, and values of the wrong form are dropped. Elements pasted on a board go through the same check.
- Black and white masks and numbered markers keep their fill when printed or saved as PDF, even when the browser's "Background graphics" option is off; before, a mask could print as an empty frame with the screenshot visible under it.

### Fixed

- After the browser was restarted, the top bar said "autosaving soon" although autosave waits until overwriting the file is allowed. It now says "save with Ctrl+S".
- In English, the comment box placeholder was cut off at the quotation marks, and the "Sorted" button in the toolbar showed the Japanese name of a default column.
- A title containing `$&` or `$'` broke the `<title>` of the saved file.
- An image whose base64 data is broken no longer stops the whole board from drawing; an unknown result value counts as "not run" in the summary, as it already showed in the table.
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

[Unreleased]: https://github.com/gyuro-dev/testbook-html/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/gyuro-dev/testbook-html/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/gyuro-dev/testbook-html/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/gyuro-dev/testbook-html/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/gyuro-dev/testbook-html/releases/tag/v0.1.0
