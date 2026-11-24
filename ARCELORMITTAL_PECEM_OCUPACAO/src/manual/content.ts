// Conteúdo padrão do Manual. Cada capítulo pode ser substituído pelo coordenador
// (tabela manual_secoes, mesmo id). Para uma tela nova, basta acrescentar um capítulo aqui.
//
// Formatação aceita no texto:
//   ## Subtítulo          - item de lista        1. passo numerado
//   > Dica                ! Atenção              **negrito**      [3] = marcação nº 3 da imagem
import type { Role } from '../types';

export interface ManualChapter {
  id: string;
  titulo: string;
  ordem: number;
  rota?: string; // rota da tela (para o link "Abrir tela")
  captura?: string; // id da captura de tela associada
  perfis?: Role[]; // quem tem acesso à tela (vazio = todos)
  conteudo: string;
}

/** Telas capturadas automaticamente: id, rota (hash) e legenda padrão. */
export const CAPTURE_PAGES: { pagina: string; rota: string; legenda: string; perfis?: Role[] }[] = [
  { pagina: 'login', rota: 'login', legenda: 'Tela de entrada: Entrar, Criar conta e Esqueci minha senha' },
  { pagina: 'painel', rota: '/', legenda: 'Painel com os indicadores do dia' },
  { pagina: 'atividades', rota: '/atividades', legenda: 'Lista de atividades com filtros' },
  { pagina: 'importar', rota: '/importar', legenda: 'Importar / Comparar Excel', perfis: ['coordenador'] },
  { pagina: 'mapa', rota: '/mapa', legenda: 'Mapa de carga (Gantt e ocupação diária)' },
  { pagina: 'ferias', rota: '/ferias', legenda: 'Férias: solicitações e mapa anual da equipe', perfis: ['coordenador', 'colaborador'] },
  { pagina: 'aprovacoes', rota: '/aprovacoes', legenda: 'Fila de aprovação de férias', perfis: ['coordenador'] },
  { pagina: 'conciliacao', rota: '/conciliacao', legenda: 'Conciliação de férias com o RH', perfis: ['coordenador'] },
  { pagina: 'relatorios', rota: '/relatorios', legenda: 'Relatórios executivos', perfis: ['coordenador', 'cliente'] },
  { pagina: 'configuracoes', rota: '/configuracoes', legenda: 'Configurações do sistema', perfis: ['coordenador'] },
  { pagina: 'conta', rota: '/conta', legenda: 'Minha conta e lembretes' },
];

export const APP_NAME = 'Gestão de Atividades e Férias';
export const APP_SUBTITLE = 'Contrato AMP · ArcelorMittal Pecém · IDG Engenharia';
export const APP_FILE_NAME = 'Gestao_Atividades_Ferias_AMP';

