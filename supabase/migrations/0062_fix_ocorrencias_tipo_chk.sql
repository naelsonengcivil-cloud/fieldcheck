-- ============================================================
-- 0062 — Correção: reafirma o CHECK de `ocorrencias.tipo` com os tipos da
-- BASE da Pirâmide de Bird (desvio avulso — Marco M).
--
-- Causa raiz: a 0059 foi aplicada parcialmente em produção; o CHECK de
-- `tipo` ficou com os 3 valores originais (dano/acidentes), então inserir
-- 'ato_inseguro'|'condicao_insegura'|'quase_acidente' era rejeitado e o
-- desvio ficava preso na fila de sincronização. Idempotente: seguro rodar
-- mesmo se o CHECK já estiver correto.
-- ============================================================

alter table public.ocorrencias drop constraint if exists ocorrencias_tipo_chk;
alter table public.ocorrencias add constraint ocorrencias_tipo_chk
  check (tipo in (
    'dano_material', 'acidente_sem_afastamento', 'acidente_com_afastamento', -- topo (0017)
    'ato_inseguro', 'condicao_insegura', 'quase_acidente'                    -- base (desvio avulso, 0059)
  ));
