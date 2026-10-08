# GerenciAgro

App de celular (PWA) para interpretar análise de solo e recomendar calagem e adubação,
seguindo o **Manual de Adubação e Calagem para o Estado do Paraná**.
Funciona **sem internet**. Quando a conexão volta, sincroniza os dados com o servidor.
Cada pessoa tem a **própria conta** (e-mail e senha): as análises e os preços de um usuário
não aparecem para os outros.

## O que o app faz (os 7 passos da planilha)

1. **Entrada do laudo**: foto, PDF ou digitação. PDF da Laborsolo é lido 100% offline.
   Foto: lida por IA quando há internet (se configurada) ou por OCR no próprio celular.
   Os valores lidos ficam em destaque para conferência.
2. **Nível de cada nutriente** pelas tabelas 3.2 a 3.5 do manual (o P usa a classe de argila).
3. **Necessidade da cultura** (N, P₂O₅, K₂O) pela tabela da cultura. Usa a média da faixa.
   Culturas: Panicum, Cynodon (Tifton), Braquiária, Aveia, Azevém, Milheto e Milho silagem.
4. **Conversão em adubo** (P₂O₅ em SFS/SFT/MAP/DAP, K₂O em KCl, N em ureia/sulfato)
   e escolha da **combinação mais barata** com os preços cadastrados. O N do MAP/DAP é descontado.
5. e 6. **Calagem**: NC (t/ha) = (V2 − V1) × CTC ÷ PRNT (PRNT padrão 90, editável).
7. **Relação Ca/Mg**: acima de 3:1 → calcário dolomítico; senão → calcítico.

Gera o **relatório** no formato do exemplo da planilha (por área + resumo operacional),
que pode ser impresso/salvo em PDF ou compartilhado no WhatsApp.

## Planejamento forrageiro

Menu **Forragem**. Faz o que a planilha *Planejamento Forrageiro* v2.2.4 (UFPR, Prof. Anibal de Moraes) faz,
nos cenários **atual** e **proposto**:

1. **Pastagens**: forrageira (26 da tabela da planilha), condição (degradada/média/ótima), área e aproveitamento
   → produção de matéria seca mês a mês, pela distribuição do Sul ou do Norte do Paraná.
2. **Rebanho**: 8 categorias com nº de animais, mês de entrada, peso inicial/final, consumo (% PV) e ganho por estação
   → consumo mês a mês (o animal sai do pasto ao passar do peso final).
3. **Balanço**: oferta x demanda por mês e por estação, meses com falta de pasto, capacidade de suporte
   e lotação (U.A./ha), gráfico e comparação atual x proposto. Imprime/salva em PDF e compartilha o resumo.

O cálculo (`public/js/forragem.js`) segue as fórmulas da planilha à risca e foi conferido contra o Excel
em dois casos (`test/forragem.test.js`), inclusive nas particularidades dela: a produção por hectare vem sempre
da tabela do Sul (a região muda só a distribuição mensal), o consumo total não soma as novilhas adultas,
a lotação prática usa U.A. de 450 kg e a área do cenário atual, a lotação teórica é a média simples das pastagens,
campo em branco vale zero e são no máximo 5 pastagens.

## Rodar

Requer Node.js 22.5 ou mais novo (usa o SQLite embutido do Node).

```bash
npm install      # instala e copia pdf.js e OCR para public/vendor
npm start        # http://localhost:3000
npm test         # testes de cálculo, leitura de PDF, contas e sincronização
```

Variáveis de ambiente. As chaves ficam **só no servidor** (segredos da Cloudflare ou `.dev.vars`,
fora do git); o app no celular nunca recebe nenhuma delas.

