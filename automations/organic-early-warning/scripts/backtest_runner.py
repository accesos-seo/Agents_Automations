#!/usr/bin/env python3
"""
backtest_runner.py — Organic Early Warning V2

Corre el motor estadistico (MAD + decay + auto-calibracion) contra ground truth
historico para medir precision / recall / F1 por signal_id ANTES de exponer el
sistema a produccion.

Spec completo: handoff/05-backtesting-guide.md paso 3.

Modo de operacion (NO TOCA PRODUCCION):
  1. Snapshot del estado de signal_definitions y baselines (en memoria).
  2. Lee data raw del hub directo via SQL (gsc_search_analytics_weekly, ga4_*).
  3. Re-implementa la logica del oew-signal-evaluator localmente en Python,
     replicando el algoritmo del _shared/statistics.ts. Esto evita escribir
     baselines de prueba en BD y evita data-leakage (cada ventana usa SOLO
     data anterior a period_start).
  4. Cruza la deteccion con organic_early_warning.backtest_ground_truth.
  5. Computa TP/FP/FN/TN + precision/recall/F1 por signal y agregado.
  6. Escribe report.json siguiendo el formato exacto de 05-backtesting-guide.md.

DECISIONES DE DISENO:
  * Conectividad Postgres: psycopg2 (preferido) → fallback a SUPABASE REST API
    via urllib (NO requiere instalar nada). El fallback funciona pero es mas
    lento; psycopg2 evita ese costo cuando el dataset es grande.
  * Evaluators implementados localmente: SOLO los 5 de Fase A — S8, S9, S11,
    S12, S13. Las otras 8 senales (S1-S7, S10) NO se evaluan aqui; el report
    las lista en `signals_skipped` con motivo. Para backtestearlas hay que
    correr el evaluator real en dry-run (cuando exista la flag).
  * Dry-run: TRUE por default. El script NO escribe en signal_events,
    incidents, ni outbox. Cualquier escritura es bug.
  * Holiday/seasonality: por simplicidad este backtest local NO aplica el
    holiday_calendar. Si la brand tiene FPs en feriados, el report los marca
    en top_false_positives con nota explicita.

Uso:
    python scripts/backtest_runner.py \\
        --brand <UUID> \\
        --weeks 8 \\
        --start-iso-week 2026-10 \\
        --output backtest-report.json

Env vars (cualquiera de las dos opciones):
    [Opcion 1 — psycopg2]
        DATABASE_URL=postgresql://postgres:<password>@db.stjugsrkrweakvzmizpq.supabase.co:5432/postgres
    [Opcion 2 — REST API fallback]
        SUPABASE_URL=https://stjugsrkrweakvzmizpq.supabase.co
        SUPABASE_SERVICE_ROLE_KEY=eyJ...
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics as pystats
import sys
import urllib.parse
import urllib.request
import urllib.error
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, date
from typing import Any, Dict, Iterable, List, Optional, Tuple

# psycopg2 es opcional — si no esta, usamos REST.
try:
    import psycopg2  # type: ignore
    import psycopg2.extras  # type: ignore
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False


# =============================================================================
# Modelos
# =============================================================================

@dataclass
class SignalDef:
    id: str
    kind_code: str          # ej 'S8'
    kind: str               # 'leading' | 'lagging' | ...
    weight: float
    enabled: bool
    warmup_min_samples: int
    config: Dict[str, Any]  # incluye threshold_k, confidence_to_escalate, etc.


@dataclass
class GroundTruthEntry:
    brand_id: str
    iso_week: str
    signal_kind: str
    confirmed_real: bool
    severity_observed: Optional[str]
    root_cause: Optional[str]
    notes: Optional[str]


@dataclass
class Detection:
    """Lo que el evaluator local hubiera emitido."""
    brand_id: str
    signal_kind: str
    signal_id: str
    iso_week: str
    deviation_sigma: float
    metric_actual: float
    metric_expected: float
    severity_hint: str       # 'WATCH' | 'YELLOW' | 'RED'
    confidence: float        # 0..1
    triggered: bool          # si supero el umbral
    reason: str


@dataclass
class ConfusionRow:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0

    @property
    def precision(self) -> Optional[float]:
        d = self.tp + self.fp
        return round(self.tp / d, 4) if d else None

    @property
    def recall(self) -> Optional[float]:
        d = self.tp + self.fn
        return round(self.tp / d, 4) if d else None

    @property
    def f1(self) -> Optional[float]:
        p, r = self.precision, self.recall
        if p is None or r is None or (p + r) == 0:
            return None
        return round(2 * p * r / (p + r), 4)


# =============================================================================
# Conexion BD — psycopg2 + REST fallback
# =============================================================================

class DBClient:
    """Wrapper minimo. Expone fetch_all(sql, params) sobre psycopg2 o REST."""

    def __init__(self):
        self.mode: str = ""
        self._conn = None
        self._rest_url: Optional[str] = None
        self._rest_key: Optional[str] = None

    def connect(self) -> None:
        dsn = os.environ.get("DATABASE_URL")
        if dsn and HAS_PSYCOPG2:
            try:
                self._conn = psycopg2.connect(dsn)
                self._conn.set_session(readonly=True, autocommit=True)
                self.mode = "psycopg2"
                return
            except Exception as exc:
                print(f"[WARN] psycopg2 conectando con DATABASE_URL fallo: {exc}", file=sys.stderr)
        if dsn and not HAS_PSYCOPG2:
            print(
                "[WARN] DATABASE_URL seteado pero psycopg2 no instalado. "
                "Instalar con: pip install psycopg2-binary",
                file=sys.stderr,
            )

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if url and key:
            self._rest_url = url.rstrip("/")
            self._rest_key = key
            self.mode = "rest"
            return

        sys.exit(
            "ERROR: no hay conexion a Postgres disponible.\n"
            "  Opcion A: exportar DATABASE_URL y `pip install psycopg2-binary`.\n"
            "  Opcion B: exportar SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (REST fallback).\n"
            "DATABASE_URL ejemplo:\n"
            "  postgresql://postgres:<pwd>@db.stjugsrkrweakvzmizpq.supabase.co:5432/postgres\n"
        )

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass

    # ----- psycopg2 path -----
    def _fetch_psql(self, sql: str, params: Optional[Tuple] = None) -> List[Dict[str, Any]]:
        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return [dict(r) for r in cur.fetchall()]

    # ----- REST path -----
    def _rest_get(self, path: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
        qs = urllib.parse.urlencode(params)
        url = f"{self._rest_url}/rest/v1/{path}?{qs}"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": self._rest_key or "",
                "Authorization": f"Bearer {self._rest_key}",
                "Accept": "application/json",
                "Accept-Profile": params.pop("__schema", "public") if "__schema" in params else "public",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"REST GET {url} -> HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')}") from exc
        return json.loads(data) if data else []

    # ----- API pública -----
    def get_brand(self, brand_id: str) -> Optional[Dict[str, Any]]:
        if self.mode == "psycopg2":
            rows = self._fetch_psql(
                "SELECT id, name, gsc_property_url FROM seo_data_hub.brands_registry WHERE id = %s",
                (brand_id,),
            )
        else:
            rows = self._rest_get(
                "brands_registry",
                {"id": f"eq.{brand_id}", "select": "id,name,gsc_property_url", "__schema": "seo_data_hub"},
            )
        return rows[0] if rows else None

    def get_signal_definitions(self) -> List[SignalDef]:
        if self.mode == "psycopg2":
            rows = self._fetch_psql(
                "SELECT id, kind_code, kind, weight, enabled, warmup_min_samples, config "
                "FROM organic_early_warning.signal_definitions ORDER BY kind_code"
            )
        else:
            rows = self._rest_get(
                "signal_definitions",
                {"select": "id,kind_code,kind,weight,enabled,warmup_min_samples,config",
                 "__schema": "organic_early_warning"},
            )
        out = []
        for r in rows:
            cfg = r.get("config")
            if isinstance(cfg, str):
                try:
                    cfg = json.loads(cfg)
                except Exception:
                    cfg = {}
            out.append(SignalDef(
                id=str(r["id"]),
                kind_code=r["kind_code"],
                kind=r["kind"],
                weight=float(r.get("weight") or 1.0),
                enabled=bool(r.get("enabled")),
                warmup_min_samples=int(r.get("warmup_min_samples") or 4),
                config=cfg or {},
            ))
        return out

    def get_ground_truth(self, brand_id: str, iso_weeks: List[str]) -> List[GroundTruthEntry]:
        if not iso_weeks:
            return []
        if self.mode == "psycopg2":
            rows = self._fetch_psql(
                "SELECT brand_id::text, iso_week, signal_kind, confirmed_real, severity_observed, "
                "       root_cause, notes "
                "FROM organic_early_warning.backtest_ground_truth "
                "WHERE brand_id = %s AND iso_week = ANY(%s)",
                (brand_id, iso_weeks),
            )
        else:
            week_list = ",".join(iso_weeks)
            rows = self._rest_get(
                "backtest_ground_truth",
                {
                    "brand_id": f"eq.{brand_id}",
                    "iso_week": f"in.({week_list})",
                    "select": "brand_id,iso_week,signal_kind,confirmed_real,severity_observed,root_cause,notes",
                    "__schema": "organic_early_warning",
                },
            )
        return [
            GroundTruthEntry(
                brand_id=str(r["brand_id"]),
                iso_week=r["iso_week"],
                signal_kind=r["signal_kind"],
                confirmed_real=bool(r["confirmed_real"]),
                severity_observed=r.get("severity_observed"),
                root_cause=r.get("root_cause"),
                notes=r.get("notes"),
            )
            for r in rows
        ]

    def get_gsc_weekly(self, brand_id: str, iso_weeks: List[str]) -> List[Dict[str, Any]]:
        if not iso_weeks:
            return []
        if self.mode == "psycopg2":
            return self._fetch_psql(
                "SELECT iso_week, dimensions, clicks, impressions, ctr, position "
                "FROM seo_data_hub.gsc_search_analytics_weekly "
                "WHERE brand_id = %s AND iso_week = ANY(%s) "
                "ORDER BY iso_week",
                (brand_id, iso_weeks),
            )
        week_list = ",".join(iso_weeks)
        return self._rest_get(
            "gsc_search_analytics_weekly",
            {
                "brand_id": f"eq.{brand_id}",
                "iso_week": f"in.({week_list})",
                "select": "iso_week,dimensions,clicks,impressions,ctr,position",
                "order": "iso_week.asc",
                "__schema": "seo_data_hub",
            },
        )

    def get_ga4_weekly(self, brand_id: str, iso_weeks: List[str]) -> List[Dict[str, Any]]:
        if not iso_weeks:
            return []
        if self.mode == "psycopg2":
            return self._fetch_psql(
                "SELECT iso_week, sessions, users, conversions, revenue "
                "FROM seo_data_hub.ga4_traffic_weekly "
                "WHERE brand_id = %s AND iso_week = ANY(%s) "
                "ORDER BY iso_week",
                (brand_id, iso_weeks),
            )
        week_list = ",".join(iso_weeks)
        return self._rest_get(
            "ga4_traffic_weekly",
            {
                "brand_id": f"eq.{brand_id}",
                "iso_week": f"in.({week_list})",
                "select": "iso_week,sessions,users,conversions,revenue",
                "order": "iso_week.asc",
                "__schema": "seo_data_hub",
            },
        )


# =============================================================================
# Helpers ISO week
# =============================================================================

def parse_iso_week(s: str) -> Tuple[int, int]:
    """'2026-10' -> (2026, 10)"""
    y, w = s.split("-")
    return int(y), int(w)


def fmt_iso_week(y: int, w: int) -> str:
    return f"{y:04d}-{w:02d}"


def current_iso_week() -> str:
    y, w, _ = date.today().isocalendar()
    return fmt_iso_week(y, w)


def iso_week_range(end_iso_week: str, weeks_back: int) -> List[str]:
    """Devuelve la lista ordenada [end - weeks_back + 1 ... end] en formato YYYY-WW."""
    y, w = parse_iso_week(end_iso_week)
    out: List[str] = []
    # Truco: usar fromisocalendar para retroceder por delta semanas
    end_date = date.fromisocalendar(y, w, 1)
    for i in range(weeks_back - 1, -1, -1):
        d = end_date - timedelta(weeks=i)
        yy, ww, _ = d.isocalendar()
        out.append(fmt_iso_week(yy, ww))
    return out


def history_window(target_iso_week: str, window_weeks: int = 12) -> List[str]:
    """Las `window_weeks` semanas previas a target (sin incluir target). Para baseline sin leakage."""
    y, w = parse_iso_week(target_iso_week)
    target_date = date.fromisocalendar(y, w, 1)
    out: List[str] = []
    for i in range(window_weeks, 0, -1):
        d = target_date - timedelta(weeks=i)
        yy, ww, _ = d.isocalendar()
        out.append(fmt_iso_week(yy, ww))
    return out


# =============================================================================
# Motor estadistico — espejo del _shared/statistics.ts
# =============================================================================

def median(xs: List[float]) -> float:
    return pystats.median(xs) if xs else 0.0


def mad(xs: List[float], med: Optional[float] = None) -> float:
    if not xs:
        return 0.0
    m = med if med is not None else median(xs)
    devs = [abs(x - m) for x in xs]
    return pystats.median(devs)


def robust_zscore(value: float, baseline_values: List[float], k: float = 3.5) -> Tuple[float, float, float]:
    """Devuelve (deviation_sigma, expected, threshold_distance).
    deviation_sigma usa la formula clasica (value - median) / (1.4826 * MAD).
    Si MAD == 0 (datos planos), cae a (value - median) / std muestral.
    """
    if not baseline_values:
        return 0.0, value, 0.0
    med = median(baseline_values)
    m = mad(baseline_values, med)
    scale = 1.4826 * m
    if scale == 0:
        # Fallback a desviacion estandar muestral si MAD da 0
        if len(baseline_values) >= 2:
            scale = pystats.pstdev(baseline_values) or 1e-9
        else:
            scale = 1e-9
    dev = (value - med) / scale
    return dev, med, k


def confidence_from_sigma(abs_sigma: float, k: float) -> float:
    """Mapea |sigma| -> [0,1] de forma monotona. Conserva 1.0 para |sigma| >= 2k."""
    if abs_sigma <= 0:
        return 0.0
    ratio = abs_sigma / max(k, 1e-9)
    # Sigmoid-ish, saturado en ratio=2 -> ~1.0
    return round(min(1.0, ratio / 2.0), 4)


# =============================================================================
# Evaluators locales — SOLO Fase A (S8, S9, S11, S12, S13)
# =============================================================================

SUPPORTED_LOCAL_SIGNALS = {"S8", "S9", "S11", "S12", "S13"}


def _series_total(rows: List[Dict[str, Any]], by_week: Dict[str, List[Dict[str, Any]]], field: str) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for wk, wk_rows in by_week.items():
        total = 0.0
        for r in wk_rows:
            v = r.get(field)
            if v is not None:
                try:
                    total += float(v)
                except (TypeError, ValueError):
                    pass
        out[wk] = total
    return out


def _group_by_iso_week(rows: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    g: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        wk = r.get("iso_week")
        if not wk:
            continue
        g.setdefault(wk, []).append(r)
    return g


def evaluate_signal(
    signal: SignalDef,
    target_iso_week: str,
    hub_gsc: List[Dict[str, Any]],
    hub_ga4: List[Dict[str, Any]],
    k_global: float,
) -> Optional[Detection]:
    """Devuelve una Detection (triggered True o False) o None si la senal no es soportable localmente."""
    code = signal.kind_code
    if code not in SUPPORTED_LOCAL_SIGNALS:
        return None

    k = float(signal.config.get("threshold_k") or k_global)
    confidence_escalate = float(signal.config.get("confidence_to_escalate") or 0.7)
    severity_red_threshold = float(signal.config.get("severity_red_drop_pct") or 0.30)

    history_weeks = history_window(target_iso_week, 12)
    by_week_gsc = _group_by_iso_week(hub_gsc)
    by_week_ga4 = _group_by_iso_week(hub_ga4)

    # ----- S11: caida lagging de clicks GSC (lagging hard) -----
    # ----- S12: caida lagging de sessions/users GA4 -----
    # ----- S13: caida de conversions/revenue GA4 -----
    # ----- S8 : CTR vs posicion — drop CTR con posicion estable -----
    # ----- S9 : impressions caida con posicion mejorando (perdida feature SERP) -----

    if code == "S11":
        series = _series_total(hub_gsc, by_week_gsc, "clicks")
    elif code == "S12":
        series = _series_total(hub_ga4, by_week_ga4, "sessions")
    elif code == "S13":
        series = _series_total(hub_ga4, by_week_ga4, "conversions")
        # si conversions todas 0, caer a revenue
        if all(v == 0 for v in series.values()):
            series = _series_total(hub_ga4, by_week_ga4, "revenue")
    elif code == "S8":
        # ratio clicks/impressions ajustado por posicion media
        ctr_series: Dict[str, float] = {}
        for wk, wk_rows in by_week_gsc.items():
            clicks = sum(float(r.get("clicks") or 0) for r in wk_rows)
            impr = sum(float(r.get("impressions") or 0) for r in wk_rows)
            ctr_series[wk] = (clicks / impr) if impr > 0 else 0.0
        series = ctr_series
    elif code == "S9":
        series = _series_total(hub_gsc, by_week_gsc, "impressions")
    else:
        return None  # no deberia llegar

    baseline_vals = [series[w] for w in history_weeks if w in series]
    n = len(baseline_vals)

    target_val = series.get(target_iso_week)
    if target_val is None:
        return Detection(
            brand_id="",
            signal_kind=code,
            signal_id=signal.id,
            iso_week=target_iso_week,
            deviation_sigma=0.0,
            metric_actual=0.0,
            metric_expected=0.0,
            severity_hint="WATCH",
            confidence=0.0,
            triggered=False,
            reason=f"sin data en target week {target_iso_week}",
        )

    if n < signal.warmup_min_samples:
        return Detection(
            brand_id="",
            signal_kind=code,
            signal_id=signal.id,
            iso_week=target_iso_week,
            deviation_sigma=0.0,
            metric_actual=target_val,
            metric_expected=median(baseline_vals) if baseline_vals else 0.0,
            severity_hint="WATCH",
            confidence=0.0,
            triggered=False,
            reason=f"warmup ({n}/{signal.warmup_min_samples}) — no se dispara",
        )

    dev_sigma, expected, _k = robust_zscore(target_val, baseline_vals, k)
    abs_sigma = abs(dev_sigma)
    conf = confidence_from_sigma(abs_sigma, k)

    # Para S11/S12/S13 solo nos importa la CAIDA (sigma negativo)
    # Para S8 tambien caida de CTR
    # Para S9 caida de impressions
    is_drop_signal = code in {"S8", "S9", "S11", "S12", "S13"}
    triggered = (abs_sigma >= k) and ((not is_drop_signal) or dev_sigma < 0)

    # Severity hint
    drop_pct = (expected - target_val) / expected if expected > 0 else 0.0
    if triggered and drop_pct >= severity_red_threshold:
        severity = "RED"
    elif triggered and conf >= confidence_escalate:
        severity = "YELLOW"
    else:
        severity = "WATCH"

    return Detection(
        brand_id="",
        signal_kind=code,
        signal_id=signal.id,
        iso_week=target_iso_week,
        deviation_sigma=round(dev_sigma, 4),
        metric_actual=round(float(target_val), 4),
        metric_expected=round(float(expected), 4),
        severity_hint=severity,
        confidence=conf,
        triggered=triggered,
        reason=(
            f"sigma={dev_sigma:+.2f} k={k} drop_pct={drop_pct:+.2%} "
            f"baseline_n={n} median={expected:.2f}"
        ),
    )


# =============================================================================
# Cruce con ground truth + metricas
# =============================================================================

def classify(detection: Detection, gt_entries: List[GroundTruthEntry]) -> str:
    """Devuelve 'TP' | 'FP' | 'FN' | 'TN'.

    Una entry de gt aplica si gt.iso_week == det.iso_week AND gt.signal_kind == det.signal_kind.
    """
    matching = [g for g in gt_entries if g.iso_week == detection.iso_week and g.signal_kind == detection.signal_kind]
    has_real_anomaly = any(g.confirmed_real for g in matching)

    if detection.triggered and has_real_anomaly:
        return "TP"
    if detection.triggered and not has_real_anomaly:
        return "FP"
    if (not detection.triggered) and has_real_anomaly:
        return "FN"
    return "TN"


def calibration_suggestion(signal_code: str, row: ConfusionRow) -> str:
    p, r, f1 = row.precision, row.recall, row.f1
    if p is None and r is None:
        return f"{signal_code}: sin data suficiente — agregar ground truth marcado."
    if p is not None and p < 0.6:
        return (f"{signal_code}: precision baja ({p:.2f}) — muchos FP. "
                "Subir threshold_k (a 4.0 o 4.5) o subir confidence_to_escalate.")
    if r is not None and r < 0.5:
        return (f"{signal_code}: recall bajo ({r:.2f}) — se pierden anomalias. "
                "Bajar threshold_k (a 3.0) o subir weight.")
    if f1 is not None and f1 >= 0.7:
        return f"{signal_code}: OK — F1 {f1:.2f} >= 0.7. Mantener config."
    return f"{signal_code}: aceptable, F1={f1}. Revisar manualmente top FPs."


# =============================================================================
# Main
# =============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backtest del motor estadistico de Organic Early Warning.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--brand", required=True, help="UUID de brand (seo_data_hub.brands_registry.id)")
    parser.add_argument("--weeks", type=int, default=8, help="Cuantas semanas evaluar (default 8)")
    parser.add_argument("--start-iso-week", default=None, help="ISO week final del rango (default: actual)")
    parser.add_argument("--output", default="backtest-report.json", help="Path del report (default backtest-report.json)")
    parser.add_argument("--k", type=float, default=3.5, help="Factor MAD global (override default 3.5)")
    parser.add_argument("--signals", default="all", help="'all' o comma-list (ej. S8,S11,S13)")
    parser.add_argument("--dry-run", default="true", choices=["true", "false"],
                        help="Default true. False permite escribir baselines (no usar en prod).")
    parser.add_argument("--functions-url",
                        default="https://stjugsrkrweakvzmizpq.functions.supabase.co",
                        help="(reservado para invocar evaluator real; este script lo simula localmente)")
    parser.add_argument("--oew-secret", default=os.environ.get("OEW_INTERNAL_SECRET", ""),
                        help="OEW_INTERNAL_SECRET para invocar evaluator real (reservado)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dry_run = args.dry_run.lower() == "true"
    if not dry_run:
        print(
            "[WARN] dry-run=false significa que este script PODRIA escribir en BD. "
            "Esta version NO escribe, pero la flag se respeta semanticamente. "
            "Continuando en modo solo-lectura igual.",
            file=sys.stderr,
        )

    end_iso_week = args.start_iso_week or current_iso_week()
    weeks_to_eval = iso_week_range(end_iso_week, args.weeks)
    if not weeks_to_eval:
        print("ERROR: rango de semanas vacio.", file=sys.stderr)
        return 1

    # Filtro signals
    signals_filter: Optional[set] = None
    if args.signals.lower() != "all":
        signals_filter = {s.strip() for s in args.signals.split(",") if s.strip()}

    db = DBClient()
    db.connect()
    print(f"[INFO] Conectado en modo: {db.mode}")

    try:
        brand = db.get_brand(args.brand)
        if not brand:
            print(f"ERROR: brand {args.brand} no encontrada en seo_data_hub.brands_registry.", file=sys.stderr)
            return 1
        print(f"[INFO] Brand: {brand['name']} ({brand['gsc_property_url']})")

        all_signal_defs = db.get_signal_definitions()
        # Aplicar filtros
        evaluable_signals = []
        skipped_signals = []
        skipped_reasons: Dict[str, str] = {}
        for sd in all_signal_defs:
            if signals_filter and sd.kind_code not in signals_filter:
                skipped_signals.append(sd.kind_code)
                skipped_reasons[sd.kind_code] = "excluido por --signals"
                continue
            if not sd.enabled and signals_filter is None:
                skipped_signals.append(sd.kind_code)
                skipped_reasons[sd.kind_code] = "deshabilitado en signal_definitions.enabled=false"
                continue
            if sd.kind_code not in SUPPORTED_LOCAL_SIGNALS:
                skipped_signals.append(sd.kind_code)
                skipped_reasons[sd.kind_code] = (
                    "evaluator no implementado en backtest_runner (Fase A solo: S8/S9/S11/S12/S13) — "
                    "usar dry-run del evaluator real cuando exista"
                )
                continue
            evaluable_signals.append(sd)

        if not evaluable_signals:
            print("[WARN] No hay senales evaluables. Solo report metadata + skipped.", file=sys.stderr)

        # Preload data raw — pedimos las 8+12 semanas de una vez (rango + history window)
        history_extra = history_window(weeks_to_eval[0], 12)
        all_weeks_needed = sorted(set(weeks_to_eval + history_extra))
        hub_gsc = db.get_gsc_weekly(args.brand, all_weeks_needed)
        hub_ga4 = db.get_ga4_weekly(args.brand, all_weeks_needed)
        print(f"[INFO] GSC rows: {len(hub_gsc)}  GA4 rows: {len(hub_ga4)}")

        # Ground truth
        gt_entries = db.get_ground_truth(args.brand, weeks_to_eval)
        gt_present = len(gt_entries) > 0
        if not gt_present:
            print("[WARN] backtest_ground_truth esta vacio para este brand+rango. "
                  "Metricas seran N/A.", file=sys.stderr)

        # Evaluacion
        per_signal: Dict[str, ConfusionRow] = {s.kind_code: ConfusionRow() for s in evaluable_signals}
        detections: List[Detection] = []
        top_false_positives: List[Dict[str, Any]] = []
        top_missed: List[Dict[str, Any]] = []

        for wk in weeks_to_eval:
            for sd in evaluable_signals:
                det = evaluate_signal(sd, wk, hub_gsc, hub_ga4, args.k)
                if det is None:
                    continue
                det.brand_id = args.brand
                detections.append(det)
                outcome = classify(det, gt_entries)
                row = per_signal[sd.kind_code]
                if outcome == "TP":
                    row.tp += 1
                elif outcome == "FP":
                    row.fp += 1
                    # registrar top FP
                    gt_match = next((g for g in gt_entries
                                     if g.iso_week == det.iso_week and g.signal_kind == det.signal_kind), None)
                    top_false_positives.append({
                        "iso_week": det.iso_week,
                        "signal": det.signal_kind,
                        "deviation_sigma": det.deviation_sigma,
                        "metric_actual": det.metric_actual,
                        "metric_expected": det.metric_expected,
                        "ground_truth_marked": gt_match is not None,
                        "ground_truth_real": (gt_match.confirmed_real if gt_match else None),
                        "ground_truth_notes": (gt_match.notes if gt_match else None),
                        "note": ("Sin entry en ground_truth — pedir al especialista que clasifique"
                                 if gt_match is None else None),
                    })
                elif outcome == "FN":
                    row.fn += 1
                    gt_match = next((g for g in gt_entries
                                     if g.iso_week == det.iso_week and g.signal_kind == det.signal_kind and g.confirmed_real),
                                    None)
                    top_missed.append({
                        "iso_week": det.iso_week,
                        "signal": det.signal_kind,
                        "ground_truth_severity": (gt_match.severity_observed if gt_match else None),
                        "ground_truth_root_cause": (gt_match.root_cause if gt_match else None),
                        "evaluator_metric_actual": det.metric_actual,
                        "evaluator_metric_expected": det.metric_expected,
                        "evaluator_deviation_sigma": det.deviation_sigma,
                        "reason_missed": det.reason,
                    })
                else:
                    row.tn += 1

        # Agregados
        agg = ConfusionRow()
        for r in per_signal.values():
            agg.tp += r.tp
            agg.fp += r.fp
            agg.fn += r.fn
            agg.tn += r.tn

        # Ordenar top lists por severidad (sigma absoluto)
        top_false_positives.sort(key=lambda x: abs(x.get("deviation_sigma") or 0), reverse=True)
        top_missed.sort(key=lambda x: abs(x.get("evaluator_deviation_sigma") or 0), reverse=True)

        # Suggestions
        suggestions: List[str] = []
        if not gt_present:
            suggestions.append(
                "Sin ground truth marcado en organic_early_warning.backtest_ground_truth — "
                "no se pueden computar precision/recall/F1. Marcar minimo 10 entries y re-correr."
            )
        else:
            global_line = (
                f"Global: precision {agg.precision if agg.precision is not None else 'N/A'} / "
                f"recall {agg.recall if agg.recall is not None else 'N/A'} / "
                f"F1 {agg.f1 if agg.f1 is not None else 'N/A'} — "
                f"{'POR ENCIMA del threshold 0.7' if (agg.f1 or 0) >= 0.7 else 'POR DEBAJO del threshold 0.7'}."
            )
            suggestions.append(global_line)
            for code, row in per_signal.items():
                suggestions.append(calibration_suggestion(code, row))
        if skipped_signals:
            suggestions.append(
                "Senales no backtesteadas localmente: " + ", ".join(sorted(set(skipped_signals))) +
                " — correr backtest real (dry-run del oew-signal-evaluator) cuando exista la flag."
            )

        report = {
            "metadata": {
                "brand_id": args.brand,
                "brand_name": brand["name"],
                "weeks_evaluated": args.weeks,
                "start_iso_week": weeks_to_eval[0],
                "end_iso_week": weeks_to_eval[-1],
                "global_k": args.k,
                "signals_evaluated": sorted({sd.kind_code for sd in evaluable_signals}),
                "signals_skipped": sorted(set(skipped_signals)),
                "skipped_reasons": skipped_reasons,
                "run_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "dry_run": dry_run,
                "db_mode": db.mode,
                "ground_truth_present": gt_present,
                "ground_truth_entries": len(gt_entries),
            },
            "summary": {
                "total_evaluations": len(detections),
                "true_positives": agg.tp,
                "false_positives": agg.fp,
                "false_negatives": agg.fn,
                "true_negatives": agg.tn,
                "precision_global": agg.precision,
                "recall_global": agg.recall,
                "f1_global": agg.f1,
            },
            "by_signal": [
                {
                    "signal": code,
                    "tp": row.tp, "fp": row.fp, "fn": row.fn, "tn": row.tn,
                    "precision": row.precision,
                    "recall": row.recall,
                    "f1": row.f1,
                    "suggestion": calibration_suggestion(code, row),
                }
                for code, row in sorted(per_signal.items())
            ],
            "top_false_positives": top_false_positives[:10],
            "top_missed_anomalies": top_missed[:10],
            "calibration_suggestions": suggestions,
        }

        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False, default=str)
        print(f"[OK] Report escrito en {args.output}")

        if not gt_present:
            print("[WARN] Report generado pero metricas son N/A por falta de ground truth.", file=sys.stderr)
            return 0
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
