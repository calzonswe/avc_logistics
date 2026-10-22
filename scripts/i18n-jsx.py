#!/usr/bin/env python3
"""Replaces a literal JSX text with a translation call.

    replace_jsx_text(source, "Ny transportorder", "manager.orders.new")
    →  >Ny transportorder<   becomes   >{t('manager.orders.new')}<
"""
import re
import sys


def replace_jsx_text(source: str, text: str, key: str, count: int = 0) -> tuple[str, bool]:
    """Replace `>text<` (with optional whitespace) by >{t('key')}<."""
    pattern = re.compile(r">(\s*)" + re.escape(text) + r"(\s*)<")
    replaced, n = pattern.subn(lambda m: ">" + m.group(1) + "{t('" + key + "')}" + m.group(2) + "<", source)
    if n == 0:
        return source, False
    if count:
        # keep only the first `count` replacements (revert the rest)
        pass
    return replaced, True


def replace_jsx_texts(source: str, pairs: list[tuple[str, str]]) -> tuple[str, list[str]]:
    missing = []
    for text, key in pairs:
        source, ok = replace_jsx_text(source, text, key)
        if not ok:
            missing.append(text)
    return source, missing


def add_hook(source: str, function_name: str) -> str:
    """Adds `const { t } = useTranslation();` to a component (if it uses t(...))."""
    if 'useTranslation' not in source:
        return source
    pattern = re.compile(r"^(export )?function " + re.escape(function_name) + r"\(", re.M)
    m = pattern.search(source)
    if not m:
        return source
    # find the end of the signature
    i = source.index('(', m.start())
    depth = 0
    while i < len(source):
        if source[i] == '(':
            depth += 1
        elif source[i] == ')':
            depth -= 1
            if depth == 0:
                break
        i += 1
    # after the signature: skip the return type annotation (": { ... }") and
    # find the brace that opens the body (a brace followed by a newline)
    rest = source[i:]
    m2 = re.search(r"\{\n", rest)
    if not m2:
        return source
    j = i + m2.start()
    hook = "\n  const { t } = useTranslation();"
    # The hook must not already exist *in this function*.
    next_fn = source.find("\nfunction ", j)
    next_export_fn = source.find("\nexport function ", j)
    end = min([x for x in (next_fn, next_export_fn) if x > 0] or [len(source)])
    if hook in source[j:end]:
        return source
    return source[: j + 1] + hook + source[j + 1:]


if __name__ == '__main__':
    print('library module')