| Variável | Para quê |
|---|---|
| `DATA_KEY` | **Obrigatória.** Chave que cifra os dados no banco (base64 de 32 bytes). No Node, se faltar, é criada em `data/chave-dados`. **Perder essa chave = perder os dados do servidor**: guarde uma cópia |
| `ANTHROPIC_API_KEY` | Ativa a leitura de fotos por IA (Claude). Sem ela, fotos usam só o OCR offline |
| `RESEND_API_KEY` | Envia o e-mail de "esqueci a senha" pelo [Resend](https://resend.com). Sem ela, o link aparece no log do servidor |
| `EMAIL_FROM` | Remetente do e-mail, ex.: `GerenciAgro <nao-responda@seudominio.com.br>` (domínio verificado no Resend) |
| `APP_URL` | Endereço do app usado no link do e-mail (padrão: o endereço da requisição; no Node, `http://localhost:PORT`) |
| `PORT` | Porta do servidor Node (padrão 3000) |
| `DB_FILE` | Caminho do banco SQLite do Node (padrão `data/gerenciagro.db`) |

Gerar uma `DATA_KEY`: `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`

## Contas e segurança

- **Entrar, criar conta, esqueci a senha** (link por e-mail, vale 30 min, uso único) e **trocar senha** em Ajustes.
- **Senha**: nunca trafega nem é guardada como digitada. O aparelho aplica PBKDF2-SHA256 com 600 mil rodadas;
  o servidor aplica outro PBKDF2 com sal aleatório por cima.
- **Sessão**: cookie `HttpOnly`, `Secure`, `SameSite=Strict`, 60 dias. O banco guarda só o SHA-256 do token.
  Trocar ou redefinir a senha encerra as sessões nos outros aparelhos.
- **Dados no servidor**: cifrados com AES-256-GCM, chave própria de cada usuário (derivada da `DATA_KEY`).
  Cada usuário só lê e grava os próprios registros.
- **Dados no celular**: um banco local separado por usuário; ao **sair da conta**, os dados dela são apagados do aparelho
  (o app avisa se ainda há alterações não enviadas).
- **Limites**: 10 senhas erradas por e-mail a cada 15 min, cadastros e pedidos de senha limitados por IP,
  60 leituras por IA por hora por usuário (protege o custo da chave da IA).
- **Dados de antes das contas**: ao entrar pela primeira vez, o app oferece passar para a conta as análises
  que já estavam no aparelho. No servidor, os registros antigos ficam sem dono (`user_id = ''`) e não aparecem para ninguém.

## Publicado na Cloudflare

O app está no ar em **https://gerenciagro.rafaprimak1.workers.dev**
(Cloudflare Workers + banco D1, plano gratuito). Cada pessoa cria a própria conta no app.

**Publicação automática:** o Worker está ligado ao repositório no GitHub (Workers Builds).
Todo `git push` na branch `main` faz a Cloudflare instalar as dependências e rodar `npx wrangler deploy`.
Se criar uma migração nova em `migrations/`, aplique no banco antes do push:
`npx wrangler d1 migrations apply gerenciagro --remote`.

Comandos manuais:

```bash
npm run cf:deploy                                # publica direto do PC (aplica migrações e sobe o app)
npm run cf:dev                                   # roda o Worker localmente, com banco D1 simulado
npx wrangler secret put DATA_KEY                 # chave que cifra os dados (obrigatória, não trocar depois)
npx wrangler secret put ANTHROPIC_API_KEY        # ativa a leitura de fotos por IA
npx wrangler secret put RESEND_API_KEY           # envia o e-mail de "esqueci a senha"
npx wrangler secret put EMAIL_FROM               # remetente do e-mail
npx wrangler d1 execute gerenciagro --remote --command "SELECT COUNT(*) FROM records"   # consulta o banco
```

Ao mudar arquivos do app, aumente `VERSAO` em `public/sw.js` para os celulares receberem a atualização.

## Usar no celular

O navegador só permite instalar o app e usar offline em endereço **HTTPS**.
Publique o servidor em uma hospedagem Node com HTTPS (Render, Railway, Fly.io, VPS com
Caddy/Nginx etc.) e abra o endereço no celular:

- Android (Chrome): menu ⋮ → **Instalar app**
- iPhone (Safari): Compartilhar → **Adicionar à Tela de Início**

Depois de aberto uma vez, o app funciona sem internet. Em Ajustes, use
**Preparar OCR offline** para também ler fotos sem internet.

## Estrutura

```
public/            app (roda no celular)
  js/calc.js         motor de cálculo (passos 2 a 7)
  js/forragem.js     planejamento forrageiro (oferta x demanda de pasto)
  js/data/           tabelas do manual (interpretação, culturas, adubos) e das forrageiras
  js/extract/        leitura de PDF/foto
  js/store.js        banco local (IndexedDB), um por usuário
  js/sync.js         sincronização
  js/auth.js         conta (entrar, cadastro, senha)
  sw.js              cache para uso offline
server/api.js      rotas /api (contas, sync, IA), as mesmas no Node e na Cloudflare
server/seguranca.js  hash de senha, tokens e cifra dos dados
server/            servidor local (Express + SQLite)
worker/            servidor na Cloudflare (Workers + D1)
migrations/        estrutura do banco D1
test/              testes
DOCS/              material de referência
```

Para incluir uma cultura nova, copie um bloco em `public/js/data/culturas.js`
(o formato está comentado no topo do arquivo) e rode `npm test`, que confere o formato das tabelas.

## Limites conhecidos

- **OCR offline de foto** é de melhor esforço: laudos com números dentro de caixas ou em
  mostradores (tipo relógio) são lidos mal. Com internet, a leitura por IA resolve.
  Com o PDF do laboratório, a leitura é exata.
- Panicum e Cynodon não têm dose de **N de implantação** nas páginas fotografadas do manual;
  o app avisa e permite digitar a dose.
- Os **preços** dos adubos vêm com valores de exemplo: atualize em "Adubos".