export const DEFAULT_CHAPTERS: ManualChapter[] = [
  {
    id: 'introducao',
    titulo: 'Introdução',
    ordem: 1,
    conteudo: `O **${APP_NAME}** é o sistema da IDG Engenharia para o Contrato AMP, na ArcelorMittal Pecém. Ele reúne num só lugar as atividades (serviços) de cada colaborador, as horas estimadas e realizadas, a carga de trabalho da equipe e as férias.

## Para quem é
- **Colaboradores IDG:** registram e atualizam as próprias atividades e pedem férias.
- **Coordenador:** acompanha a equipe, aprova férias, importa planilhas, gera relatórios e configura o sistema.
- **Cliente ArcelorMittal:** consulta as atividades, o mapa de carga e os relatórios, sem alterar nada.

## Que problema resolve
Antes, o controle era feito em planilhas separadas por pessoa e por mês, trocadas por e-mail. Era difícil saber quem estava sobrecarregado, quais serviços estavam atrasados, por que uma data mudou e se as férias de duas pessoas batiam. O sistema guarda tudo numa base única, calcula as horas sozinho, registra cada mudança de data com justificativa e gera os relatórios oficiais (SE-PL-0510 e formulário de férias ADM-PF158) com um clique.

> Os dados ficam no servidor e são atualizados em tempo real: o que um usuário salva aparece para os outros em poucos segundos. Todo dia às 06:00 é feito um backup completo.`,
  },
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    ordem: 2,
    captura: 'login',
    conteudo: `## Criar a sua conta (primeiro acesso)
1. Abra o endereço do sistema: **https://idg-amp-gestao.netlify.app**.
2. Toque em **Criar conta**.
3. Informe o seu **e-mail corporativo**. O sistema mostra logo abaixo o perfil que você vai ter.
4. Preencha **Nome completo**, **Matrícula** e **Função**.
5. Crie uma **senha** de pelo menos 8 caracteres e toque em **Criar conta e entrar**.

Não é preciso confirmar o e-mail: você já entra direto. Se o seu e-mail já estiver no cadastro de colaboradores, a conta é ligada a ele automaticamente e as suas atividades e férias já aparecem.

! Só entram e-mails corporativos: @idg-eng.com, @idg.global, @idg.global.com e @arcelormittal.com. E-mails @arcelormittal.com recebem o perfil Cliente ArcelorMittal.

## Entrar
Informe e-mail e senha na aba **Entrar**. Mensagens possíveis:
- **E-mail ou senha incorretos.** Confira o que foi digitado.
- **Domínio não autorizado.** O e-mail não é corporativo.
- **Perfil não encontrado ou desativado.** O acesso foi bloqueado ou o colaborador foi desligado. Procure o coordenador.

## Esqueci minha senha
Na tela de entrada, toque em **Esqueci minha senha**, informe o e-mail e toque em **Enviar link por e-mail**. O link vale por 60 minutos e só pode ser usado uma vez. Se o e-mail não chegar, peça ao coordenador para redefinir a senha em Configurações › Usuários.

## Convite
O coordenador também pode mandar um convite. O link do convite vale por 7 dias e abre uma tela para criar a senha e completar o cadastro.

## Primeiro acesso com senha padrão
Se o coordenador criou o seu acesso com a **senha padrão**, entre com o e-mail corporativo e essa senha. O sistema abre a tela **Crie sua senha**: digite uma senha nova (mínimo 8 caracteres, diferente da padrão) duas vezes e toque em **Salvar senha e entrar**. O mesmo acontece quando o coordenador volta a sua senha para a padrão.

## Conhecendo a tela
- **Menu lateral (à esquerda):** leva a cada módulo. No celular, abra pelo botão ☰. Só aparecem os itens do seu perfil.
- **Barra superior:** nome da tela, seu nome e perfil, **Instalar app**, botão de **tema claro/escuro**, sino de **lembretes** e **Sair**.
- **Ver como (só coordenador):** simula a visão de um colaborador ou do cliente. Uma faixa amarela avisa que é uma simulação, e o que for salvo continua sendo gravado com o usuário do coordenador.

## Instalar como aplicativo
No computador (Edge ou Chrome) ou no celular, toque em **Instalar app**. O sistema ganha ícone próprio, abre em janela separada e recebe os lembretes. No iPhone, use Safari › Compartilhar › Adicionar à Tela de Início.

> O tema escuro pode ser escolhido no botão de sol/lua da barra superior ou em Minha conta › Aparência. A escolha fica salva no aparelho.`,
  },
  {
    id: 'painel',
    titulo: 'Painel',
    ordem: 3,
    rota: '/',
    captura: 'painel',
    conteudo: `**Objetivo:** mostrar, logo ao entrar, como está a equipe hoje.

## Indicadores do topo
- **Em aberto:** atividades que não estão finalizadas nem canceladas.
- **Em execução hoje:** atividades cuja janela de execução inclui o dia de hoje.
- **Atrasadas:** em aberto com a estimativa de término vencida.
- **Finalizadas no mês:** finalizadas com término real no mês atual.
- **Sobrecarga hoje:** colaboradores com mais horas no dia do que o limite diário configurado.
- **Férias aguardando decisão:** pedidos pendentes ou cancelamentos em análise (não aparece para o cliente).

## Quadros
- **Atrasadas:** até 8 itens, com os dias de atraso. O link **ver todas** abre Atividades já filtrada.
- **Em execução hoje:** o que está rodando hoje e as horas por dia de cada uma. O link leva ao Mapa de Carga.
- **Carga de hoje por colaborador:** barra colorida com as horas do dia. Vermelho acima do limite, verde a partir de 6 h e amarelo abaixo disso. Aparecem as marcas **paralelo** (2 ou mais atividades no dia) e **ocioso** (nenhuma hora).
- **Próximas férias aprovadas (90 dias):** quem sai e quando.

> O colaborador vê só os próprios números. O coordenador e o cliente veem a equipe toda.`,
  },
  {
    id: 'atividades',
    titulo: 'Atividades',
    ordem: 4,
    rota: '/atividades',
    captura: 'atividades',
    conteudo: `**Objetivo:** cadastrar, acompanhar e atualizar cada serviço, com as horas estimadas e realizadas.

## Filtros
**Buscar** procura em ID, descrição, solicitante, área, documentos AMP, centro de custo, observação e nome do colaborador. Também há filtros de **Colaborador** (coordenador e cliente), **Status**, **Situação** (em aberto, em execução hoje, atrasadas), **Mês**, **Área usina**, **Solicitante** e **Centro de custo**. O título da lista soma as horas estimadas e realizadas do que está filtrado.

## Colunas e marcas
ID, descrição (com observação e quantidade de documentos AMP), colaborador, solicitante/área, datas estimadas e reais, horas estimadas/realizadas, centro de custo e status. As marcas mostram **atrasada**, **entregue com atraso** e **reprogramação(ões)** (quantas vezes a data mudou).

## Botões de cada linha
- **Relógio (Histórico):** mostra todas as mudanças de data, com usuário, data/hora, valor anterior, valor novo e justificativa.
- **Lápis (Editar)** ou **Olho (Ver):** abre a ficha. Quem não pode editar só visualiza.
- **Lixeira (Excluir):** pede confirmação antes de apagar.

## Cadastrar uma atividade
1. Toque em **Nova atividade**.
2. Escolha o **colaborador**. O colaborador só pode lançar para si mesmo.
3. Preencha **ID da atividade** (ex.: T2IDEA0017524), **Solicitante**, **Área usina**, **Data solicitação** e **Descrição**.
4. Em **Estimativa**, informe início e término e escolha o cálculo: **Dias úteis × h/dia** (o sistema multiplica) ou **Manual** (você digita o total).
5. Em **Realizado**, faça o mesmo com o início e o término real.
6. Informe os **documentos AMP** (um por linha), o **centro de custo** (digite para buscar na base), o **status** e a **observação** (ex.: SEP: 0343/2025).
7. Toque em **Salvar**.

## Regras e validações
- ID, descrição e colaborador são obrigatórios.
- O término não pode ser antes do início, nem na estimativa nem no realizado.
- Para marcar **Finalizado** é preciso informar o **Término real**.
- O mesmo ID pode ter vários trechos para o mesmo colaborador (por exemplo, interrompido por atestado). Só é bloqueado o mesmo ID, para o mesmo colaborador, com o mesmo início.
- Avisos (não impedem salvar): centro de custo não informado ou fora da base.
- Os dias úteis descontam sábados, domingos e feriados (nacionais, do Ceará e os extras cadastrados).

## Mudança de datas (auditoria)
Ao alterar uma data que já estava preenchida (estimativa de início ou término, início ou término real), o sistema pede uma **justificativa de pelo menos 10 caracteres**. Ela fica gravada com seu nome, e-mail, data e hora e aparece no histórico, nos relatórios e na exportação de alocação.

## Atestados e afastamentos
Os dias de atestado, afastamento, doença ou falta usam o ID **0510-0000** com a descrição **Afastado | Atestado**. Eles não contam como carga de trabalho e aparecem em roxo no Mapa de Carga e no relatório oficial.

## Exportar Relatório (SE-PL-0510)
O botão abre a janela de exportação já com os filtros da tela:
1. Escolha o período (**De/Até**) ou um atalho: Mês atual, Mês anterior, Últimos 3 meses, Ano atual.
2. Ajuste a situação e as listas de colaboradores, status, áreas, centros de custo e solicitantes.
3. Marque **Relatório oficial SE-PL-0510-CD001-R0**: uma aba por colaborador e por mês, ou uma aba por colaborador com o período inteiro.
4. Se quiser, marque também **Justificativa de alocação mensal** (horas por mês, ocupação e justificativas de data).
5. Marque **Gerar um arquivo separado por colaborador** para receber um .zip.
6. Toque em **Gerar Excel**.

> Para não esquecer de atualizar, ative os lembretes em Minha conta. Nos dias úteis o sistema avisa nos horários definidos pelo coordenador.`,
  },
  {
    id: 'importar',
    titulo: 'Importar / Comparar Excel',
    ordem: 5,
    rota: '/importar',
    captura: 'importar',
    perfis: ['coordenador'],
    conteudo: `**Objetivo:** trazer para o sistema as atividades da planilha oficial SE-PL-0510-CD001-R0 e comparar com o que já está cadastrado.

## Passo a passo
1. Toque em **Selecionar arquivo .xlsx** e escolha a planilha.
2. O sistema lê todas as abas, inclusive as ocultas, e procura a linha com "ID" e "DESCRIÇÃO DA ATIVIDADE".
3. Confira os indicadores: **Abas lidas**, **Atividades na planilha**, **Não estão no sistema**, **Com diferenças** e **Já iguais**.
4. Na tabela, cada linha mostra a situação, o colaborador (e a aba de origem), o ID, a descrição, as datas e as diferenças (valor do sistema riscado → valor da planilha).
5. Use **Selecionar só as que faltam** ou **Faltantes + diferenças**, ou marque linha a linha.
6. Se a aba **Planilha1** tiver centros de custo, deixe marcada a opção de importar os novos.
7. Toque em **Importar selecionadas**. O resultado mostra quantas foram inseridas e atualizadas, os colaboradores criados e os centros de custo novos.

## Regras
- O colaborador é identificado pela matrícula ou pelo nome. Se não existir, é criado (marca **novo colaborador**).
- A comparação usa colaborador + ID + data de início, então o mesmo ID em trechos diferentes é tratado como linhas separadas.
- Atestado, afastamento, doença e falta (mesmo sem ID) entram como **0510-0000 · Afastado | Atestado**, com o texto original na observação.
- Atualizações que mudam datas são registradas na auditoria com a justificativa "Atualização via importação da planilha de referência".

> Use **Comparar novamente** depois de importar para conferir que tudo ficou igual.`,
  },
  {
    id: 'mapa',
    titulo: 'Mapa de Carga',
    ordem: 6,
    rota: '/mapa',
    captura: 'mapa',
    conteudo: `**Objetivo:** ver numa linha do tempo (Gantt) o que cada pessoa está fazendo e quantas horas por dia isso representa.

## Controles
- **◀ ▶ e Início:** movem a janela por semanas. **Hoje** volta para duas semanas antes da semana atual.
- **Janela:** 4, 6, 8, 12, 16 ou 26 semanas.
- **Agrupar por:** colaborador ou área da usina.
- Filtros de **Colaborador**, **Solicitante**, **Área**, **Centro de custo**, **Status** e **Ocultar finalizadas**.

## Como ler
- Para cada colaborador há uma linha de **ocupação diária** com as horas de cada dia útil. Passe o mouse para ver as horas e as atividades do dia.
- Vermelho indica dia acima do limite de sobrecarga. A coluna **Semana atual** soma as horas da semana, e a marca **ocioso** indica semana sem horas.
- **Cores das barras:** cinza não iniciado, azul em andamento, laranja aguardando cliente, verde finalizado, vermelho claro cancelado.
- **Listras vermelhas:** atraso, depois do término previsto. **◆** marca o término previsto.
- **Hachurado:** férias aprovadas.
- **Roxo / AT:** afastado ou atestado (não conta como carga).
- Atividades em aberto com a estimativa vencida têm a barra esticada até hoje.

## Regras de cálculo
- Horas por dia de uma atividade: o valor h/dia informado ou, no cálculo manual, o total dividido pelos dias úteis. Sem dados, vale o padrão das Configurações.
- **Aguardando Cliente** e **Cancelado** não somam carga.
- Fins de semana e feriados ficam zerados.

## Exportar
**Exportar PDF** e **Exportar Excel** geram exatamente o que está na tela (período, filtros e agrupamento), com Gantt, ocupação e tabela.`,
  },
  {
    id: 'ferias',
    titulo: 'Férias',
    ordem: 7,
    rota: '/ferias',
    captura: 'ferias',
    perfis: ['coordenador', 'colaborador'],
    conteudo: `**Objetivo:** pedir férias, acompanhar a aprovação e ver a escala anual da equipe.

## Solicitar férias
1. Toque em **Solicitar férias**.
2. Escolha a **modalidade**: 30 dias corridos, 15+15, 10+20, 20+10, 19+11 ou 20 dias de descanso + 10 de abono (venda).
3. Para cada período, toque no dia de início no calendário. O sistema mostra o fim e o dia de retorno.
4. Confira os alertas e, se tiver, informe o **Nº do chamado RH** e uma **observação**.
5. Toque em **Enviar para aprovação**.

## Regras (CLT e escala)
- O início só pode ser numa **segunda ou terça-feira**.
- Não pode começar num feriado nem nos **2 dias antes de um feriado** (CLT art. 134 §3º).
- O 2º período deve começar depois do fim do 1º.
- Antecedência recomendada de **40 dias**. Com menos, aparece um alerta.
- **Escala da equipe:** sobreposição de até 7 dias com um colega gera alerta amarelo. Acima de 7 dias, ou mais de 2 pessoas fora ao mesmo tempo, é conflito crítico (vermelho). O colaborador não consegue enviar com conflito crítico. O coordenador pode aprovar com justificativa.

## Lista de solicitações
Mostra modalidade, períodos (e quantos dias faltam), data do pedido, status, revisão e chamado RH. Botões:
- **Olho:** detalhes e histórico completo.
- **Lápis:** alterar. Toda alteração volta para aprovação, inclusive de férias já aprovadas. Mudar só o número do chamado RH não reinicia a aprovação.
- **Planilha verde:** gera o formulário **ADM-PF158** (só para férias aprovadas).
- **Proibido (vermelho):** cancelar, com motivo. Se já estiverem aprovadas, o cancelamento vai para o coordenador decidir. Com menos de 30 dias do início, o cancelamento deve ser feito também por chamado RH.

## Status
Pendente, Ajuste Solicitado (o coordenador pediu mudança e o parecer aparece na linha), Aprovada, Reprovada, Cancelamento Solicitado e Cancelada.

## Mapa anual da equipe
Uma linha por colaborador ativo e um quadrinho por dia: verde aprovada, amarelo pendente, laranja ajuste solicitado, roxo cancelamento solicitado. A linha vermelha marca o dia de hoje.`,
  },
  {
    id: 'aprovacoes',
    titulo: 'Aprovações',
    ordem: 8,
    rota: '/aprovacoes',
    captura: 'aprovacoes',
    perfis: ['coordenador'],
    conteudo: `**Objetivo:** decidir os pedidos de férias e acompanhar os chamados do RH. O número no menu mostra quantos pedidos esperam decisão.

## Fila de aprovação
Cada pedido mostra colaborador, modalidade e períodos, antecedência, situação da escala (**Sem conflito**, **Alerta** ou **Conflito crítico**; passe o mouse para ver o motivo) e se é **Nova** ou **Alterada** (revisão).
1. Toque no **olho** para ver detalhes e histórico.
2. Escolha **Aprovar**, **Solicitar ajuste** ou **Reprovar**.
3. Escreva o parecer. É opcional para aprovar e obrigatório para ajuste ou reprovação.
4. Se houver conflito crítico, escreva a justificativa (mínimo 10 caracteres) para aprovar mesmo assim.

## Pedidos de cancelamento
Para férias já aprovadas: **Aprovar cancelamento** ou **Recusar** (as férias continuam valendo).

## Aguardando ajuste do colaborador
Pedidos devolvidos, esperando o colaborador corrigir.

## Férias aprovadas · chamados RH e formulários
Para cada férias aprovada: quem aprovou, número e status do chamado RH (Não aberto, Aberto, Em análise, Concluído), botão para atualizar o chamado e botão para gerar o **ADM-PF158**.

> Toda decisão fica registrada no histórico da solicitação com usuário, data e hora.`,
  },
  {
    id: 'conciliacao',
    titulo: 'Conciliação RH',
    ordem: 9,
    rota: '/conciliacao',
    captura: 'conciliacao',
    perfis: ['coordenador'],
    conteudo: `**Objetivo:** conferir se as férias aprovadas no sistema batem com a planilha do RH.

## Passo a passo
1. Se precisar, baixe o **Modelo de planilha**.
2. Toque em **Selecionar planilha do RH** e escolha o arquivo (.xlsx ou .csv) com **Matrícula** e/ou **Nome**, **Início** e **Fim**. O sistema também aceita as colunas Retorno ou Dias.
3. Confira os indicadores: **Conciliado (OK)**, **Divergência de Datas**, **Ausente no RH** (está no sistema e não no RH) e **Ausente no Sistema** (está no RH e não no sistema).
4. Filtre por status e veja o detalhe de cada linha.
5. **Exportar** gera um Excel colorido com o resultado. **Registrar importação** guarda a planilha no histórico.

## Regras
Entram na comparação só as férias **Aprovadas** e as com **cancelamento em análise**. Pendentes ficam de fora.

> No **Histórico de importações do RH**, use **Reconciliar novamente** para refazer a conferência de uma planilha antiga.`,
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    ordem: 10,
    rota: '/relatorios',
    captura: 'relatorios',
    perfis: ['coordenador', 'cliente'],
    conteudo: `**Objetivo:** dar a visão gerencial do período: horas, cumprimento de prazo e mudanças de data.

## Filtros
Período (**De/Até**, por mês) e **Colaborador**.

## Indicadores
- **Horas estimadas** e **Horas realizadas** (com o percentual do estimado).
- **Índice no prazo:** finalizadas dentro da estimativa ÷ total de finalizadas. Verde a partir de 80%.
- **Abertas atrasadas** e **Datas alteradas** (com justificativa).

## Quadros
- **Estimado × Realizado por colaborador** e **por centro de custo**, com horas, desvio, número de atividades e quantas no prazo.
- **Horas por mês:** barras azuis (estimado) e laranja (realizado), distribuídas pelos dias úteis.
- **Justificativas de alteração de datas:** data/hora, atividade, campo, de → para, justificativa e usuário.
- Só coordenador: **Mapa anual de férias** e **Status dos chamados RH**.

## Exportações
- **Exportar Excel com filtros:** a mesma janela do SE-PL-0510 e da alocação mensal.
- **Exportar relatório gerencial:** Excel com o resumo e todas as tabelas do período.`,
  },
  {
    id: 'configuracoes',
    titulo: 'Configurações',
    ordem: 11,
    rota: '/configuracoes',
    captura: 'configuracoes',
    perfis: ['coordenador'],
    conteudo: `**Objetivo:** ajustar o sistema e cuidar dos cadastros. As alterações valem para todos depois de tocar em **Salvar**.

## Identidade visual
**Logo IDG** (vai no menu, no SE-PL-0510 e no ADM-PF158) e **Selos de certificação** (canto do formulário de férias). Dá para restaurar o padrão.

## Parâmetros gerais
Seção do formulário de férias, gestor/coordenador que aprova, horas/dia padrão de uma atividade e limites de sobrecarga diária e semanal.

## Lembretes diários
Horários (de Brasília) em que, nos dias úteis, os colaboradores com serviços em aberto recebem notificação. Use horas cheias ou meia hora.

## Backup
E-mail que recebe o backup diário das 06:00 (sempre vai uma cópia também para o e-mail do responsável pelo sistema). Botões **Enviar backup agora**, **Baixar backup (JSON)** e **Baixar backup (Excel)**.

## Zerar o sistema
Apaga os dados para começar do zero, mantendo usuários e configurações. Antes, baixa o backup automaticamente. É preciso digitar **ZERAR** para confirmar.

## Feriados
Nacionais e do Ceará já são automáticos. Inclua aqui os municipais (Caucaia, São Gonçalo do Amarante) e os pontos facultativos.

## Colaboradores
- **Novo** e **Editar:** nome, matrícula, função e e-mail corporativo. Com o e-mail, o login é ligado automaticamente quando a pessoa cria a conta. O botão **Enviar convite** gera o link de acesso.
- **Desligar:** tira a pessoa das listas e bloqueia o login, mas mantém o histórico. **Mostrar desligados** e **Reativar** desfazem.
- **Excluir definitivamente:** baixa o backup antes e pede que você digite EXCLUIR. Não pode ser desfeito.

## Centros de custo
Código, denominação e responsável. Dá para incluir, editar e excluir.

## Convidar pessoas
Envia um link de cadastro (vale por 7 dias) e mostra os convites pendentes, aceitos e expirados, com **Reenviar** e **Cancelar**. O link pode ser copiado ou mandado por e-mail ou WhatsApp. A caixa **Mensagem pronta para a equipe** traz o texto com o link do sistema e o passo a passo para o grupo.

## Usuários e perfis de acesso
Muda o perfil de cada usuário, liga o login a um colaborador, libera ou bloqueia o acesso e **redefine a senha** (digitada ou voltando para a senha padrão; a pessoa cria a própria no próximo acesso). No topo fica a **senha padrão de acesso**. Em Convidar pessoas, **Criar acesso com senha padrão** libera a pessoa na hora, sem e-mail. O aviso **Vínculo pendente** mostra quem se cadastrou e ainda não foi ligado a um colaborador.`,
  },
  {
    id: 'conta',
    titulo: 'Minha conta e lembretes',
    ordem: 12,
    rota: '/conta',
    captura: 'conta',
    conteudo: `**Objetivo:** ver os seus dados, ajustar o aparelho e trocar a senha.

## O que tem nesta tela
- **Minha conta:** nome, e-mail, perfil e colaborador vinculado. Se aparecer "Aguardando vínculo pelo coordenador", avise o coordenador.
- **Aparência:** tema claro, escuro ou o mesmo do sistema.
- **Instalar no computador:** botão **Instalar aplicativo** ou o passo a passo para o Edge ou o Chrome.
- **Lembretes diários:** **Ativar lembretes**, **Enviar teste** e **Desativar**. A ativação vale para cada aparelho.
- **Alterar senha:** nova senha (mínimo 8 caracteres) e confirmação.

! Se as notificações estiverem bloqueadas, clique no cadeado da barra de endereço › Permissões › Notificações › Permitir e recarregue a página.`,
  },
  {
    id: 'manual',
    titulo: 'Este manual e a apresentação',
    ordem: 13,
    rota: '/manual',
    conteudo: `**Objetivo:** explicar o sistema e gerar a apresentação para clientes e para a equipe.

## Usar o manual
- O **índice** à esquerda leva a cada capítulo. A **busca** filtra os capítulos que têm a palavra e destaca onde ela aparece.
- Toque numa imagem para ampliar. Os números sobre a imagem correspondem aos números no texto.
- **Exportar manual em PDF** baixa o manual inteiro com índice e imagens.

## Só para o coordenador
- **Gerar/atualizar capturas de tela:** abre cada tela do sistema de forma invisível e tira a foto real dela. Leva cerca de 1 minuto.
- Em cada imagem: **Enviar imagem** (substitui por um arquivo seu), **Marcações** (toque na imagem para pôr os números 1, 2, 3…) e **Legenda**.
- **Editar texto** de cada capítulo e **Restaurar padrão**.
- **Ganho de tempo:** ajusta os tempos e volumes que alimentam o slide comparativo.
- **Exportar apresentação em PDF** e **em PowerPoint (.pptx)**: os dois têm os mesmos slides, em 16:9. No PowerPoint, textos, tabelas e gráfico continuam editáveis.

> As imagens respeitam o perfil: quem não tem acesso a uma tela lê o texto do capítulo, sem a imagem.`,
  },
  {
    id: 'perfis',
    titulo: 'Perfis de usuário e permissões',
    ordem: 14,
    conteudo: `## Colaborador IDG
- Vê o Painel, as Atividades e o Mapa de Carga **só com os próprios dados**.
- Cadastra, edita e exclui **as próprias atividades** (precisa estar ligado a um colaborador).
- Pede, altera e cancela as próprias férias e vê o mapa anual da equipe.
- Exporta o SE-PL-0510 das próprias atividades.
- Não acessa Importar, Aprovações, Conciliação RH, Relatórios nem Configurações.

## Cliente ArcelorMittal
- Vê o Painel, as Atividades, o Mapa de Carga e os Relatórios **de toda a equipe**, só para consulta.
- Pode exportar os relatórios.
- Não vê férias e não altera nada.

## Coordenador
- Acesso total: tudo acima, mais Importar, Aprovações, Conciliação RH e Configurações.
- Edita a atividade de qualquer colaborador, aprova férias e gerencia usuários, convites e cadastros.
- Usa o **Ver como** para conferir o que cada perfil enxerga.
- Gera as capturas, edita o manual e exporta a apresentação.

> As permissões são garantidas também no banco de dados: mesmo fora da tela, um usuário não consegue ler ou gravar o que não é do seu perfil.`,
  },
  {
    id: 'faq',
    titulo: 'Perguntas frequentes',
    ordem: 15,
    conteudo: `## Criei a conta, mas não vejo minhas atividades.
O seu login ainda não está ligado a um colaborador. Em Minha conta aparece "Aguardando vínculo". Peça ao coordenador para ligar em Configurações › Usuários.

## Por que o sistema pede justificativa ao mudar uma data?
Toda mudança de data já preenchida é auditada. A justificativa explica ao cliente por que o prazo mudou e aparece nos relatórios.

## Não consigo marcar a atividade como Finalizada.
Informe o Término real primeiro.

## Por que não consigo enviar as férias?
Veja os alertas em vermelho. Os motivos mais comuns são início fora de segunda ou terça, feriado nos 2 dias seguintes ou conflito crítico com colegas.

## Alterei férias aprovadas e elas voltaram para "Pendente". Está certo?
Sim. Toda alteração volta para aprovação. A versão aprovada anterior fica guardada no histórico.

## Esqueci a senha e o e-mail não chegou.
Confira o spam. Se não chegar, o coordenador redefine a senha em Configurações › Usuários.

## O lembrete não aparece no Windows.
Ative em Minha conta, use Edge ou Chrome e confira se as notificações do site estão permitidas. Use **Enviar teste** para checar.

## Fui afastado por atestado. Como lançar?
Use o ID 0510-0000 com a descrição "Afastado | Atestado". Esses dias não contam como carga e aparecem em roxo.

## A tela não atualizou depois de uma mudança no sistema.
Feche e abra o aplicativo, ou recarregue a página (Ctrl+F5). O sistema também recarrega sozinho quando detecta uma versão nova.`,
  },
  {
    id: 'glossario',
    titulo: 'Glossário',
    ordem: 16,
    conteudo: `- **AMP:** ArcelorMittal Pecém, cliente do contrato.
- **ID da atividade:** código do serviço na AMP (ex.: T2IDEA0017524).
- **0510-0000:** ID usado para afastamento, atestado, doença ou falta.
- **SE-PL-0510-CD001-R0:** relatório oficial de atividades do contrato, em Excel.
- **ADM-PF158:** formulário de solicitação de férias.
- **Centro de custo (CC):** código contábil da AMP (ex.: SP00-…) para onde as horas são apropriadas.
- **SEP:** número de solicitação de serviço, registrado na observação.
- **Documento AMP:** código de documento técnico ligado à atividade.
- **Estimativa / Realizado:** datas e horas planejadas e as que de fato aconteceram.
- **Dias úteis:** dias de segunda a sexta, sem feriados.
- **Carga / ocupação:** horas por dia de um colaborador somando as atividades em execução.
- **Sobrecarga:** carga acima do limite diário ou semanal das Configurações.
- **Reprogramação:** mudança de uma data já preenchida, sempre com justificativa.
- **Conflito de escala:** sobreposição de férias entre colegas acima do permitido.
- **Chamado RH:** pedido aberto no sistema do RH para formalizar as férias.
- **Conciliação:** conferência das férias do sistema com a planilha do RH.
- **Ver como:** recurso do coordenador para simular a visão de outro perfil.`,
  },
];

