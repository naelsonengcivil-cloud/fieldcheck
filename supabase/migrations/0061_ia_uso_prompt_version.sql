-- ============================================================
-- 0061 — Rastreabilidade de versão de prompt no metering de IA.
--
-- Não existe tabela `ai_prompts` (o prompt é constante no código da Edge
-- Function). Para rastrear qual versão de prompt produziu cada análise —
-- sem construir um subsistema de gestão de prompts — o metering guarda a
-- versão diretamente. Triagem de desvio passa a carimbar prompt_version=2
-- (catálogo normativo curado + profundidade obrigatória).
-- ============================================================

alter table public.ia_uso
  add column if not exists prompt_version integer;
