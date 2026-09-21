import type { TransportGate } from './transportPolicy';

/** Logs de QA (#546) — prefixo `*` + horário + português; só em __DEV__. */
function timestampPtBr(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Toque explícito em controle (Sync Now, toggle, Download, etc.). */
export function transportQaLogClique(
  controle: string,
  detalhes?: string,
): void {
  const mensagem = detalhes ? `${controle} — ${detalhes}` : controle;
  transportQaLog('CLIQUE', mensagem);
}

export function transportQaLog(
  categoria: string,
  mensagem: string,
  detalhes?: Record<string, unknown>,
): void {
  if (!(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__) {
    return;
  }
  const linha = `* [${timestampPtBr()}] ${categoria}: ${mensagem}`;
  if (detalhes !== undefined) {
    console.warn(linha, detalhes);
  } else {
    console.warn(linha);
  }
}

export function transportQaLogGate(
  origem: string,
  gate: TransportGate,
  rede: {
    isOnline: boolean;
    isWifi: boolean;
    connectionType?: string;
    uploadOverCellular: boolean;
  },
): void {
  const gatePt =
    gate === 'ok'
      ? 'PERMITIDO — pode enviar e baixar'
      : gate === 'offline'
      ? 'BLOQUEADO — sem conexão de rede'
      : 'BLOQUEADO — use Wi-Fi/ethernet ou ligue dados móveis nas configurações';

  transportQaLog('TRANSPORTE', `Verificação em ${origem}: ${gatePt}`, {
    resultado: gate,
    online: rede.isOnline,
    wifi: rede.isWifi,
    tipoConexao: rede.connectionType ?? '(desconhecido)',
    toggleDadosMoveis: rede.uploadOverCellular ? 'LIGADO' : 'DESLIGADO',
  });
}

export function transportQaLogItensDownload(
  acao: string,
  itens: { label?: string; id?: string; status?: string }[],
): void {
  const resumo =
    itens.length === 0
      ? '(nenhum item)'
      : itens
          .map(
            (item, i) =>
              `${i + 1}) ${item.label ?? item.id ?? 'item'} [${
                item.status ?? '?'
              }]`,
          )
          .join(' | ');

  transportQaLog('DOWNLOAD', `${acao} — ${itens.length} item(ns): ${resumo}`);
}
