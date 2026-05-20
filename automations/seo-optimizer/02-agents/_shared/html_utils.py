"""HTML parsing utilities + multilingual lemmatization.

Used by:
  - article_ingestor: parse fetched HTML into structured components
  - analyst (semantic_coverage): check whether a query appears in article text
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import snowballstemmer
from bs4 import BeautifulSoup, Tag


# --- Per-language stemmer registry ------------------------------------------

_STEMMERS: dict[str, snowballstemmer.RussianStemmer] = {}

LANG_MAP = {
    "es": "spanish",
    "en": "english",
    "pt": "portuguese",
    "pt-br": "portuguese",
    "pt-BR": "portuguese",
}


def _stemmer_for(language: str | None):
    lang = (language or "es").lower()
    snowball_lang = LANG_MAP.get(lang, "spanish")
    if snowball_lang not in _STEMMERS:
        _STEMMERS[snowball_lang] = snowballstemmer.stemmer(snowball_lang)
    return _STEMMERS[snowball_lang]


# --- HTML parsing -----------------------------------------------------------

@dataclass
class ParsedArticle:
    title_tag: str | None
    meta_description: str | None
    h1: str | None
    headings: list[dict]               # [{"level": 2, "text": "..."}]
    first_paragraph: str | None
    body_text: str                     # concatenated text of <p>, headings, alt-text
    word_count: int


def parse_html(html: str) -> ParsedArticle:
    """Parse an article HTML string into structured components.

    Robust to messy HTML. Uses lxml under the hood.
    """
    soup = BeautifulSoup(html or "", "lxml")

    # title tag
    title_tag = None
    if soup.title and soup.title.string:
        title_tag = soup.title.string.strip()

    # meta description
    meta_desc = None
    md = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    if md and isinstance(md, Tag) and md.get("content"):
        meta_desc = str(md["content"]).strip()

    # h1
    h1_tag = soup.find("h1")
    h1 = h1_tag.get_text(strip=True) if h1_tag else None

    # all headings h1..h6
    headings = []
    for lvl in range(1, 7):
        for h in soup.find_all(f"h{lvl}"):
            text = h.get_text(strip=True)
            if text:
                headings.append({"level": lvl, "text": text})

    # first <p>
    first_p = None
    p_tag = soup.find("p")
    if p_tag:
        first_p = p_tag.get_text(strip=True)

    # body text: paragraphs + headings + alt-text of images
    body_chunks: list[str] = []
    for p in soup.find_all("p"):
        body_chunks.append(p.get_text(separator=" ", strip=True))
    for h in headings:
        body_chunks.append(h["text"])
    for img in soup.find_all("img"):
        if isinstance(img, Tag):
            alt = img.get("alt")
            if alt:
                body_chunks.append(str(alt))
    body_text = " ".join(c for c in body_chunks if c)

    word_count = len(body_text.split())

    return ParsedArticle(
        title_tag=title_tag,
        meta_description=meta_desc,
        h1=h1,
        headings=headings,
        first_paragraph=first_p,
        body_text=body_text,
        word_count=word_count,
    )


# --- Query matching ---------------------------------------------------------

WORD_RE = re.compile(r"[\wáéíóúñçàèìòùâêîôûäëïöü]+", re.UNICODE | re.IGNORECASE)


def _tokenize(text: str) -> list[str]:
    return [m.group(0).lower() for m in WORD_RE.finditer(text or "")]


def _stem_set(text: str, language: str | None) -> set[str]:
    stemmer = _stemmer_for(language)
    return {stemmer.stemWord(tok) for tok in _tokenize(text)}


def query_appears_in(
    query: str,
    article_text: str,
    language: str | None = "es",
    *,
    threshold: float = 0.7,
) -> bool:
    """Check if a query is semantically present in article text.

    "Appears" = ≥threshold fraction of query tokens have their stem present in
    the article text's stemmed token set.

    Examples:
      query="comprar zapatos rojos" in "Los mejores zapatos rojos para comprar online"
      → all 3 tokens present after stemming → True

      query="mejor restaurante italiano" in "Guía de pastas en Roma"
      → 0/3 tokens present → False
    """
    query_tokens = _tokenize(query)
    if not query_tokens:
        return False

    stemmer = _stemmer_for(language)
    query_stems = [stemmer.stemWord(t) for t in query_tokens]
    article_stems = _stem_set(article_text, language)

    matches = sum(1 for q in query_stems if q in article_stems)
    return (matches / len(query_stems)) >= threshold


def find_missing_queries(
    queries: list[str],
    article: ParsedArticle,
    language: str | None = "es",
) -> list[str]:
    """Return queries that are NOT meaningfully covered by the article.

    Coverage = appears in (title_tag + meta_description + all headings + first_paragraph + alt-text).
    This is the "key SEO real estate" — body text alone is not enough.
    """
    key_text = " ".join(filter(None, [
        article.title_tag or "",
        article.meta_description or "",
        article.h1 or "",
        " ".join(h["text"] for h in article.headings),
        article.first_paragraph or "",
    ]))
    missing = []
    for q in queries:
        if not query_appears_in(q, key_text, language):
            missing.append(q)
    return missing