export interface TimeRow {
  id: string;
  atividade: string;
  manualMin: number;
  sistemaMin: number;
  volumeMes: number;
}

/** Valores iniciais do comparativo (estimativa, ajustável pelo coordenador). */
export const DEFAULT_TIME_ROWS: TimeRow[] = [
  { id: 'cadastro', atividade: 'Cadastrar uma atividade (serviço)', manualMin: 10, sistemaMin: 3, volumeMes: 80 },
  { id: 'status', atividade: 'Atualizar status, datas e horas', manualMin: 5, sistemaMin: 1, volumeMes: 300 },
  { id: 'consulta', atividade: 'Consultar a situação de um serviço ou colaborador', manualMin: 8, sistemaMin: 1, volumeMes: 60 },
  { id: 'relatorio', atividade: 'Gerar o relatório mensal SE-PL-0510 de um colaborador', manualMin: 60, sistemaMin: 5, volumeMes: 11 },
  { id: 'carga', atividade: 'Consolidar a carga da equipe (mapa de carga)', manualMin: 120, sistemaMin: 5, volumeMes: 4 },
  { id: 'historico', atividade: 'Buscar o histórico e a justificativa de uma mudança de data', manualMin: 20, sistemaMin: 1, volumeMes: 15 },
  { id: 'ferias', atividade: 'Pedir férias, conferir a escala e preencher o ADM-PF158', manualMin: 45, sistemaMin: 10, volumeMes: 3 },
  { id: 'conferencia', atividade: 'Conferir as férias com a planilha do RH', manualMin: 90, sistemaMin: 10, volumeMes: 1 },
];

