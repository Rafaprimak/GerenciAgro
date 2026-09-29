# GerenciAgro

App de celular (PWA) para interpretar análise de solo e recomendar calagem e adubação,
seguindo o **Manual de Adubação e Calagem para o Estado do Paraná**.
Funciona **sem internet**. Quando a conexão volta, sincroniza os dados com o servidor.

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

## Rodar

Requer Node.js 22.5 ou mais novo (usa o SQLite embutido do Node).

```bash
npm install      # instala e copia pdf.js e OCR para public/vendor
npm start        # http://localhost:3000
npm test         # testes de cálculo, leitura de PDF e sincronização
```

Variáveis de ambiente (opcionais):

| Variável | Para quê |
|---|---|
| `PORT` | Porta do servidor (padrão 3000) |
| `SYNC_TOKEN` | Senha exigida para sincronizar. Informe a mesma em Ajustes → Chave de acesso |
| `ANTHROPIC_API_KEY` | Ativa a leitura de fotos por IA (Claude). Sem ela, fotos usam só o OCR offline |
| `DB_FILE` | Caminho do banco SQLite (padrão `data/gerenciagro.db`) |

## Publicado na Cloudflare

O app está no ar em **https://gerenciagro.rafaprimak1.workers.dev**
(Cloudflare Workers + banco D1, plano gratuito). A chave de sincronização está no arquivo
`.chave-sincronizacao` (fora do git).

Link de convite, que já configura a chave no aparelho:
`https://gerenciagro.rafaprimak1.workers.dev/?chave=<CHAVE>`

**Publicação automática:** o Worker está ligado ao repositório no GitHub (Workers Builds).
Todo `git push` na branch `main` faz a Cloudflare instalar as dependências e rodar `npx wrangler deploy`.
Se criar uma migração nova em `migrations/`, aplique no banco antes do push:
`npx wrangler d1 migrations apply gerenciagro --remote`.

Comandos manuais:

```bash
npm run cf:deploy                                # publica direto do PC (aplica migrações e sobe o app)
npm run cf:dev                                   # roda o Worker localmente, com banco D1 simulado
npx wrangler secret put SYNC_TOKEN               # troca a chave de sincronização
npx wrangler secret put ANTHROPIC_API_KEY        # ativa a leitura de fotos por IA
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
  js/data/           tabelas do manual (interpretação, culturas, adubos)
  js/extract/        leitura de PDF/foto
  js/store.js        banco local (IndexedDB)
  js/sync.js         sincronização
  sw.js              cache para uso offline
server/            servidor local (Express + SQLite + leitura por IA)
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
