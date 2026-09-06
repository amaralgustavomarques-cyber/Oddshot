# SureLine — guia para colocar no ar SEM usar terminal

Este guia assume que você nunca programou. Vamos usar dois sites gratuitos:
**GitHub** (guarda o código) e **Vercel** (publica o site). Tudo por clique,
sem instalar nada no seu computador.

---

## Parte 1 — Pegar a chave da API de odds

1. Acesse https://the-odds-api.com e crie uma conta gratuita.
2. Depois de logar, copie a **API key** que aparece no seu painel. Guarde
   esse texto — vamos usar mais adiante.

---

## Parte 2 — Colocar o código no GitHub

1. Acesse https://github.com e crie uma conta gratuita (se ainda não tiver).
2. Clique no **+** no canto superior direito → **New repository**.
3. Dê um nome (ex.: `surepline`) → deixe como **Public** → clique em
   **Create repository**.
4. Na página do repositório recém-criado, clique em **"uploading an existing
   file"** (ou **Add file → Upload files**).
5. Abra a pasta deste projeto no seu computador (a que eu te entreguei) e
   **arraste a pasta inteira** para dentro da janela do navegador, na área de
   upload do GitHub. Ele preserva as subpastas (`app/`, `lib/` etc.)
   automaticamente.
6. Role a página até o final e clique em **Commit changes**.

Pronto — seu código está no GitHub.

---

## Parte 3 — Publicar com a Vercel

1. Acesse https://vercel.com e crie uma conta gratuita **usando o login do
   GitHub** (botão "Continue with GitHub") — isso já conecta as duas contas.
2. Clique em **Add New → Project**.
3. Vercel vai listar seus repositórios do GitHub — clique em **Import** no
   repositório que você acabou de criar (`surepline`).
4. Antes de clicar em "Deploy", abra a seção **Environment Variables**:
   - Name: `ODDS_API_KEY`
   - Value: cole a chave que você copiou na Parte 1
   - Clique em **Add**.
5. Clique em **Deploy**. Espere 1-2 minutos.
6. Quando terminar, a Vercel te dá um link tipo
   `https://surepline.vercel.app` — esse é o seu site, funcionando de
   verdade, de qualquer navegador ou celular.

---

## Se algo der errado no Deploy

A Vercel mostra um log de erro na tela. Os problemas mais comuns:

- **"Module not found"** → algum arquivo não foi enviado certo no upload do
  GitHub (confira se as pastas `app/api/odds/` e `lib/providers/` estão
  todas lá dentro do repositório, não só na raiz).
- **Site abre mas mostra "ODDS_API_KEY não configurada"** → volte no painel
  da Vercel → seu projeto → **Settings → Environment Variables** e confira
  se a chave foi salva certinho. Depois clique em **Deployments → ⋯ →
  Redeploy**.

## Depois de publicado

- Toda vez que você quiser mudar algo no código, edita direto pela interface
  web do GitHub (clique no arquivo → ícone de lápis → salva) — a Vercel
  detecta e republica sozinha em ~1 minuto.
- Os esportes monitorados por padrão estão em `app/api/odds/route.ts`,
  variável `DEFAULT_SPORT_KEYS`. Para ver todas as chaves disponíveis, acesse
  no navegador (trocando SUA_CHAVE):
  `https://api.the-odds-api.com/v4/sports?apiKey=SUA_CHAVE`

## Provedores alternativos (opcional)

O projeto já vem com 3 adapters de odds prontos, escolhidos pela URL:

- `/api/odds` (padrão) → **The Odds API** — já testado e funcionando,
  cobertura internacional (EU/UK/US), casas gringas filtradas automaticamente.
- `/api/odds?provider=oddspapi` → **OddsPapi** — mais chance de cobrir o
  Brasileirão de verdade. Pra usar: crie conta em https://oddspapi.io, pegue
  a API key, adicione `ODDS_PAPI_KEY` nas Environment Variables da Vercel.
  ⚠️ Esse adapter foi montado com base na documentação oficial e em testes
  parciais dos endpoints — ainda não confirmamos uma chamada completa
  ponta a ponta trazendo odds de casas brasileiras específicas (KTO,
  Betnacional etc.). Teste `/api/odds?provider=oddspapi` depois do deploy e,
  se algo vier estranho, me manda a resposta que a gente ajusta.
- `/api/odds?provider=odds-api-io` → **Odds-API.io** — no momento (set/2026)
  eles pausaram a emissão de novas chaves gratuitas, então só usa essa opção
  se você já tiver uma chave ou eles reabrirem o cadastro.

Pra trocar qual provedor é o padrão do site (sem precisar digitar `?provider=`
toda vez), edita a linha `?? "the-odds-api"` no topo de
`app/api/odds/route.ts` e troca pelo nome do provider que preferir.