/** Tópicos de cada módulo nos slides da apresentação (3 a 5). */
export const SLIDE_BULLETS: Record<string, string[]> = {
  painel: ['Atividades em aberto, em execução e atrasadas num só olhar', 'Carga do dia por colaborador, com alerta de sobrecarga e ociosidade', 'Próximas férias aprovadas da equipe (90 dias)', 'Cada perfil vê só o que lhe cabe'],
  atividades: ['Cadastro com ID AMP, solicitante, área, documentos e centro de custo', 'Horas calculadas por dias úteis (com feriados) ou informadas manualmente', 'Toda mudança de data exige justificativa e fica auditada', 'Filtros e busca por qualquer campo', 'Relatório oficial SE-PL-0510 em Excel com um clique'],
  importar: ['Lê a planilha oficial SE-PL-0510 inteira, inclusive abas ocultas', 'Compara planilha × sistema e mostra cada diferença', 'Importa só o que falta ou também as diferenças', 'Atestados e afastamentos entram como 0510-0000 automaticamente'],
  mapa: ['Gantt da equipe com ocupação diária em horas', 'Alertas de sobrecarga, atraso, férias e atestados', 'Agrupa por colaborador ou por área da usina', 'Exporta exatamente o que está na tela em PDF e Excel'],
  ferias: ['Pedido online nas modalidades da CLT, inclusive abono', 'Bloqueia início fora de segunda/terça e antes de feriado', 'Detecta conflitos de escala com os colegas antes do envio', 'Formulário ADM-PF158 gerado automaticamente', 'Mapa anual de férias da equipe'],
  aprovacoes: ['Fila única de pedidos com análise de conflito', 'Aprovar, pedir ajuste ou reprovar com parecer', 'Pedidos de cancelamento e acompanhamento do chamado RH', 'Histórico completo de cada decisão'],
  conciliacao: ['Compara as férias aprovadas com a planilha do RH', 'Aponta divergências de datas e ausências dos dois lados', 'Exporta o resultado em Excel e guarda o histórico'],
  relatorios: ['Horas estimadas × realizadas por colaborador e por centro de custo', 'Índice de cumprimento de prazo', 'Todas as justificativas de mudança de data do período', 'Relatório gerencial em Excel'],
  configuracoes: ['Logo, selos, limites de sobrecarga e feriados municipais', 'Colaboradores, centros de custo, usuários e convites', 'Lembretes diários e backup automático por e-mail', 'Desligar, reativar ou excluir colaboradores com segurança'],
  conta: ['Dados do usuário e colaborador vinculado', 'Tema claro ou escuro', 'Instalação como aplicativo e lembretes no Windows e no celular', 'Troca de senha'],
};

