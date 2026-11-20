import { useState } from 'react';
import { FileUp, Import, RefreshCw } from 'lucide-react';
import { useDb, useSession } from '../lib/store';
import { fmtBR } from '../lib/dates';
import { applyImport, compare, parseReferenceFile, type CompareRow, type ImportResult, type ParsedSheet } from '../services/importActivities';
import type { CostCenter } from '../types';
import { Alert, Badge, Button, Card, Empty, Stat, StatusBadge, useAction } from '../components/ui';

const LABEL = { novo: 'Não está no sistema', igual: 'Já cadastrada (igual)', diferente: 'Cadastrada com diferenças' } as const;
const COLOR = { novo: 'blue', igual: 'green', diferente: 'yellow' } as const;

export default function ActivityImport() {
  const db = useDb();
  const { user } = useSession();
  const [file, setFile] = useState<File>();
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [ccs, setCcs] = useState<CostCenter[]>([]);
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'' | CompareRow['status']>('');
  const [importCC, setImportCC] = useState(true);
  const [result, setResult] = useState<ImportResult>();
  const { busy, run } = useAction();

  async function load(f: File) {
    setFile(f);
    setResult(undefined);
    await run(async () => {
      const parsed = await parseReferenceFile(f);
      const cmp = compare(parsed.sheets);
      setSheets(parsed.sheets);
      setCcs(parsed.costCenters);
      setRows(cmp);
      setSel(new Set(cmp.filter((r) => r.status === 'novo').map((r) => r.key)));
      if (!parsed.sheets.length) throw new Error('Nenhuma aba no formato do Relatório de Atividades (linha com "ID" e "DESCRIÇÃO DA ATIVIDADE") foi encontrada.');
    });
  }

  function recompare() {
    const cmp = compare(sheets);
    setRows(cmp);
    setSel(new Set(cmp.filter((r) => r.status === 'novo').map((r) => r.key)));
  }

  const known = new Set(db.all('costCenters').map((c) => c.codigo));
  const newCcs = ccs.filter((c) => !known.has(c.codigo));
  const shown = rows.filter((r) => !filter || r.status === filter);
  const count = (s: CompareRow['status']) => rows.filter((r) => r.status === s).length;
  const newCollabs = new Set(rows.filter((r) => r.novoColaborador && sel.has(r.key)).map((r) => r.novoColaborador!.nome));

  return (
    <div className="space-y-4">
      <Card title="Planilha de referência (SE-PL-0510-CD001-R0 Relatório de Atividades)">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-idg-blue px-3.5 py-2 text-sm font-medium text-white hover:bg-idg-navy">
            <FileUp className="h-4 w-4" /> Selecionar arquivo .xlsx
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </label>
          {file && <span className="text-sm text-slate-600">{file.name}</span>}
          {rows.length > 0 && (
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={recompare}>
              Comparar novamente
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Todas as abas são lidas (inclusive ocultas). Cada atividade é comparada com o sistema pelo colaborador (matrícula ou nome) + ID. Você escolhe o que importar: por padrão, só o que ainda não está no sistema.
          A aba <b>Planilha1</b> (centros de custo) também é sincronizada.
        </p>
      </Card>

      {result && (
        <Alert kind={result.erros.length ? 'warning' : 'success'} title="Importação concluída">
          {`${result.inseridas} atividade(s) inserida(s), ${result.atualizadas} atualizada(s), ${result.colaboradores} colaborador(es) criado(s), ${result.centrosCusto} centro(s) de custo novo(s).`}
          {result.erros.length ? '\nErros:\n' + result.erros.join('\n') : ''}
        </Alert>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Abas lidas" value={sheets.filter((s) => s.rows.length).length} sub={`${sheets.length} no total`} />
            <Stat label="Atividades na planilha" value={rows.length} />
            <Stat label="Não estão no sistema" value={count('novo')} tone="blue" />
            <Stat label="Com diferenças" value={count('diferente')} tone="amber" />
            <Stat label="Já iguais" value={count('igual')} tone="green" />
          </div>
          <Card
            title="Comparação planilha × sistema"
            bodyClass="p-0"
            actions={
              <>
                <select className="input !w-auto !py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                  <option value="">Todas</option>
                  <option value="novo">Não estão no sistema</option>
                  <option value="diferente">Com diferenças</option>
                  <option value="igual">Iguais</option>
                </select>
                <Button size="sm" variant="secondary" onClick={() => setSel(new Set(rows.filter((r) => r.status === 'novo').map((r) => r.key)))}>
                  Selecionar só as que faltam
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setSel(new Set(rows.filter((r) => r.status !== 'igual').map((r) => r.key)))}>
                  Faltantes + diferenças
                </Button>
              </>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr>
                    <th className="th w-8"></th>
                    <th className="th">Situação</th>
                    <th className="th">Colaborador</th>
                    <th className="th">ID</th>
                    <th className="th">Descrição</th>
                    <th className="th">Datas (planilha)</th>
                    <th className="th">Status</th>
                    <th className="th">Diferenças</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.key} className={sel.has(r.key) ? 'bg-blue-50/50' : ''}>
                      <td className="td">
                        <input
                          type="checkbox"
                          disabled={r.status === 'igual'}
                          checked={sel.has(r.key)}
                          onChange={() =>
                            setSel((s) => {
                              const n = new Set(s);
                              if (n.has(r.key)) n.delete(r.key);
                              else n.add(r.key);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="td">
                        <Badge color={COLOR[r.status]}>{LABEL[r.status]}</Badge>
                      </td>
                      <td className="td text-xs">
                        {r.collaboratorNome}
                        {r.novoColaborador && <Badge color="purple" className="ml-1">novo colaborador</Badge>}
                        <div className="text-slate-400">aba: {r.sheet}</div>
                      </td>
                      <td className="td font-mono text-xs">{r.parsed.codigo}</td>
                      <td className="td max-w-xs text-xs">{r.parsed.descricao}</td>
                      <td className="td whitespace-nowrap text-xs">
                        Est.: {fmtBR(r.parsed.estInicio) || '—'} → {fmtBR(r.parsed.estTermino) || '—'}
                        <br />
                        Real: {fmtBR(r.parsed.inicioReal) || '—'} → {fmtBR(r.parsed.terminoReal) || '—'}
                      </td>
                      <td className="td">
                        <StatusBadge status={r.parsed.status} />
                      </td>
                      <td className="td text-xs">
                        {r.diffs.map((d) => (
                          <div key={d.campo}>
                            <b>{d.campo}:</b> <span className="text-red-600 line-through">{d.sistema || '(vazio)'}</span> → <span className="text-emerald-700">{d.planilha}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && (
                <div className="p-4">
                  <Empty>Nada neste filtro.</Empty>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 text-sm">
                <div>
                  <b>{sel.size}</b> atividade(s) selecionada(s) para importar
                  {newCollabs.size > 0 && (
                    <>
                      {' '}· serão criados {newCollabs.size} colaborador(es): {[...newCollabs].join(', ')}
                    </>
                  )}
                </div>
                {ccs.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={importCC} onChange={(e) => setImportCC(e.target.checked)} /> Importar {newCcs.length} centro(s) de custo novo(s) da aba Planilha1 ({ccs.length} lidos)
                  </label>
                )}
                <p className="text-xs text-slate-500">Atualizações de atividades existentes com mudança de datas são registradas na auditoria com a justificativa “Atualização via importação da planilha de referência”.</p>
              </div>
              <Button
                icon={<Import className="h-4 w-4" />}
                loading={busy}
                disabled={!sel.size && !(importCC && newCcs.length)}
                onClick={() =>
                  run(async () => {
                    const r = await applyImport(
                      rows.filter((x) => sel.has(x.key)),
                      user,
                      file?.name ?? 'planilha',
                      importCC ? ccs : [],
                    );
                    setResult(r);
                    recompare();
                  })
                }
              >
                Importar selecionadas
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
