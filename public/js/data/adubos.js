// Adubos e corretivos padrão (editáveis na tela "Adubos e preços").
// Garantias em % do produto. Preços em R$ por tonelada: valores de exemplo, atualize com a cotação real.

export const ADUBOS_PADRAO = [
  { id: 'ssp', nome: 'Superfosfato simples', sigla: 'SFS', N: 0, P2O5: 18, K2O: 0, Ca: 16, S: 10, preco: 1500, ativo: true },
  { id: 'tsp', nome: 'Superfosfato triplo', sigla: 'SFT', N: 0, P2O5: 42, K2O: 0, Ca: 10, S: 0, preco: 3000, ativo: true },
  { id: 'map', nome: 'MAP (11-52-00)', sigla: 'MAP', N: 11, P2O5: 52, K2O: 0, Ca: 0, S: 0, preco: 3900, ativo: true },
  { id: 'dap', nome: 'DAP (18-46-00)', sigla: 'DAP', N: 18, P2O5: 46, K2O: 0, Ca: 0, S: 0, preco: 3700, ativo: true },
  { id: 'kcl', nome: 'Cloreto de potássio', sigla: 'KCl', N: 0, P2O5: 0, K2O: 60, Ca: 0, S: 0, preco: 2200, ativo: true },
  { id: 'ureia', nome: 'Ureia', sigla: 'Ureia', N: 45, P2O5: 0, K2O: 0, Ca: 0, S: 0, preco: 2800, ativo: true },
  { id: 'sa', nome: 'Sulfato de amônio', sigla: 'SA', N: 22, P2O5: 0, K2O: 0, Ca: 0, S: 22, preco: 1700, ativo: true },
];

export const CONFIG_PADRAO = {
  id: 'config',
  adubos: ADUBOS_PADRAO,
  calcario: {
    prnt: 90, // PRNT padrão do calcário (%)
    precoCalcitico: 250, // R$/t
    precoDolomitico: 250, // R$/t
  },
  relacaoCaMgAlvo: 3, // Ca:Mg ideal ~3:1
  descontarNdoFosfatado: true, // N do MAP/DAP abate a necessidade de N
};
