#!/usr/bin/env python3
"""
deploy.py — Organic Early Warning V2 (Data Hub + OEW)

Despliega las 12 edge functions al proyecto Light_House (stjugsrkrweakvzmizpq):
  - 5 del data hub  (hub-*)
  - 7 del oew       (oew-*)

Uso:
    python deploy.py                                  # todas (default)
    python deploy.py --target hub                     # solo las 5 hub-*
    python deploy.py --target oew                     # solo las 7 oew-*
    python deploy.py --target all --dry-run           # imprime comandos, no ejecuta
    python deploy.py --project-ref <ref>              # override project

Requisitos:
    - Supabase CLI instalado (npm install -g supabase) y `supabase login` ejecutado
    - Python 3.10+
    - SUPABASE_ACCESS_TOKEN exportado en el entorno (lo lee el CLI)

Patrón (igual al de V1 seo-sentinel/position-watch):
    El CLI de Supabase requiere ver `supabase/functions/<fn>/index.ts` relativo
    al cwd donde se invoca. Como las funciones viven en
    `00-data-hub/02-edge-functions/<fn>/` y `01-organic-early-warning/02-edge-functions/<fn>/`,
    antes de cada deploy se hace un stage temporal:
        supabase/functions/<fn>/        ← copia de la fn
        supabase/functions/_shared/     ← copia del _shared correspondiente
    Luego se corre `supabase functions deploy <fn> --project-ref <ref> --no-verify-jwt`.
    El staging se limpia al final (siempre, ok o error).

Estas funciones NO usan JWT de Supabase — auth interna via header `x-internal-secret`
(HUB_INTERNAL_SECRET o OEW_INTERNAL_SECRET). Por eso se pasa `--no-verify-jwt`.

Sin dependencias externas. Solo stdlib.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

PROJECT_REF_DEFAULT = "stjugsrkrweakvzmizpq"  # Light_House
ROOT = Path(__file__).resolve().parent

HUB_DIR = ROOT / "00-data-hub" / "02-edge-functions"
OEW_DIR = ROOT / "01-organic-early-warning" / "02-edge-functions"

# El CLI espera supabase/functions/<fn>; usamos staging al lado de deploy.py
STAGING_DIR = ROOT / "supabase" / "functions"

LOG_FILE = ROOT / "deploy-log.txt"
REPORT_FILE = ROOT / "deploy-report.json"

HUB_FUNCTIONS = [
    "hub-gsc-weekly",
    "hub-ga4-weekly",
    "hub-cwv-weekly",
    "hub-ahrefs-monthly",
    "hub-crawl-loader",
]

OEW_FUNCTIONS = [
    "oew-orchestrator",
    "oew-baseline-builder",
    "oew-signal-evaluator",
    "oew-incident-clusterer",
    "oew-detective",
    "oew-dispatcher",
    "oew-digest-weekly",
    # NOTA: si en algún momento se agrega oew-outbox-worker bajo
    # 01-organic-early-warning/02-edge-functions/, el código de discover_oew()
    # más abajo lo detecta automáticamente y lo agrega al target oew/all.
]

DEPLOY_TIMEOUT_SECONDS = 240

# ANSI colors (solo si TTY)
USE_COLOR = sys.stdout.isatty() and os.name != "nt"
GREEN = "\033[32m" if USE_COLOR else ""
RED = "\033[31m" if USE_COLOR else ""
YELLOW = "\033[33m" if USE_COLOR else ""
CYAN = "\033[36m" if USE_COLOR else ""
RESET = "\033[0m" if USE_COLOR else ""

# Marcadores ASCII portables (Windows console suele romper unicode)
OK = "[OK]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str, level: str = "INFO", color: str = "") -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(f"{color}{line}{RESET}" if color else line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def discover_oew() -> List[str]:
    """Devuelve la lista de oew-* a deployar.

    Toma OEW_FUNCTIONS base + cualquier carpeta extra en OEW_DIR que arranque
    con 'oew-' y tenga index.ts (ej. oew-outbox-worker si se agrega después).
    """
    fns = list(OEW_FUNCTIONS)
    if OEW_DIR.exists():
        for entry in sorted(OEW_DIR.iterdir()):
            if (
                entry.is_dir()
                and entry.name.startswith("oew-")
                and (entry / "index.ts").exists()
                and entry.name not in fns
            ):
                fns.append(entry.name)
                log(f"Descubierto oew extra: {entry.name}", color=CYAN)
    return fns


def function_source_dir(fn_name: str) -> Path | None:
    """Resuelve la carpeta de origen (hub o oew) para una función dada."""
    if fn_name.startswith("hub-"):
        return HUB_DIR / fn_name
    if fn_name.startswith("oew-"):
        return OEW_DIR / fn_name
    return None


def shared_source_dir(fn_name: str) -> Path | None:
    """Resuelve la carpeta _shared correspondiente."""
    if fn_name.startswith("hub-"):
        return HUB_DIR / "_shared"
    if fn_name.startswith("oew-"):
        return OEW_DIR / "_shared"
    return None


# ---------------------------------------------------------------------------
# Staging + deploy de una función
# ---------------------------------------------------------------------------

def stage_function(fn_name: str) -> Tuple[bool, str]:
    """Copia <fn> + _shared a supabase/functions/. Devuelve (ok, msg)."""
    src = function_source_dir(fn_name)
    shared_src = shared_source_dir(fn_name)
    if src is None or shared_src is None:
        return False, f"prefijo desconocido para {fn_name} (esperado hub- o oew-)"
    if not src.exists() or not (src / "index.ts").exists():
        return False, f"no existe index.ts en {src}"
    if not shared_src.exists():
        return False, f"no existe _shared en {shared_src}"

    # Limpiar staging previo (no destruir si el usuario tiene algo ahí —
    # asumimos que esta carpeta es exclusivamente nuestra)
    if STAGING_DIR.exists():
        shutil.rmtree(STAGING_DIR, ignore_errors=True)
    STAGING_DIR.mkdir(parents=True, exist_ok=True)

    # _shared
    shutil.copytree(shared_src, STAGING_DIR / "_shared")
    # función
    shutil.copytree(src, STAGING_DIR / fn_name)
    return True, "ok"


def clean_staging() -> None:
    parent = STAGING_DIR.parent  # supabase/
    if STAGING_DIR.exists():
        shutil.rmtree(STAGING_DIR, ignore_errors=True)
    # Si supabase/ quedó vacío, removerlo también (cosmético)
    try:
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass


def run_supabase_deploy(
    fn_name: str,
    project_ref: str,
    no_verify_jwt: bool,
    dry_run: bool,
) -> Tuple[str, str]:
    """Corre el supabase functions deploy. Devuelve (status, detail)."""
    cmd = [
        "supabase", "functions", "deploy", fn_name,
        "--project-ref", project_ref,
    ]
    if no_verify_jwt:
        cmd.append("--no-verify-jwt")

    if dry_run:
        log(f"  DRY-RUN: {' '.join(cmd)}  (cwd={ROOT})", color=YELLOW)
        return "DRY_RUN", " ".join(cmd)

    try:
        result = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=DEPLOY_TIMEOUT_SECONDS,
        )
    except FileNotFoundError:
        return "MISSING_CLI", "supabase CLI no encontrado en PATH"
    except subprocess.TimeoutExpired:
        return "TIMEOUT", f"timeout {DEPLOY_TIMEOUT_SECONDS}s"

    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()

    if stdout:
        for ln in stdout.splitlines():
            log(f"    | {ln}")
    if stderr:
        for ln in stderr.splitlines():
            log(f"    | {ln}", level="STDERR")

    if result.returncode == 0:
        return "DEPLOYED", "ok"
    # Recortar mensaje al final para el report
    err = stderr or stdout or "(sin output)"
    return "FAILED", err[:400]


def deploy_one(
    fn_name: str,
    project_ref: str,
    no_verify_jwt: bool,
    dry_run: bool,
) -> Tuple[str, str]:
    """Stage + deploy + cleanup para una función."""
    if dry_run:
        # En dry-run no copiamos archivos; solo simulamos.
        return run_supabase_deploy(fn_name, project_ref, no_verify_jwt, dry_run)

    staged, msg = stage_function(fn_name)
    if not staged:
        log(f"  {FAIL} {fn_name}: stage falló -> {msg}", level="ERROR", color=RED)
        return "STAGE_FAILED", msg
    try:
        return run_supabase_deploy(fn_name, project_ref, no_verify_jwt, dry_run)
    finally:
        clean_staging()


# ---------------------------------------------------------------------------
# Check requirements
# ---------------------------------------------------------------------------

def check_supabase_cli() -> bool:
    if shutil.which("supabase") is None:
        log("supabase CLI no encontrado en PATH.", level="ERROR", color=RED)
        log("Instalar con: npm install -g supabase (o scoop install supabase).", color=YELLOW)
        return False
    return True


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def write_report(
    project_ref: str,
    target: str,
    dry_run: bool,
    no_verify_jwt: bool,
    results: Dict[str, Tuple[str, str]],
) -> None:
    deployed = sum(1 for v in results.values() if v[0] in ("DEPLOYED", "DRY_RUN"))
    failed = sum(1 for v in results.values() if v[0] not in ("DEPLOYED", "DRY_RUN"))
    report = {
        "project": "organic-early-warning",
        "project_ref": project_ref,
        "target": target,
        "dry_run": dry_run,
        "no_verify_jwt": no_verify_jwt,
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "functions_total": len(results),
            "functions_deployed": deployed,
            "functions_failed": failed,
        },
        "function_results": {
            fn: {"status": status, "detail": detail}
            for fn, (status, detail) in results.items()
        },
        "next_steps": [
            "Verificar en Dashboard → Edge Functions que cada fn aparece Active.",
            "Confirmar que los 12 secretos esten en Vault (ver SECRETS.md).",
            "Validar pipeline E2E con handoff/02-validation-checklist.md.",
            "Activar crons cuando backtest este verde (handoff/05-backtesting-guide.md).",
        ],
    }
    try:
        with open(REPORT_FILE, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        log(f"Report en {REPORT_FILE}", color=CYAN)
    except OSError as exc:
        log(f"No pude escribir report: {exc}", level="WARN", color=YELLOW)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_target_list(target: str) -> List[str]:
    if target == "hub":
        return list(HUB_FUNCTIONS)
    if target == "oew":
        return discover_oew()
    # all
    return list(HUB_FUNCTIONS) + discover_oew()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deploya las 12 edge functions de Organic Early Warning V2 a Light_House.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--target",
        choices=["hub", "oew", "all"],
        default="all",
        help="Qué grupo deployar (default: all)",
    )
    parser.add_argument(
        "--project-ref",
        default=PROJECT_REF_DEFAULT,
        help=f"Project ref de Supabase (default: {PROJECT_REF_DEFAULT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo imprime los comandos. No copia archivos ni ejecuta supabase CLI.",
    )
    parser.add_argument(
        "--no-verify-jwt",
        dest="no_verify_jwt",
        action="store_true",
        default=True,
        help="(default true) Pasa --no-verify-jwt al CLI. Estas fns usan x-internal-secret.",
    )
    parser.add_argument(
        "--verify-jwt",
        dest="no_verify_jwt",
        action="store_false",
        help="Override: NO pasar --no-verify-jwt (NO RECOMENDADO para este proyecto).",
    )
    parser.add_argument(
        "--only",
        default="",
        help="Lista comma-separated de nombres exactos para sobreescribir el target (ej. hub-gsc-weekly,oew-dispatcher).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    # Reset log file por corrida
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write(f"Deploy iniciado: {datetime.now().isoformat()}\n")
            f.write("=" * 70 + "\n")
    except OSError:
        pass

    log("=" * 70)
    log(f"Deploy organic-early-warning -> proyecto {args.project_ref}")
    log(f"Target: {args.target}  dry-run: {args.dry_run}  no-verify-jwt: {args.no_verify_jwt}")
    log("=" * 70)

    if not args.dry_run and not check_supabase_cli():
        return 1

    if args.only.strip():
        fns_to_deploy = [s.strip() for s in args.only.split(",") if s.strip()]
        # validar que existan
        for fn in fns_to_deploy:
            if function_source_dir(fn) is None:
                log(f"--only inválido: {fn} no tiene prefijo hub- ni oew-", level="ERROR", color=RED)
                return 1
    else:
        fns_to_deploy = build_target_list(args.target)

    if not fns_to_deploy:
        log("No hay funciones para deployar.", level="WARN", color=YELLOW)
        return 1

    log(f"Funciones a deployar ({len(fns_to_deploy)}): {', '.join(fns_to_deploy)}")

    results: Dict[str, Tuple[str, str]] = {}
    for fn in fns_to_deploy:
        log("-" * 70)
        log(f"Deployando {fn}...", color=CYAN)
        status, detail = deploy_one(
            fn,
            project_ref=args.project_ref,
            no_verify_jwt=args.no_verify_jwt,
            dry_run=args.dry_run,
        )
        results[fn] = (status, detail)
        if status in ("DEPLOYED", "DRY_RUN"):
            log(f"  {OK} {fn} -> {status}", color=GREEN)
        else:
            log(f"  {FAIL} {fn} -> {status}: {detail[:200]}", level="ERROR", color=RED)

    log("=" * 70)
    ok_count = sum(1 for v in results.values() if v[0] in ("DEPLOYED", "DRY_RUN"))
    fail_count = len(results) - ok_count
    log(f"Resumen: {ok_count} ok, {fail_count} fail (de {len(results)})")

    write_report(
        project_ref=args.project_ref,
        target=args.target if not args.only else "custom",
        dry_run=args.dry_run,
        no_verify_jwt=args.no_verify_jwt,
        results=results,
    )

    log("=" * 70)
    if fail_count > 0:
        log("Algunas funciones fallaron. Ver deploy-log.txt y deploy-report.json.", level="ERROR", color=RED)
        return 1
    log("Todas las funciones se deployaron correctamente.", color=GREEN)
    return 0


if __name__ == "__main__":
    sys.exit(main())
