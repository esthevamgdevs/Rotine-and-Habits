# Guia completo — publicar o Rotina com notificações reais

Segue tudo em ordem. Dá pra fazer inteiro pelo navegador (sem terminal), exceto o passo 5 se preferir usar CLI em vez do editor do painel.

---

## 1. Hospedar os arquivos no GitHub Pages

1. Entre em **github.com** e faça login (ou crie conta grátis).
2. Clique no **+** (canto superior direito) → **New repository**.
3. Nome: `rotina-app` (ou o que preferir). Pode ser **Private**. Clique **Create repository**.
4. Na página do repositório: **Add file** → **Upload files**.
5. Arraste os 5 arquivos: `rotina.html`, `manifest.json`, `service-worker.js`, `icon-192.png`, `icon-512.png`. Clique **Commit changes**.
6. Vá em **Settings** (do repositório) → **Pages** (menu lateral).
7. Em "Build and deployment" → Source: **Deploy from a branch** → Branch: **main** / **(root)** → **Save**.
8. Espere ~1 minuto. Vai aparecer uma URL tipo:
   `https://SEU-USUARIO.github.io/rotina-app/`
   O app fica em: `https://SEU-USUARIO.github.io/rotina-app/rotina.html`

⚠️ É essa URL que você vai usar daqui pra frente — não abra mais o arquivo local.

---

## 2. Criar/confirmar o projeto Supabase

Se ainda não tem um projeto Supabase (usado na sincronização):
1. **supabase.com** → login → **New project**.
2. Nome, senha do banco, região (se aparecer, **São Paulo** dá menor latência) → **Create new project**. Leva ~2 min.

---

## 3. Rodar o SQL das tabelas

1. No painel do projeto, menu lateral → **SQL Editor** → **New query**.
2. Cole o conteúdo do arquivo `supabase-notificacoes-setup.sql` **exceto o bloco final `select cron.schedule(...)`** (esse você roda só no passo 6, depois de editar).
3. Clique **Run**.

---

## 4. Ativar as extensões pg_cron e pg_net

1. Menu lateral → **Database** → **Extensions**.
2. Busque **pg_cron** → ative o toggle.
3. Busque **pg_net** → ative o toggle.

---

## 5. Publicar a Edge Function `check-pendencias`

**Opção A — pelo painel (sem terminal):**
1. Menu lateral → **Edge Functions** → **Create a new function**.
2. Nome: `check-pendencias`.
3. Apague o código padrão e cole o conteúdo do arquivo `check-pendencias.ts`.
4. Clique **Deploy**.

**Opção B — via linha de comando** (se preferir, ou se o editor do painel não aceitar a função):
```
npm install -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions new check-pendencias
# substitua o conteúdo gerado pelo de check-pendencias.ts
supabase functions deploy check-pendencias --no-verify-jwt
```

---

## 6. Configurar os segredos (chaves VAPID)

1. Menu lateral → **Edge Functions** → aba **Secrets** (ou **Project Settings → Edge Functions**).
2. Adicione:
   - `VAPID_PUBLIC_KEY` = `BMxlwsZ9T4PRWZy6D5z4mEqssWlmxSDJFYrHZ8oDcobuiew8po7n0GQUFQ6zSdYoPQb9mAmqNZOAcz3rkkylIIk`
   - `VAPID_PRIVATE_KEY` = `u1mOch3_JgV7srwCD9DLx0MD42VP6LP3m_cBTwZrW-s`

(`SUPABASE_URL` e a service role key já ficam disponíveis automaticamente dentro da função — não precisa configurar.)

---

## 7. Agendar a checagem a cada 15 minutos

1. Pegue duas informações em **Project Settings → API**:
   - **Project Reference** (aparece na Project URL: `https://SEU_REF.supabase.co`)
   - **service_role key** (em "Project API keys" — é secreta, não confunda com a `anon public`)
2. Volte ao **SQL Editor** → **New query** e cole, substituindo os dois valores:
```sql
select cron.schedule(
  'check-pendencias-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU_REF.functions.supabase.co/check-pendencias',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```
3. Clique **Run**.
4. Pra conferir que ficou agendado: `select * from cron.job;`

---

## 8. Configurar o app e ativar notificações em cada aparelho

**No Mac:**
1. Abra a URL do GitHub Pages (`.../rotina.html`) no navegador.
2. Clique na engrenagem ⚙ → cole a **Project URL** e a **anon public key** do Supabase (Project Settings → API) e um **código do espaço** (uma palavra qualquer, ex: `esthevam-rotina`) → **Salvar e sincronizar**.
3. Ainda no mesmo modal, clique **Ativar notificações neste aparelho** → permita quando o navegador pedir.

**No iPhone:**
1. Abra a mesma URL no **Safari**.
2. Toque em Compartilhar → **Adicionar à Tela de Início**.
3. Abra o app **pelo ícone da Tela de Início** (não pelo Safari) — isso é obrigatório pra notificação funcionar no iOS.
4. Engrenagem ⚙ → cole os **mesmos 3 valores** de sincronização (Project URL, anon key, e o **mesmo código do espaço** usado no Mac) → **Salvar e sincronizar**.
5. **Ativar notificações neste aparelho** → permita quando pedir.

Pronto — tarefas atrasadas avisam na hora que a checagem rodar (até 15 min de atraso), e hábitos/rotinas não feitos avisam a partir das 20h.
