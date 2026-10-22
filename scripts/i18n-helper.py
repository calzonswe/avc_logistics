#!/usr/bin/env python3
"""Helper: add `useTranslation` to the components of a page and apply string
replacements (JSX text -> {t('key')})."""
import re
import sys


def add_hook(source: str, function_names: list[str]) -> str:
    """Insert `const { t } = useTranslation();` after the signature of each
    function (the parameter list may span several lines)."""
    lines = source.split('\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = re.match(r"^(export )?function (\w+)\(\)\s*\{$", line)
        if m and m.group(2) in function_names:
            out.append('  const { t } = useTranslation();')
            i += 1
            continue
        m = re.match(r"^(export )?function (\w+)\(", line)
        if m and m.group(2) in function_names and not line.rstrip().endswith(') {'):
            # A one-line signature: the whole parameter list is on this line.
            out.append('  const { t } = useTranslation();')
            i += 1
            continue
        m = re.match(r"^(export )?function (\w+)\(\{$", line)
        if m and m.group(2) in function_names:
            j = i + 1
            while j < len(lines) and not lines[j].rstrip().endswith(') {'):
                out.append(lines[j])
                j += 1
            if j < len(lines):
                out.append(lines[j])
                out.append('  const { t } = useTranslation();')
            i = j + 1
            continue
        i += 1
    return '\n'.join(out)


def add_import(source: str, import_line: str) -> str:
    if import_line in source:
        return source
    # add after the last import
    matches = list(re.finditer(r"^import .*?;$", source, re.M))
    if not matches:
        return source
    last = matches[-1]
    return source[: last.end()] + "\n" + import_line + source[last.end():]


def apply_pairs(source: str, pairs: list[tuple[str, str]]) -> tuple[str, list[str]]:
    missing = []
    for old, new in pairs:
        if old not in source:
            missing.append(old[:70])
            continue
        source = source.replace(old, new)
    return source, missing
