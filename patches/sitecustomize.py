"""Fix two rendercv 2.8 markup bugs.

1. Flattened nested highlights. rendercv 2.8 half-ships nested sub-bullets:
   " - " inside a highlight string becomes an indented Markdown list item
   (process_highlights), and the design schema has entries.highlights.nested_bullet
   for it, but markdown_to_typst converts each line through python-markdown
   independently, which strips the leading indentation, so every sub-bullet
   renders as a flat top-level bullet. We wrap markdown_to_typst to put the
   indentation back.

2. Swallowed semicolons. "**93% accuracy**; deployed" becomes
   "#strong[93% accuracy]; deployed", and Typst reads a ";" right after a
   #command as the end of that expression, so the semicolon vanishes from the
   PDF. Found 2026-10-12 on the general resume. We escape a semicolon that opens
   the text following a converted element.

This module is loaded automatically (Python imports `sitecustomize` at startup)
because src/lib/render.ts prepends this directory to PYTHONPATH when it spawns
rendercv. A manual `rendercv render` outside the app does NOT get these fixes.

Re-test after any rendercv upgrade: a highlight containing " - " should render
an indented sub-bullet, and "**x**; y" should keep its semicolon. Remove a fix
once upstream has it; both are harmless if upstream fixes them first.
"""

import re
import sys

try:
    from rendercv.renderer.templater import markdown_parser as _mp
except Exception as exc:  # pragma: no cover - future rendercv refactor
    print(
        "patches/sitecustomize.py: could not patch rendercv (%s); "
        "nested sub-bullets will render flat" % exc,
        file=sys.stderr,
    )
else:
    _orig = _mp.markdown_to_typst
    _NESTED_ITEM = re.compile(r"^(\s+)(- .*)$")

    def _markdown_to_typst_keep_indent(markdown_string):
        # Indented list items are converted one by one with their indent
        # re-attached; every other run of lines is delegated unchanged so the
        # original's multi-line handling (admonition blocks) still applies.
        out = []
        buffer = []

        def flush():
            if buffer:
                out.append(_orig("\n".join(buffer)))
                buffer.clear()

        for line in markdown_string.split("\n"):
            match = _NESTED_ITEM.match(line)
            if match:
                flush()
                out.append(match.group(1) + _orig(match.group(2)))
            else:
                buffer.append(line)
        flush()
        return "\n".join(out)

    _mp.markdown_to_typst = _markdown_to_typst_keep_indent

    # Tail text after a converted element is escaped separately, so a leading
    # ";" here always sits directly after a #strong[...], #emph[...] or #link.
    _orig_escape = _mp.escape_typst_characters

    def _escape_keep_semicolon(string):
        escaped = _orig_escape(string)
        return "\\" + escaped if escaped.startswith(";") else escaped

    _mp.escape_typst_characters = _escape_keep_semicolon
