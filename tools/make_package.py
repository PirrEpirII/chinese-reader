#!/usr/bin/env python3
"""Turn a Chinese text into a study package for the Chinese Reader app.

Pipeline: jieba word splitting -> CC-CEDICT lookup (words the dictionary lacks are
re-split by longest match) -> pypinyin reading -> personal glossary applied on top.

Usage:
  pip install -r requirements.txt
  python make_package.py --text sample/nbs-2026-10-19.txt --id package-000001 \
      --title "前三季度经济运行总体平稳" --source-name "国家统计局" \
      --source-url "https://www.stats.gov.cn/sj/zxfb/202610/t20261019_1965618.html" \
      --date 2026-10-19 --glossary glossary.sample.json --out sample/package-000001.json

Input text: UTF-8, one paragraph per line. Output: package JSON, schema_version 1
(described in README.md). The script prints a report of what a human should review.
"""
import argparse, collections, datetime, gzip, json, os, re, sys, warnings

warnings.filterwarnings("ignore")
import jieba, pycccedict.cccedict
from pypinyin import pinyin, Style

jieba.setLogLevel(60)
HAN = re.compile(r"[一-鿿]")
MARKS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}


def mark(syl):
    """CC-CEDICT numbered syllable (hang2, lu:4) -> tone-marked (háng, lǜ)."""
    syl = syl.replace("u:", "ü").replace("v", "ü")
    m = re.match(r"^([A-Za-zü]+)([1-5])$", syl)
    if not m:
        return syl
    base, tone = m.group(1), int(m.group(2))
    if tone == 5:
        return base
    low = base.lower()
    if "a" in low:
        i = low.index("a")
    elif "e" in low:
        i = low.index("e")
    elif "ou" in low:
        i = low.index("o")
    else:
        i = max(j for j, c in enumerate(low) if c in "aeiouü")
    return base[:i] + MARKS[low[i]][tone - 1] + base[i + 1:]


def marked(p):
    return " ".join(mark(s) for s in p.split())


def norm(p):
    return p.lower().replace(" ", "")


def load_cedict(path=None):
    path = path or os.path.join(os.path.dirname(pycccedict.cccedict.__file__), "data", "cedict_1_0_ts_utf-8_mdbg.txt.gz")
    opener = gzip.open if path.endswith(".gz") else open
    d = collections.defaultdict(list)
    for line in opener(path, "rt", encoding="utf8"):
        m = re.match(r"(\S+) (\S+) \[(.*?)\] /(.*)/", line.strip())
        if m and not line.startswith("#"):
            d[m.group(2)].append((m.group(3), m.group(4).split("/")))
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--id", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--source-name", default="")
    ap.add_argument("--source-url", default="")
    ap.add_argument("--date", default="")
    ap.add_argument("--glossary")
    ap.add_argument("--cedict", help="path to a newer CC-CEDICT file (.txt or .gz); default is the 2023 copy bundled with pycccedict")
    a = ap.parse_args()

    D = load_cedict(a.cedict)
    G = json.load(open(a.glossary, encoding="utf8")) if a.glossary else {}
    terms, senses, readings = G.get("terms", {}), G.get("senses", {}), G.get("readings", [])
    for w in terms:
        jieba.add_word(w, freq=2000000)

    def resplit(w):
        out, i = [], 0
        while i < len(w):
            for n in range(min(len(w) - i, 6), 0, -1):
                if w[i:i + n] in D or w[i:i + n] in terms or n == 1:
                    out.append(w[i:i + n]); i += n; break
        return out

    def entries(w, first=None):
        ents = [{"pinyin": marked(p), "defs": [x for x in defs if not x.startswith("CL:")][:6]}
                for p, defs in D.get(w, []) if not re.match(r"(old )?variant of", defs[0])]
        # Surname and abbreviation entries come first in CC-CEDICT but are rarely
        # the sense a reader needs, so they go last; the context reading goes first.
        minor = lambda e: bool(e["defs"]) and e["defs"][0].startswith(("surname ", "abbr. for ", "Japanese variant"))
        ents.sort(key=lambda e: ((norm(e["pinyin"]) != norm(first)) if first else False, minor(e)))
        return ents

    paragraphs, lex = [], {}
    report = {"resplit": [], "many_readings": [], "no_entry": [], "glossary_used": []}
    for line in open(a.text, encoding="utf8").read().strip().split("\n"):
        toks = []
        for w in jieba.cut(line.strip()):
            if not HAN.search(w):
                toks.append({"t": w}); continue
            parts = [w] if (w in D or w in terms) else resplit(w)
            if len(parts) > 1:
                report["resplit"].append(f"{w} -> {' + '.join(parts)}")
            for p in parts:
                tok = {"t": p, "w": 1}
                rule = next((r for r in readings if r["word"] == p and any(t["t"] == r["after"] for t in toks[-r.get("window", 8):])), None)
                if rule:
                    key = f"{p}#{rule['cedict']}"
                    tok["k"] = key
                    lex.setdefault(key, {"pinyin": rule["pinyin"], "origin": "glossary", "note": rule.get("note", ""), "entries": entries(p, rule["pinyin"])})
                    report["glossary_used"].append(key)
                elif p not in lex:
                    if p in terms:
                        t = terms[p]
                        lex[p] = {"pinyin": t["pinyin"], "origin": "glossary", "note": t.get("note", ""), "entries": [{"pinyin": t["pinyin"], "defs": [t["meaning"]]}] + entries(p)}
                        report["glossary_used"].append(p)
                    else:
                        ctx = " ".join(x[0] for x in pinyin(p, style=Style.TONE))
                        ents = entries(p, ctx)
                        if not ents:
                            report["no_entry"].append(p)
                        if len({norm(e["pinyin"]) for e in ents}) > 1:
                            report["many_readings"].append(f"{p}: chose {ctx}; dictionary has {sorted({e['pinyin'] for e in ents})}")
                        py = ctx if (not ents or any(norm(e["pinyin"]) == norm(ctx) for e in ents)) else ents[0]["pinyin"]
                        lex[p] = {"pinyin": py, "origin": "dictionary", "entries": ents}
                        if p in senses:
                            lex[p]["entries"].insert(0, {"pinyin": py, "defs": [senses[p]]})
                            lex[p]["origin"] = "glossary"
                            report["glossary_used"].append(p)
                toks.append(tok)
        paragraphs.append(toks)

    pkg = {
        "schema_version": 1,
        "package_id": a.id,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "article": {"id": a.id.replace("package", "article"), "title": a.title, "source_name": a.source_name, "source_url": a.source_url, "date": a.date},
        "paragraphs": paragraphs,
        "lexicon": lex,
    }
    json.dump(pkg, open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    words = sum(1 for p in paragraphs for t in p if t.get("w"))
    print(f"Wrote {a.out}: {len(paragraphs)} paragraphs, {words} word tokens, {len(lex)} lexicon entries.")
    print("\nREVIEW BEFORE USE (a human or a careful agent must check these):")
    for k in ("resplit", "many_readings", "no_entry", "glossary_used"):
        print(f"\n[{k}] {len(report[k])}")
        for x in sorted(set(report[k])):
            print("  ", x)


if __name__ == "__main__":
    main()