export const SLIDE_PROBLEM = [
  'Uma planilha por colaborador e por mês, trocada por e-mail',
  'Horas somadas à mão e relatórios montados um a um',
  'Mudanças de prazo sem registro do motivo nem de quem mudou',
  'Sem visão da carga da equipe: sobrecarga e ociosidade só aparecem tarde',
  'Férias pedidas por formulário em papel, sem checar a escala dos colegas',
];

export const SLIDE_SOLUTION = [
  'Base única na nuvem, atualizada em tempo real para toda a equipe',
  'Acesso pelo navegador, computador ou celular, com login corporativo',
  'Atividades, carga de trabalho, férias e relatórios integrados',
  'Regras do contrato e da CLT aplicadas automaticamente',
  'Três perfis: colaborador, coordenador e cliente ArcelorMittal',
];

export const SLIDE_BENEFITS: [string, string][] = [
  ['Controle', 'Situação de cada serviço e de cada pessoa em tempo real'],
  ['Rastreabilidade', 'Toda mudança de data com justificativa, usuário e horário'],
  ['Menos erros', 'Horas, dias úteis, feriados e regras de férias calculados pelo sistema'],
  ['Relatórios na hora', 'SE-PL-0510, ADM-PF158, mapa de carga e relatório gerencial em um clique'],
  ['Segurança', 'Acesso por perfil e backup diário automático'],
  ['Transparência', 'O cliente acompanha o andamento sem pedir planilhas'],
];
