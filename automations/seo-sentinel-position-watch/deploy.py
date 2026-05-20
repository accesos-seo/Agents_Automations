#!/usr/bin/env python3
"""
deploy.py — seo_sentinel
Desplegar las 7 edge functions al proyecto Light_House.

Uso:
    python deploy.py            # despliega todas
    python deploy.py orchestrator gsc-ingestor   # despliega solo las indicadas

Requisitos:
    - Supabase CLI instalado (npm install -g supabase)
    - Deno instalado
    - .env configurado (ver .env.example)
    - SUPABASE_ACCESS_TOKEN exportado o en .env
"""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PROJECT_REF_DEFAULT = "stjugsrkrweakvzmizpq"  # Light_House
ROOT = Path(__file__).parent
FUNCTIONS_DIR = ROOT / "02-edge-functions"
LOG_FILE = ROOT / "deploy-log.txt"

EDGE_FUNCTIONS = [
    "seo-sentinel-orchestrator",
    "seo-sentinel-gsc-ingestor",
    "seo-sentinel-ga4-ingestor",
    "seo-sentinel-analyst",
    "seo-sentinel-detective",
    "seo-sentinel-dispatcher",
    "seo-sentinel-outbox-worker",
]

# Alias cortos para deploy parcial: `python deploy.py orchestrator`
SHORT_ALIASES = {fn.replace("seo-sentinel-", ""): fn for fn in EDGE_FUNCTIONS}


def log(message: str, level: str = "INFO"):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {message}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        if (ROOT / ".env.example").exists():
            log(".env no encontrado. Copia .env.example a .env y completa los valores.", "ERROR")
        sys.exit(1)
    pending = []
    with open(env_path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if "PENDING_CONFIG" in value:
                pending.append(key)
            else:
                os.environ.setdefault(key, value)
    if pending:
        log(f".env tiene {len(pending)} PENDING_CONFIG: {', '.join(pending)}", "WARN")
    return pending


def check_requirements():
    missing = []
    if not shutil.which("supabase"):
        missing.append("supabase CLI (npm install -g supabase)")
    if not shutil.which("deno") and not os.environ.get("DENO_BIN"):
        missing.append("deno (https://deno.land/install)")
    if missing:
        for m in missing:
            log(f"  faltante: {m}", "ERROR")
        sys.exit(1)
    log("Dependencias OK (supabase CLI + deno)")


def project_ref() -> str:
    return os.environ.get("SUPABASE_PROJECT_REF", PROJECT_REF_DEFAULT)


def deploy_function(fn_name: str) -> str:
    fn_path = FUNCTIONS_DIR / fn_name
    if not fn_path.exists():
        log(f"  {fn_name}: directorio no existe en {fn_path}", "ERROR")
        return "MISSING"
    try:
        cmd = [
            "supabase", "functions", "deploy", fn_name,
            "--project-ref", project_ref(),
            "--no-verify-jwt",  # auth interno via x-internal-secret, no JWT de Supabase
        ]
        result = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode == 0:
            log(f"  {fn_name}: OK")
            return "DEPLOYED"
        else:
            err = (result.stderr or result.stdout or "").strip()
            log(f"  {fn_name}: FAIL -> {err[:200]}", "ERROR")
            return f"FAILED: {err[:200]}"
    except subprocess.TimeoutExpired:
        log(f"  {fn_name}: timeout", "ERROR")
        return "TIMEOUT"
    except Exception as exc:  # pragma: no cover
        log(f"  {fn_name}: exception {exc}", "ERROR")
        return f"EXCEPTION: {exc}"


def write_report(results: dict, pending: list):
    deployed = sum(1 for v in results.values() if v == "DEPLOYED")
    failed = sum(1 for v in results.values() if v not in ("DEPLOYED",))
    report = {
        "project": "seo_sentinel",
        "project_ref": project_ref(),
        "generated_at": datetime.now().isoformat(),
        "deploy_summary": {
            "functions_total": len(results),
            "functions_deployed": deployed,
            "functions_failed": failed,
        },
        "function_results": results,
        "pending_configs_env": pending,
        "next_steps": [
            "Verificar que los 10 secretos esten en Supabase Vault (ver SECRETS.md)",
            "Aplicar las 4 migraciones SQL en orden (Dashboard SQL Editor o MCP)",
            "Poblar seo_sentinel.brands y seo_sentinel.brand_team_routing",
            "Asegurarse de que la Service Account de GSC este agregada a cada propiedad",
            "Invitar al bot de Slack a todos los canales destino",
            "Disparar un run manual: curl -X POST .../seo-sentinel-orchestrator -H 'x-internal-secret: ...' -d '{\"trigger\":\"manual\"}'",
            "Validar con handoff/02-validation-checklist.md",
        ],
    }
    out = ROOT / "deploy-report.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    log(f"Report escrito en {out}")


def main():
    selected = sys.argv[1:] or list(SHORT_ALIASES.keys())
    fns_to_deploy = []
    for s in selected:
        if s in SHORT_ALIASES:
            fns_to_deploy.append(SHORT_ALIASES[s])
        elif s in EDGE_FUNCTIONS:
            fns_to_deploy.append(s)
        else:
            log(f"Function desconocida: {s}. Validas: {', '.join(SHORT_ALIASES.keys())}", "ERROR")
            sys.exit(1)

    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write(f"Deploy iniciado: {datetime.now().isoformat()}\n")
        f.write("=" * 60 + "\n")

    print()
    log("=" * 60)
    log(f"Deploy seo_sentinel -> proyecto {project_ref()}")
    log("=" * 60)

    pending = load_env()
    check_requirements()

    log(f"Desplegando {len(fns_to_deploy)} edge function(s)...")
    results = {fn: deploy_function(fn) for fn in fns_to_deploy}

    write_report(results, pending)

    log("=" * 60)
    deployed = sum(1 for v in results.values() if v == "DEPLOYED")
    log(f"Listo: {deployed}/{len(results)} desplegadas")
    log("Ver deploy-log.txt y deploy-report.json para detalles")
    log("=" * 60)


if __name__ == "__main__":
    main()
