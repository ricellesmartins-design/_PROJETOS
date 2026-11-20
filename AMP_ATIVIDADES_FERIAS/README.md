# Gestão de Atividades e Férias · Contrato AMP (IDG Engenharia)

Aplicação web (React + TypeScript + Tailwind) para a equipe IDG Engenharia no contrato ArcelorMittal Pecém:
atividades no padrão **SE-PL-0510-CD001-R0**, mapa de carga (Gantt + heatmap), férias com motor de conflitos,
aprovação e formulário **ADM-PF158**, conciliação com o RH, relatórios executivos, lembretes no Windows e backup por e-mail.

- **Frontend:** Vite + React 18 + TS + Tailwind + lucide-react; Excel gerado direto no OpenXML (jszip) a partir dos modelos originais.
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Edge Functions + pg_cron), plano gratuito.
- **Publicação:** GitHub Pages (workflow `.github/workflows/deploy-amp.yml`), instalável no Windows como aplicativo (PWA).

## Perfis

| Perfil | Quem | Pode |
|---|---|---|
| Coordenador | ricelles@idg.global.com, ricelles@idg-eng.com | tudo: aprovar férias, importar Excel, conciliação RH, configurações, usuários |
| Colaborador IDG | e-mails @idg-eng.com, @idg.global, @idg.global.com | as próprias atividades e férias |
| Cliente ArcelorMittal | e-mails @arcelormittal.com | visualizar atividades/mapa e exportar relatórios |

Outros domínios são bloqueados no app, na Edge Function `signup` e por trigger no `auth.users`.

## Regras garantidas no servidor (não dependem do navegador)

- **RLS** por perfil em todas as tabelas.
- **Auditoria de datas** (`activities_audit`): alterar Estimativa de Início/Término ou Início/Término Real de uma atividade
  exige justificativa (mín. 10 caracteres); cada alteração grava usuário, data/hora, campo, valor anterior, novo e justificativa.
- **Férias** (`vacations_rules`): toda alteração do colaborador (datas, modalidade ou observação), inclusive em férias já aprovadas,
  volta para *Pendente* e guarda a versão aprovada anterior. Só o coordenador aprova, reprova ou pede ajuste.
  Cancelar férias aprovadas vira *Cancelamento Solicitado*. Alterar só o chamado RH não reinicia a aprovação.

## Estrutura

```
src/
  pages/        telas (Painel, Atividades, Importar/Comparar Excel, Mapa de Carga, Férias, Aprovações,
                Conciliação RH, Relatórios, Configurações, Minha conta)
  services/     regras de negócio (atividades, férias/conflitos, importação, RH)
  excel/        exportação SE-PL-0510 e ADM-PF158, leitura de planilhas
  lib/          Supabase, cache em tempo real, autenticação, datas/feriados, push, instalação PWA
  templates/    modelos sanitizados das planilhas originais + logo/selos padrão
public/         service worker (cache + notificações), manifest e ícones
supabase/
  migrations/   schema, RLS, triggers, cron (os segredos NÃO estão no repositório)
  functions/    signup (cadastro + reset de senha), notify (lembretes push), backup (e-mail)
tests/          testes das regras (vitest)
```

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # regras de férias, conflitos, horas e auditoria
npm run build    # gera dist/
```

As variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (chave *publishable*) e `VITE_VAPID_PUBLIC` estão em `.env.production`/`.env.development`.
São públicas por natureza; a proteção dos dados é feita pelo RLS.

## Publicação (GitHub Pages)

1. No GitHub: **Settings › Pages › Build and deployment › Source: GitHub Actions** (uma vez).
2. Cada push na branch `main` que altere `AMP_ATIVIDADES_FERIAS/` roda testes, build e publica em
   `https://ricellesmartins-design.github.io/_PROJETOS/`.

## Instalar no Windows

Abrir o endereço no Edge ou Chrome › *Minha conta e lembretes* › **Instalar aplicativo**
(ou menu do navegador › Aplicativos › Instalar este site como um aplicativo). Depois, em **Ativar lembretes**.

## Lembretes diários

`pg_cron` chama a função `notify` a cada 30 min em dias úteis; ela envia push apenas nos horários configurados
(padrão **10:00 e 16:00**, Brasília) para colaboradores com serviços em aberto. Horários em *Configurações*.

## Backup por e-mail

`pg_cron` chama a função `backup` diariamente às 06:00 (Brasília): JSON completo + CSV de atividades e férias,
enviado para o e-mail de *Configurações* (padrão ricellesmartins@gmail.com) via [Resend](https://resend.com).
Requer o segredo `RESEND_API_KEY` em *Supabase › Edge Functions › Secrets*. Também há "Enviar backup agora" e "Baixar backup (JSON)".

## Recriar o backend do zero

1. Criar projeto Supabase e aplicar `supabase/migrations/*.sql` em ordem (substituir `<VAPID_...>` e `<CRON_SECRET>` no 005
   e a URL do projeto no 006).
2. Publicar as funções: `supabase functions deploy signup --no-verify-jwt`, `notify --no-verify-jwt`, `backup --no-verify-jwt`.
3. Criar as contas de coordenador e cadastrar colaboradores/centros de custo (ou importar pelo app).
