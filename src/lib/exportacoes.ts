import type { LocalInspecao, LocalResposta, LocalEvento } from "@/lib/db";
import type { Checklist, ItemChecklist, NcTransicao, StatusEvento } from "@/types/db";
import { pctConformidade, dataInspecao } from "@/lib/obraView";
import { rotuloModulo, rotuloTipo } from "@/lib/catalogoDimensoes";
import { compartilharArquivo } from "@/lib/plataforma";

// Rótulo compacto do status do ciclo (p/ planilha).
const SITUACAO: Record<StatusEvento, string> = {
  aberto: "Aberta",
  em_andamento: "Em tratamento",
  tratada: "Tratada",
  aprovada: "Aprovada",
  reaberta: "Reaberta",
  fechado: "Encerrada",
};

// ============================================================
// Montagem dos dados de exportação (RF09) e utilitários de entrega.
// A montagem é pura/testável; o XLSX carrega o SheetJS sob demanda
// (dynamic import) para não pesar o bundle inicial.
// ============================================================

export interface LinhaInspecao {
  Data: string;
  Checklist: string;
  Nome: string;
  "Módulo": string;
  Tipo: string;
  "Área": string;
  Obra: string;
  Inspetor: string;
  Itens: number;
  Conformes: number;
  "Não Conformes": number;
  "N/A": number;
  "% Conformidade": string;
}

export interface LinhaEvento {
  Data: string;
  Checklist: string;
  Obra: string;
  Item: string;
  "Observação": string;
  Contratada: string;
  "Situação": string;
  Tratamento: string;
  Reaberturas: number;
  "Aprovada em": string;
  "Responsável": string;
  Prazo: string;
  "Evidência Foto": string;
  Inspetor: string;
}

export interface DadosExport {
  inspecoes: LinhaInspecao[];
  eventos: LinhaEvento[];
}

export interface CachesExport {
  ckMap: Map<string, Checklist>;
  usrMap: Map<string, string>;
  itemMap: Map<string, ItemChecklist>;
  eventoMap: Map<string, LocalEvento>; // resposta_id -> evento
  respComFoto: Set<string>; // resposta_id que possui evidência
  obraNome: string;
  transicoesPorEvento?: Map<string, NcTransicao[]>; // evento_id -> transições (ciclo)
  contratadaMap?: Map<string, string>; // contratada_id -> nome
}

const brData = (insp: LocalInspecao) =>
  dataInspecao(insp).split("-").reverse().join("/");

/** Monta as linhas das abas Inspeções e Eventos a partir do filtro atual. */
export function montarDadosExport(
  filtradas: LocalInspecao[],
  idx: Map<string, LocalResposta[]>,
  caches: CachesExport,
): DadosExport {
  const { ckMap, usrMap, itemMap, eventoMap, respComFoto, obraNome } = caches;
  const transicoesPorEvento = caches.transicoesPorEvento ?? new Map<string, NcTransicao[]>();
  const contratadaMap = caches.contratadaMap ?? new Map<string, string>();

  const inspecoes: LinhaInspecao[] = filtradas.map((insp) => {
    const rs = idx.get(insp.id) ?? [];
    const c = rs.filter((r) => r.resposta === "C").length;
    const nc = rs.filter((r) => r.resposta === "NC").length;
    const na = rs.filter((r) => r.resposta === "NA").length;
    const ck = ckMap.get(insp.checklist_id);
    return {
      Data: brData(insp),
      Checklist: ck?.codigo ?? "—",
      Nome: ck?.nome ?? "",
      "Módulo": rotuloModulo(ck?.modulo),
      Tipo: rotuloTipo(ck?.tipo),
      "Área": ck?.area ?? "",
      Obra: insp.frente || obraNome,
      Inspetor: usrMap.get(insp.inspetor_id) ?? "—",
      Itens: rs.length,
      Conformes: c,
      "Não Conformes": nc,
      "N/A": na,
      "% Conformidade": `${pctConformidade(c, nc)}%`,
    };
  });

  const eventos: LinhaEvento[] = [];
  for (const insp of filtradas) {
    const ck = ckMap.get(insp.checklist_id);
    const rs = (idx.get(insp.id) ?? []).filter((r) => r.resposta === "NC");
    for (const r of rs) {
      const ev = eventoMap.get(r.id);
      const trs = ev ? (transicoesPorEvento.get(ev.id) ?? []) : [];
      const reaberturas = trs.filter((t) => t.para_status === "reaberta").length;
      const aprovada = trs.find((t) => t.para_status === "aprovada");
      const contratada = ev?.contratada_id ? (contratadaMap.get(ev.contratada_id) ?? "") : insp.contratada ?? "";
      eventos.push({
        Data: brData(insp),
        Checklist: ck?.codigo ?? "—",
        Obra: insp.frente || obraNome,
        Item: itemMap.get(r.item_id)?.texto ?? "",
        "Observação": r.observacao ?? "",
        Contratada: contratada,
        "Situação": ev ? (SITUACAO[ev.status] ?? ev.status) : "",
        Tratamento: ev?.tratamento ?? "",
        Reaberturas: reaberturas,
        "Aprovada em": aprovada ? aprovada.criado_em.slice(0, 10).split("-").reverse().join("/") : "",
        "Responsável": ev?.responsavel ?? "",
        Prazo: ev?.prazo ? ev.prazo.split("-").reverse().join("/") : "",
        "Evidência Foto": respComFoto.has(r.id) ? "Sim" : "Não",
        Inspetor: usrMap.get(insp.inspetor_id) ?? "—",
      });
    }
  }

  return { inspecoes, eventos };
}

/** Entrega o arquivo: compartilhamento nativo (Capacitor) ou Web Share/download. */
export async function entregarArquivo(blob: Blob, nome: string): Promise<void> {
  await compartilharArquivo(blob, nome);
}

/** Gera e entrega o .xlsx (abas Inspecoes / Eventos_NC / Info). SheetJS lazy. */
export async function exportarXLSX(
  dados: DadosExport,
  obraNome: string,
  filtroDesc: string,
  agoraStr: string,
): Promise<void> {
  const mod = await import("xlsx");
  const XLSX = (mod as unknown as { default?: typeof mod }).default ?? mod;

  const wsInsp = XLSX.utils.json_to_sheet(dados.inspecoes);
  const wsEv = XLSX.utils.json_to_sheet(
    dados.eventos.length ? dados.eventos : [{ Info: "Nenhuma NC no filtro" }],
  );
  const nInsp = dados.inspecoes.length;
  const pontos = dados.inspecoes.reduce((s, l) => s + (l.Itens ?? 0), 0);
  const wsInfo = XLSX.utils.aoa_to_sheet([
    ["Obra", obraNome],
    ["Filtro", filtroDesc],
    ["Inspeções", nInsp],
    ["Pontos inspecionados", pontos],
    ["Gerado em", agoraStr],
    ["Origem", "FieldCheck"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsInsp, "Inspecoes");
  XLSX.utils.book_append_sheet(wb, wsEv, "Eventos_NC");
  XLSX.utils.book_append_sheet(wb, wsInfo, "Info");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  await entregarArquivo(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `Inspecoes_${obraNome.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

/** Rasteriza o SVG do gráfico em um PNG (data URL). */
export function gerarPNG(svgEl: SVGSVGElement | null): Promise<string | null> {
  return new Promise((resolve) => {
    if (!svgEl) return resolve(null);
    const xml = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = 1280;
      cv.height = 640;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      resolve(cv.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  });
}
