# PATCH — `cassino-bet/brand-voice.md`

**Acción:** Reemplazar la sección actual `### Concorrentes proibidos` (subsección dentro de "4. Regras de redação", aprox. línea 100) por el bloque de abajo.

**Adicionalmente:** Mover esta sección al **inicio** del documento como **Regla #0 no negociable**, con un breve aviso de criticidad. Justo después del título `# Brand Voice — CassinoBet`, antes de "1. Identidade".

---

## Bloque a insertar como Regla #0 (al inicio del archivo, antes de "1. Identidade")

```markdown
## Regra #0 — Concorrentes proibidos (não negociável)

> Nenhum conteúdo deste manual de marca, brief, artigo, áudio, copy ou prompt interno pode mencionar, comparar, recomendar ou referenciar um concorrente. A regra não é discutível e não tem exceções editoriais sem autorização escrita de Produto, registrada em `referencias/politica-competidores-prohibidos.md` no repositório de governança.

**Política canônica:** `accesos-seo/Agents_Automations:referencias/politica-competidores-prohibidos.md`
**Lista operativa machine-readable:** `accesos-seo/Agents_Automations:automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml`
**Contrato cargado pelo pipeline:** `pipeline/competitors-policy.md`

Razão de ser: não fazemos publicidade gratuita à concorrência, não diluímos a autoridade do CassinoBet e não enviamos o leitor para fora do funil.

### Lista vigente — iGaming pt-BR (16 marcas)

Nenhuma das marcas abaixo, nem suas variantes de domínio ou nome composto, pode aparecer em conteúdo do CassinoBet:

Blaze · Stake · Betano · 1xBet · F12Bet · KTO · Estrela Bet · Pixbet · Sportingbet · Superbet · Novibet · BetMGM · BetBoom · bet365 · Betnacional · Aposta Ganha

Aliases bloqueados e termos permitidos (ex.: a palavra comum "stake" como sinônimo de "valor apostado" continua permitida; o método de pagamento "Pix" continua permitido) estão definidos em `competidores-prohibidos.yaml`. O `contract-validator-agent` aplica esta regra com severidade `high`, bloqueando o artigo em produção quando há coincidência.

### Como o pipeline aplica a regra

| Camada | O que faz |
|---|---|
| Brief (n8n A) | Filtra menções de concorrentes do `brief_data` antes de devolver. |
| Prompts do `content-writer` e `editor-agent` | Recebem este bloco inline e a instrução de jamais citar. |
| `contract-validator-agent` | Detecta menção residual e devolve para `final_repair`. Máx. 2 reintentos antes de `failed`. |
| `content_generation_alerts` | Toda menção residual gera alerta `forbidden_competitor_mentioned` com severidade `high`. |
```

---

## Bloque a reemplazar (sección actual "Concorrentes proibidos" en sección 4)

**Buscar:**

```markdown
#### Concorrentes proibidos

Não mencionar Blaze, Stake, Betano, 1xBet, F12Bet, KTO, Estrela Bet, Pixbet, Sportingbet e similares.
```

**Reemplazar por:**

```markdown
#### Concorrentes proibidos — referência rápida

Lista completa e operativa em `pipeline/competitors-policy.md` e na política canônica:
`accesos-seo/Agents_Automations:referencias/politica-competidores-prohibidos.md`.

Lista vigente (16 marcas iGaming pt-BR, não negociável):

Blaze · Stake · Betano · 1xBet · F12Bet · KTO · Estrela Bet · Pixbet · Sportingbet · Superbet · Novibet · BetMGM · BetBoom · bet365 · Betnacional · Aposta Ganha

A regra é descrita em detalhe na **Regra #0** no início deste documento.
```
