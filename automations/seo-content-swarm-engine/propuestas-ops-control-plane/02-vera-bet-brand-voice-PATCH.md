# PATCH — `vera-bet/brand-voice.md`

**Acción:** Añadir el bloque siguiente como **Regla #0 no negociable**, justo después del título principal del documento (`# VeraBet Brand Voice Guide`), antes de "## Core Identity".

El brand-voice actual de VeraBet **no contiene una sección explícita de competidores prohibidos**. Esta es la introducción de la regla en el documento.

---

## Bloque a insertar al inicio del archivo

```markdown
## Regra #0 — Concorrentes proibidos (não negociável)

> Nenhum conteúdo deste manual de marca, brief, artigo, áudio, copy ou prompt interno pode mencionar, comparar, recomendar ou referenciar um concorrente. A regra não é discutível e não tem exceções editoriais sem autorização escrita de Produto, registrada em `referencias/politica-competidores-prohibidos.md` no repositório de governança.

**Política canônica:** `accesos-seo/Agents_Automations:referencias/politica-competidores-prohibidos.md`
**Lista operativa machine-readable:** `accesos-seo/Agents_Automations:automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml`
**Contrato carregado pelo pipeline:** `pipeline/competitors-policy.md`

Razão de ser: não fazemos publicidade gratuita à concorrência, não diluímos a autoridade da VeraBet e não enviamos o leitor para fora do funil.

### Lista vigente — iGaming pt-BR (16 marcas)

Nenhuma das marcas abaixo, nem suas variantes de domínio ou nome composto, pode aparecer em conteúdo da VeraBet:

Blaze · Stake · Betano · 1xBet · F12Bet · KTO · Estrela Bet · Pixbet · Sportingbet · Superbet · Novibet · BetMGM · BetBoom · bet365 · Betnacional · Aposta Ganha

**Cuidado com falsos positivos permitidos:**

- A palavra comum **"stake"** (sinônimo de "valor apostado" ou "montante") continua permitida em uso técnico — ex.: "limite a stake por entrada". O bloqueio é aplicado apenas quando "Stake" aparece como nome próprio de marca (Stake.com, Stake Casino, Stake Brasil, etc.).
- O método de pagamento **"Pix"** continua permitido e é parte da identidade VeraBet. O bloqueio aplica-se apenas a "Pixbet" / "Pix.Bet" / "Pix Bet".
- Termos regulatórios como **".bet.br"**, **SPA/MF**, **SIGAP** continuam permitidos.

Aliases completos em `competidores-prohibidos.yaml`. O `contract-validator-agent` aplica esta regra com severidade `high`, bloqueando o artigo em produção quando há coincidência.

### Como o pipeline aplica a regra

| Camada | O que faz |
|---|---|
| Brief (n8n A) | Filtra menções de concorrentes do `brief_data` antes de devolver. Tipicamente o `contexto_investigacion` traz dados de mercado citando concorrentes — é exatamente essa contaminação que esta camada elimina. |
| Prompts do `content-writer` e `editor-agent` | Recebem este bloco inline e a instrução de jamais citar. |
| `contract-validator-agent` | Detecta menção residual e devolve para `final_repair`. Máx. 2 reintentos antes de `failed`. |
| `content_generation_alerts` | Toda menção residual gera alerta `forbidden_competitor_mentioned` com severidade `high`. |

---
```

**Nota para el desarrollador:** Tras aplicar este patch, considerar también:

1. Verificar que el resto del `brand-voice.md` de VeraBet (sección "Forbidden language", "Key Writing Rules") no contradiga la lista anterior. Si menciona alguno por nombre como ejemplo, reemplazar por "[concorrente sem nome]".
2. Confirmar que el `brand-context-loader` lee este archivo y lo inyecta como parte del `brand_context_bundle` que llega al writer.
