-- =============================================================================
-- FIX: Tabla brand_contracts + datos correctos para vera-bet y cassino-bet
-- Proyecto: Light_House (stjugsrkrweakvzmizpq)
-- Contexto: corrige el bug de cross-contamination donde n8n A aplica el
--           brand_contract de vera-bet a artículos de otras marcas.
-- Aplicar ANTES de importar el parche n8n fix-brand-contract-n8n-patch.json
-- =============================================================================

BEGIN;

-- Tabla central de contratos de marca.
-- n8n A hace: POST /rpc/get_brand_contract con { p_brand_slug: "vera-bet" }
-- y recibe el JSONB del contrato correcto para esa marca.
CREATE TABLE IF NOT EXISTS brand_contracts (
    brand_slug    TEXT PRIMARY KEY,
    brand_name    TEXT NOT NULL,
    data          JSONB NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE brand_contracts IS
    'Contratos de marca para el pipeline SEO. n8n A consulta esta tabla via RPC '
    'para inyectar el brand_contract correcto en brief_final, filtrado por brand_slug '
    'del content_item. Reemplaza el lookup incorrecto que causaba cross-contamination.';

-- Función RPC: n8n llama a esta función via REST para obtener el contrato por slug.
-- Si el slug no existe retorna NULL (n8n puede usar continueOnFail para manejar el caso).
CREATE OR REPLACE FUNCTION get_brand_contract(p_brand_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_contract JSONB;
BEGIN
    SELECT jsonb_build_object(
        'brand_slug',        brand_slug,
        'brand_name',        brand_name,
        'updated_at',        updated_at
    ) || data
    INTO v_contract
    FROM brand_contracts
    WHERE brand_slug = LOWER(TRIM(p_brand_slug));

    RETURN v_contract; -- NULL si el slug no existe
END;
$$;

COMMENT ON FUNCTION get_brand_contract IS
    'Devuelve el brand_contract completo (data + metadatos) para un brand_slug. '
    'Llamado desde n8n A via POST /rest/v1/rpc/get_brand_contract. '
    'Retorna NULL si el slug no está registrado.';

-- Índice para búsqueda por nombre (útil para auditorías)
CREATE INDEX IF NOT EXISTS idx_brand_contracts_name ON brand_contracts (brand_name);

-- =============================================================================
-- DATOS: brand_contract de vera-bet
-- Marca hermana de cassino-bet. Mismo mercado iGaming pt-BR.
-- Dominio: vera.bet.br
-- NOTA: revisar y actualizar la sección "branded_products" con los nombres
--       comerciales exactos usados en el sitio de VeraBet.
-- =============================================================================

INSERT INTO brand_contracts (brand_slug, brand_name, data) VALUES (
    'vera-bet',
    'VeraBet',
    '{
        "brand_domain": "vera.bet.br",
        "language": "pt",
        "market": "pt-BR",
        "tone": "confiante, direto, brasileiro, responsável",

        "branded_products": [
            {
                "name": "VeraBet Casino",
                "type": "casino_online",
                "description": "Plataforma de cassino online com centenas de jogos, incluindo slots, roleta e blackjack.",
                "mention_as": ["VeraBet Casino", "cassino VeraBet", "VeraBet"]
            },
            {
                "name": "VeraBet Apostas Esportivas",
                "type": "sports_betting",
                "description": "Casa de apostas com foco em futebol brasileiro, além de dezenas de modalidades esportivas.",
                "mention_as": ["VeraBet Apostas", "apostas VeraBet", "VeraBet"]
            },
            {
                "name": "VeraBet ao Vivo",
                "type": "live_casino",
                "description": "Sessões de cassino ao vivo com dealers reais transmitidos em tempo real.",
                "mention_as": ["VeraBet ao Vivo", "cassino ao vivo VeraBet"]
            },
            {
                "name": "VeraBet Slots",
                "type": "slots",
                "description": "Caça-níqueis e slots com jackpots progressivos e bônus de rodadas grátis.",
                "mention_as": ["VeraBet Slots", "caça-níqueis VeraBet", "slots VeraBet"]
            },
            {
                "name": "Pix VeraBet",
                "type": "payment_method",
                "description": "Depósitos e saques instantâneos via Pix, sem taxas adicionais.",
                "mention_as": ["Pix VeraBet", "Pix", "saque via Pix"]
            }
        ],

        "forbidden_competitors": [
            "Blaze", "Stake", "Betano", "1xBet", "F12Bet", "KTO",
            "Estrela Bet", "EstrelaBet", "Pixbet", "Sportingbet",
            "Superbet", "Novibet", "BetMGM", "BetBoom", "bet365",
            "Betnacional", "Aposta Ganha", "ApostaGanha"
        ],

        "permitted_terms": [
            {"term": "Pix", "context": "Método de pagamento do Banco Central — sempre permitido"},
            {"term": "stake", "context": "Minúsculo, sinônimo de monto apostado — permitido em uso técnico"},
            {"term": ".bet.br", "context": "Convenção regulatória brasileira — permitido"},
            {"term": "SPA/MF", "context": "Secretaria de Prêmios e Apostas — permitido"},
            {"term": "SIGAP", "context": "Sistema de Gestão de Apostas — permitido"}
        ],

        "writing_rules": [
            "Abrir sempre com um dado quantificável (ex: 'Mais de X jogadores usam VeraBet todo mês')",
            "Mínimo 3 menções ao nome VeraBet por artigo",
            "Mínimo 2 produtos próprios mencionados com contexto (não apenas no rodapé)",
            "CTA deve incluir o nome VeraBet e a palavra Pix",
            "Incluir disclaimer de jogo responsável em artigos sobre apostas e cassino",
            "Nunca usar o imperativo 'aposte' sozinho — acompanhar de contexto de responsabilidade",
            "Usar 'você' (informal) — nunca 'você(s)' formal ou 'o/a leitor'",
            "Português brasileiro (pt-BR) — sem influências de pt-PT"
        ],

        "cta_template": "Crie sua conta no VeraBet agora e faça seu primeiro depósito via Pix. Rápido, seguro e sem taxas.",

        "responsible_gambling_note": "Jogue com responsabilidade. O jogo pode causar dependência. Proibido para menores de 18 anos. Aposte apenas o que pode perder.",

        "forbidden_words_pt": [
            "concorrente", "rival", "versus", "comparado a", "diferente de",
            "melhor que [concorrente]", "pior que [concorrente]"
        ],

        "contract_version": "1.0.0",
        "source": "brand_contracts table — Light_House"
    }'::jsonb
) ON CONFLICT (brand_slug) DO UPDATE SET
    brand_name = EXCLUDED.brand_name,
    data       = EXCLUDED.data,
    updated_at = NOW();

-- =============================================================================
-- DATOS: brand_contract de cassino-bet
-- Marca hermana de vera-bet. Mismo mercado iGaming pt-BR.
-- Dominio: cassino.bet.br
-- Producto conocido: "Ratinho Sortudo" (verificado en D-003, 2026-05-16)
-- =============================================================================

INSERT INTO brand_contracts (brand_slug, brand_name, data) VALUES (
    'cassino-bet',
    'CassinoBet',
    '{
        "brand_domain": "cassino.bet.br",
        "language": "pt",
        "market": "pt-BR",
        "tone": "animado, popular, brasileiro, confiável",

        "branded_products": [
            {
                "name": "Ratinho Sortudo",
                "type": "branded_slot",
                "description": "Slot exclusivo do CassinoBet inspirado no personagem Ratinho, ícone da TV brasileira.",
                "mention_as": ["Ratinho Sortudo", "slot Ratinho Sortudo", "jogo do Ratinho"]
            },
            {
                "name": "CassinoBet Casino",
                "type": "casino_online",
                "description": "Plataforma de cassino online com slots, roleta, blackjack e jogos ao vivo.",
                "mention_as": ["CassinoBet Casino", "cassino CassinoBet", "CassinoBet"]
            },
            {
                "name": "CassinoBet Apostas",
                "type": "sports_betting",
                "description": "Casa de apostas esportivas com mercados de futebol, basquete e mais de 30 modalidades.",
                "mention_as": ["CassinoBet Apostas", "apostas CassinoBet", "CassinoBet"]
            },
            {
                "name": "CassinoBet ao Vivo",
                "type": "live_casino",
                "description": "Cassino ao vivo com dealers reais, roleta, baccarat e blackjack em streaming HD.",
                "mention_as": ["CassinoBet ao Vivo", "cassino ao vivo CassinoBet"]
            },
            {
                "name": "Pix CassinoBet",
                "type": "payment_method",
                "description": "Depósitos e saques instantâneos via Pix. Sem taxas. Disponível 24/7.",
                "mention_as": ["Pix CassinoBet", "Pix", "saque via Pix no CassinoBet"]
            }
        ],

        "forbidden_competitors": [
            "Blaze", "Stake", "Betano", "1xBet", "F12Bet", "KTO",
            "Estrela Bet", "EstrelaBet", "Pixbet", "Sportingbet",
            "Superbet", "Novibet", "BetMGM", "BetBoom", "bet365",
            "Betnacional", "Aposta Ganha", "ApostaGanha"
        ],

        "permitted_terms": [
            {"term": "Pix", "context": "Método de pagamento do Banco Central — sempre permitido"},
            {"term": "stake", "context": "Minúsculo, sinônimo de monto apostado — permitido em uso técnico"},
            {"term": ".bet.br", "context": "Convenção regulatória brasileira — permitido"},
            {"term": "SPA/MF", "context": "Secretaria de Prêmios e Apostas — permitido"},
            {"term": "SIGAP", "context": "Sistema de Gestão de Apostas — permitido"}
        ],

        "writing_rules": [
            "Abrir sempre com um dado quantificável (ex: 'O CassinoBet tem mais de X jogos disponíveis')",
            "Mínimo 3 menções ao nome CassinoBet por artigo",
            "Mínimo 2 produtos próprios mencionados com contexto (Ratinho Sortudo obrigatório quando relevante)",
            "CTA deve incluir o nome CassinoBet e a palavra Pix",
            "Incluir disclaimer de jogo responsável em artigos sobre apostas e cassino",
            "Tom animado e popular — referências à cultura brasileira são bem-vindas",
            "Usar 'você' (informal) — nunca formal",
            "Português brasileiro (pt-BR) — sem influências de pt-PT"
        ],

        "cta_template": "Cadastre-se no CassinoBet agora e jogue o Ratinho Sortudo com seu bônus de boas-vindas. Depósito via Pix em segundos.",

        "responsible_gambling_note": "Jogue com responsabilidade. O jogo pode causar dependência. Proibido para menores de 18 anos. Aposte apenas o que pode perder.",

        "forbidden_words_pt": [
            "concorrente", "rival", "versus", "comparado a", "diferente de",
            "melhor que [concorrente]", "pior que [concorrente]"
        ],

        "contract_version": "1.0.0",
        "source": "brand_contracts table — Light_House"
    }'::jsonb
) ON CONFLICT (brand_slug) DO UPDATE SET
    brand_name = EXCLUDED.brand_name,
    data       = EXCLUDED.data,
    updated_at = NOW();

COMMIT;

-- =============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- =============================================================================

-- Confirmar que los 2 contratos están cargados:
-- SELECT brand_slug, brand_name, updated_at FROM brand_contracts;

-- Probar la función RPC:
-- SELECT get_brand_contract('vera-bet');
-- SELECT get_brand_contract('cassino-bet');

-- Confirmar que la función retorna NULL para slug desconocido:
-- SELECT get_brand_contract('doug-construction');  -- debe retornar NULL

-- =============================================================================
-- NOTA: Marcas pendientes de definir
-- Las siguientes marcas aún no tienen brand_contract definido.
-- Sus artículos deben usar un contrato genérico hasta que se completen.
-- armor-corp, doug-construction, educa-college-prep, floty, holisteek,
-- leasy, vozy-ai
-- =============================================================================
