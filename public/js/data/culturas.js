// Necessidade de nutrientes por cultura
// Fonte: Manual de Adubação e Calagem para o Estado do Paraná, Capítulo 11.
//
// Formato das faixas: '61-80' (usa a média, 70), '0' (sem adubação) ou 'inv' (inviável).
// Tabelas de P2O5/K2O por produtividade: 6 linhas (Muito baixo, Baixo, Médio, Alto,
// Muito alto, Condição a evitar) x N colunas (classes de produtividade).
// Para adicionar uma cultura nova basta seguir o mesmo formato.

const OBJ_PASTEJO_FENO = {
  id: 'objetivo', label: 'Objetivo', valores: [
    { id: 'pastejo', label: 'Pastejo' },
    { id: 'feno', label: 'Feno' },
  ],
};
const OBJ_PASTEJO_SILAGEM_FENO = {
  id: 'objetivo', label: 'Objetivo', valores: [
    { id: 'pastejo', label: 'Pastejo' },
    { id: 'silagem', label: 'Silagem / Feno' },
  ],
};

const NOTA_N_PARCELAR = 'N: dose única até 150 kg/ha no início do rebrote (normalmente na primavera). Acima de 150 kg/ha, aplicar 150 no início do rebrote e o restante 30 a 45 dias depois.';
const NOTA_P_LANCO = 'P: aplicar o adubo a lanço, durante a época de pastejo ou corte da forrageira.';
const NOTA_IMPLANT_PK = 'Doses de P₂O₅ acima de 90 kg/ha podem ser feitas combinando fosfatos acidulados com fosfatos naturais reativos ou termofosfato. Com teores baixos ou muito baixos, aplicar a lanço e incorporar com aração e gradagem até 20 cm.';

export const CULTURAS = [
  {
    id: 'panicum',
    nome: 'Panicum spp.',
    descricao: 'Mombaça, Tanzânia, Aruana, Zuri...',
    grupo: 'Forrageira perene',
    vAlvo: 60,
    extracao: { unidade: 'kg/t MS', N: 20.3, P: 3, K: 22, Ca: 6.2, Mg: 1.4, S: 2.9 },
    modalidades: {
      implantacao: {
        label: 'Implantação',
        tabelas: 'Tabela 11.32',
        P2O5: ['111-120', '91-110', '71-90', '51-70', '40-50', '0'],
        K2O: {
          le400: ['56-65', '46-55', '36-45', '26-35', '15-25', '0'],
          gt400: ['111-130', '91-110', '71-90', '51-70', '30-50', '0'],
        },
        N: null,
        notas: [NOTA_IMPLANT_PK],
      },
      manutencao: {
        label: 'Manutenção (pastejo contínuo)',
        tabelas: 'Tabelas 11.33, 11.34 e 11.35',
        prodLabel: 'Produtividade de matéria seca esperada (t/ha/ano)',
        prod: ['< 10', '10-17', '18-25', '> 25'],
        opcao: OBJ_PASTEJO_FENO,
        N: {
          feno: ['100-150', '151-200', '201-300', '301-400'],
          pastejo: ['50-75', '76-100', '101-150', '151-200'],
        },
        P2O5: [
          ['61-80', '81-100', '101-120', '121-140'],
          ['41-60', '61-80', '81-100', '101-120'],
          ['20-40', '41-60', '61-80', '81-100'],
          ['0', '20-40', '41-60', '61-80'],
          ['0', '0', '20-40', '41-60'],
          ['0', '0', '0', '0'],
        ],
        K2O: [
          ['61-75', '76-90', '91-105', '106-120'],
          ['46-60', '61-75', '76-90', '91-105'],
          ['30-45', '46-60', '61-75', '76-90'],
          ['0', '30-45', '46-60', '61-75'],
          ['0', '0', '30-45', '46-60'],
          ['0', '0', '0', '0'],
        ],
        multiplicador: { feno: { P2O5: 2.5, K2O: 3.0 } },
        notas: [
          NOTA_N_PARCELAR,
          NOTA_P_LANCO,
          'K: se o teor cair de alto para baixo ou muito baixo, aplicar 20 kg/ha de K₂O a mais por tonelada de MS produzida, até o teor voltar ao nível alto.',
          'K: parcelar doses de K₂O acima de 100 kg/ha em no mínimo 2 vezes (argila > 400 g/kg) ou 3 vezes (argila < 400 g/kg).',
        ],
      },
    },
  },
  {
    id: 'cynodon',
    nome: 'Cynodon spp.',
    descricao: 'Tifton, Coastcross, Jiggs...',
    grupo: 'Forrageira perene',
    vAlvo: 60,
    extracao: { unidade: 'kg/t MS', N: 20.1, P: 2.9, K: 24.5, Ca: 4.4, Mg: 1.9, S: 3.2 },
    modalidades: {
      implantacao: {
        label: 'Implantação',
        tabelas: 'Tabela 11.26',
        P2O5: ['111-130', '91-110', '71-90', '51-70', '30-50', '0'],
        K2O: {
          le400: ['56-65', '46-55', '36-45', '26-35', '10-25', '0'],
          gt400: ['111-130', '91-110', '71-90', '51-70', '30-50', '0'],
        },
        N: null,
        notas: [NOTA_IMPLANT_PK],
      },
      manutencao: {
        label: 'Manutenção (pastejo contínuo)',
        tabelas: 'Tabelas 11.27, 11.28 e 11.29',
        prodLabel: 'Produtividade de matéria seca esperada (t/ha/ano)',
        prod: ['< 10', '10-15', '16-20', '> 20'],
        opcao: OBJ_PASTEJO_FENO,
        N: {
          feno: ['100-150', '151-200', '201-300', '301-400'],
          pastejo: ['50-75', '76-100', '101-150', '151-200'],
        },
        P2O5: [
          ['51-60', '61-70', '71-80', '81-90'],
          ['41-50', '51-60', '61-70', '71-80'],
          ['31-40', '41-50', '51-60', '61-70'],
          ['20-30', '31-40', '41-50', '51-60'],
          ['0', '0', '30-40', '41-50'],
          ['0', '0', '0', '0'],
        ],
        K2O: [
          ['51-65', '66-80', '81-95', '96-110'],
          ['36-50', '51-65', '66-80', '81-95'],
          ['20-35', '36-50', '51-65', '66-80'],
          ['0', '20-35', '36-50', '51-65'],
          ['0', '0', '20-35', '36-50'],
          ['0', '0', '0', '0'],
        ],
        multiplicador: { feno: { P2O5: 2.5, K2O: 3.0 } },
        notas: [
          'N: as doses podem ser reduzidas à metade em áreas consorciadas com leguminosas, em especial trevos.',
          NOTA_N_PARCELAR,
          NOTA_P_LANCO,
          'K: se o teor cair de alto para baixo ou muito baixo, aplicar 25 kg/ha de K₂O a mais por tonelada de MS produzida, até o teor voltar ao nível alto.',
          'K: doses acima de 100 kg/ha de K₂O parceladas no mínimo em 2 vezes (argila > 400 g/kg) ou 3 vezes (argila < 400 g/kg).',
        ],
      },
    },
  },
  {
    id: 'braquiaria',
    nome: 'Braquiária',
    descricao: 'Urochloa (Brachiaria) spp.',
    grupo: 'Forrageira perene',
    vAlvo: 60,
    extracao: { unidade: 'kg/t MS', N: 20.3, P: 1.5, K: 5.0, Ca: 5.3, Mg: 3.3, S: 3.1 },
    modalidades: {
      implantacao: {
        label: 'Implantação',
        tabelas: 'Tabela 11.16',
        P2O5: ['111-130', '91-110', '71-90', '51-70', '30-50', '0'],
        K2O: {
          le400: ['56-65', '46-55', '36-45', '26-35', '15-25', '0'],
          gt400: ['111-130', '91-110', '71-90', '51-70', '30-50', '0'],
        },
        N: '50',
        notas: [
          'N: aplicar 50 kg/ha de N a lanço logo após a semeadura, com temperatura e umidade do solo favoráveis.',
          NOTA_IMPLANT_PK,
        ],
      },
      manutencao: {
        label: 'Manutenção (pastejo contínuo)',
        tabelas: 'Tabelas 11.17, 11.18 e 11.19',
        prodLabel: 'Produtividade de matéria seca esperada (t/ha/ano)',
        prod: ['< 9', '9-12', '13-16', '> 16'],
        opcao: OBJ_PASTEJO_FENO,
        N: {
          feno: ['100-150', '151-250', '251-350', '351-450'],
          pastejo: ['50-75', '76-125', '126-175', '176-225'],
        },
        P2O5: [
          ['31-35', '36-40', '41-45', '46-50'],
          ['26-30', '31-35', '36-40', '41-45'],
          ['20-25', '26-30', '31-35', '36-40'],
          ['0', '20-25', '26-30', '31-35'],
          ['0', '0', '0', '0'],
          ['0', '0', '0', '0'],
        ],
        K2O: [
          ['31-35', '36-40', '41-45', '46-50'],
          ['26-30', '31-35', '36-40', '41-45'],
          ['20-25', '26-30', '31-35', '36-40'],
          ['0', '20-25', '26-30', '31-35'],
          ['0', '0', '0', '0'],
          ['0', '0', '0', '0'],
        ],
        multiplicador: { feno: { P2O5: 2.5, K2O: 3.0 } },
        notas: [
          NOTA_N_PARCELAR,
          NOTA_P_LANCO,
          'K: aplicar a lanço na época do pastejo ou corte. Doses acima de 100 kg/ha parceladas em no mínimo 2 vezes (argila > 400 g/kg) ou 3 vezes (argila < 400 g/kg).',
        ],
      },
    },
  },
  {
    id: 'aveia',
    nome: 'Aveia branca e preta',
    descricao: 'Forrageira de inverno',
    grupo: 'Forrageira anual de inverno',
    vAlvo: 70,
    extracao: { unidade: 'kg/t MS (aveia preta)', N: 30.3, P: 2.6, K: 39.4, Ca: 6.6, Mg: 3.3, S: 2.0 },
    modalidades: {
      cultivo: {
        label: 'Cultivo',
        tabelas: 'Tabelas 11.6, 11.7 e 11.8',
        prodLabel: 'Produtividade de matéria seca esperada (t/ha)',
        prod: ['< 3', '3-6', '7-10', '> 10'],
        opcao: OBJ_PASTEJO_SILAGEM_FENO,
        N: {
          silagem: ['75-100', '101-150', '151-200', '201-250'],
          pastejo: ['35-50', '51-75', '76-100', '101-125'],
        },
        P2O5: [
          ['26-30', '31-40', '41-50', '51-60'],
          ['20-25', '26-30', '31-40', '41-50'],
          ['0', '20-25', '26-30', '31-40'],
          ['0', '0', '20-25', '26-30'],
          ['0', '0', '0', '20-25'],
          ['0', '0', '0', '0'],
        ],
        K2O: [
          ['51-60', '61-70', '71-80', '81-90'],
          ['41-50', '51-60', '61-70', '71-80'],
          ['31-40', '41-50', '51-60', '61-70'],
          ['20-30', '31-40', '41-50', '51-60'],
          ['0', '0', '0', '40-50'],
          ['0', '0', '0', '0'],
        ],
        multiplicador: { silagem: { P2O5: 2.5, K2O: 3.0 } },
        notas: [
          'N: dose única até 150 kg/ha no perfilhamento (mais de 50% das plantas com perfilho). Acima disso, aplicar 150 no perfilhamento e o restante 30 a 45 dias depois.',
          'N: semeadura em linha com semeadora-adubadora: 30 a 45 kg/ha de N no sulco e o restante a lanço, em cobertura, em duas doses iguais.',
          'N: em cultivo de aveia com azevém, usar a adubação nitrogenada do azevém. Mesmo com soja como cultura anterior, não reduzir o N.',
          'P: com semeadura em linhas, pode-se aplicar toda a dose de fósforo no sulco.',
          'K: se o teor cair de alto para baixo ou muito baixo (0-20 cm), aplicar 40 kg/ha de K₂O a mais por tonelada de MS produzida, até o teor voltar ao nível alto.',
          'K: com semeadora-adubadora, até 80 kg/ha de K₂O no sulco e o restante a lanço, em cobertura.',
        ],
      },
    },
  },
  {
    id: 'azevem',
    nome: 'Azevém',
    descricao: 'Lolium multiflorum',
    grupo: 'Forrageira anual de inverno',
    vAlvo: 70,
    extracao: { unidade: 'kg/t MS', N: 25.7, P: 3.4, K: 39.5, Ca: 6.2, Mg: 3.0, S: 2.2 },
    modalidades: {
      cultivo: {
        label: 'Cultivo',
        tabelas: 'Tabelas 11.11, 11.12 e 11.13',
        prodLabel: 'Produtividade de matéria seca esperada (t/ha)',
        prod: ['< 3', '3-6', '7-10', '> 10'],
        opcao: OBJ_PASTEJO_SILAGEM_FENO,
        N: {
          silagem: ['100-150', '151-200', '201-250', '251-300'],
          pastejo: ['50-75', '76-100', '101-125', '126-150'],
        },
        P2O5: [
          ['36-40', '41-45', '46-55', '56-70'],
          ['31-35', '36-40', '41-45', '46-55'],
          ['26-30', '31-35', '36-40', '41-45'],
          ['20-25', '26-30', '31-35', '36-40'],
          ['0', '0', '0', '30-35'],
          ['0', '0', '0', '0'],
        ],
        K2O: [
          ['51-60', '61-70', '71-80', '81-90'],
          ['41-50', '51-60', '61-70', '71-80'],
          ['31-40', '41-50', '51-60', '61-70'],
          ['20-30', '31-40', '41-50', '51-60'],
          ['0', '0', '30-40', '41-50'],
          ['0', '0', '0', '0'],
        ],
        multiplicador: { silagem: { P2O5: 2.5, K2O: 3.0 } },
        notas: [
          'N: dose única até 150 kg/ha no perfilhamento. Acima disso, aplicar 150 no perfilhamento e o restante 30 a 45 dias depois.',
          'N: semeadura em linha com semeadora-adubadora: 30 a 45 kg/ha de N no sulco e o restante a lanço, em cobertura, em duas doses iguais. Mesmo após soja, não reduzir a dose de N.',
          'P: com semeadura em linhas, aplicar toda a dose no sulco.',
          'K: se o teor cair de alto para baixo ou muito baixo, aplicar 40 kg/ha de K₂O a mais por tonelada de MS produzida, até o teor voltar ao nível alto.',
          'K: parcelar doses acima de 80 kg/ha em no mínimo 2 vezes (argila > 400 g/kg) ou 3 vezes (argila < 400 g/kg), junto com o N.',
          'Integração lavoura-pecuária: pode-se reduzir ou suprimir o K da cultura seguinte (soja ou milho) se o teor estiver alto e houve adubação potássica no inverno.',
        ],
      },
    },
  },
  {
    id: 'milheto',
    nome: 'Milheto',
    descricao: 'Pennisetum glaucum',
    grupo: 'Forrageira anual de verão',
    vAlvo: 60,
    extracao: { unidade: 'kg/t MS', N: 22.7, P: 2.3, K: 30.3, Ca: 4.2, Mg: 3.7, S: 0.8 },
    modalidades: {
      cultivo: {
        label: 'Cultivo',
        tabelas: 'Tabelas 11.38, 11.39 e 11.40',
        prodLabel: 'Produtividade de matéria seca esperada (t/ha)',
        prod: ['< 10', '10-15', '16-20', '> 20'],
        opcao: {
          id: 'objetivo', label: 'Objetivo', valores: [
            { id: 'pastejo', label: 'Pastejo' },
            { id: 'silagem', label: 'Silagem' },
          ],
        },
        N: {
          silagem: ['100-150', '151-200', '201-300', '301-400'],
          pastejo: ['50-75', '76-100', '101-150', '151-200'],
        },
        P2O5: [
          ['41-50', '51-60', '61-70', '71-80'],
          ['31-40', '41-50', '51-60', '61-70'],
          ['20-30', '31-40', '41-50', '51-60'],
          ['0', '20-30', '31-40', '41-50'],
          ['0', '0', '20-30', '31-40'],
          ['0', '0', '0', '0'],
        ],
        K2O: [
          ['71-85', '86-105', '106-120', '121-135'],
          ['56-70', '71-85', '86-105', '106-120'],
          ['41-55', '56-70', '71-85', '86-105'],
          ['30-40', '41-55', '56-70', '71-85'],
          ['0', '0', '40-55', '56-70'],
          ['0', '0', '0', '0'],
        ],
        multiplicador: { silagem: { P2O5: 2.5, K2O: 3.0 } },
        notas: [
          'P: com semeadura em linhas, pode-se aplicar toda a dose no sulco.',
          'K: se o teor cair de alto para baixo ou muito baixo, aplicar 30 kg/ha de K₂O a mais por tonelada de MS produzida, até o teor voltar ao nível alto.',
          'K: parcelar doses acima de 100 kg/ha em no mínimo 2 vezes (semeadura e cobertura) em solos com mais de 400 g/kg de argila, e 3 vezes em solos com menos, junto com o N.',
          'K: com semeadora-adubadora, até 80 kg/ha de K₂O no sulco e o restante a lanço, em cobertura.',
        ],
      },
    },
  },
  {
    id: 'milho_silagem',
    nome: 'Milho para silagem',
    descricao: 'Zea mays',
    grupo: 'Lavoura',
    vAlvo: 70,
    extracao: { unidade: 'kg/t grãos', N: 21.5, P: 3.9, K: 17.1, Ca: 2.4, Mg: 2.8, S: 2.6 },
    modalidades: {
      cultivo: {
        label: 'Cultivo',
        tabelas: 'Tabelas 11.43, 11.44 e 11.45',
        prodLabel: 'Produtividade esperada (t/ha)',
        prod: ['Grãos < 8 | Silagem < 40', 'Grãos 8-12 | Silagem 40-60', 'Grãos 13-16 | Silagem 61-80', 'Grãos > 16 | Silagem > 80'],
        opcao: {
          id: 'culturaAnterior', label: 'Cultura anterior (alta produção de MS, > 2 t/ha)', valores: [
            { id: 'graminea', label: 'Gramínea' },
            { id: 'leguminosa', label: 'Leguminosa' },
          ],
        },
        N: {
          graminea: ['80-120', '121-180', '181-260', '261-340'],
          leguminosa: ['20-60', '61-120', '121-200', '201-280'],
        },
        P2O5: [
          ['111-130', 'inv', 'inv', 'inv'],
          ['91-110', '111-130', '131-150', 'inv'],
          ['71-90', '91-110', '111-130', '131-150'],
          ['51-70', '71-90', '91-110', '111-130'],
          ['30-50', '51-70', '71-90', '91-110'],
          ['0', '0', '0', '0'],
        ],
        K2O: [
          ['241-280', '281-320', 'inv', 'inv'],
          ['201-240', '241-280', '281-320', 'inv'],
          ['161-200', '201-240', '241-280', '281-320'],
          ['121-160', '161-200', '201-240', '241-280'],
          ['80-120', '121-160', '161-200', '201-240'],
          ['0', '0', '0', '0'],
        ],
        notas: [
          'P: com aplicação de esterco, descontar da dose o fósforo fornecido por ele (índice de eficiência 1,0 se aplicado todo ano).',
          'K: doses acima de 60 kg/ha: aplicar essa quantidade no sulco e o restante em cobertura, junto com a primeira cobertura de N.',
          'K: em solos argilosos, aplicar a cobertura entre a semeadura e a emergência. Em solos arenosos, entre V2 e V4, junto com o N.',
          'Pela alta exportação de K na silagem, fazer análise de solo com maior frequência em áreas de milho silagem contínuo.',
        ],
      },
    },
  },
];

export function getCultura(id) {
  return CULTURAS.find((c) => c.id === id) || null;
}

// '61-80' -> {min:61, max:80, dose:70.5}; '0' -> dose 0; 'inv' -> inviável
export function parseFaixa(f) {
  if (f == null) return null;
  if (f === 'inv') return { inviavel: true, dose: null, texto: 'Inviável' };
  const s = String(f);
  if (s.includes('-')) {
    const [a, b] = s.split('-').map(Number);
    return { min: a, max: b, dose: (a + b) / 2, texto: s };
  }
  const n = Number(s);
  return { min: n, max: n, dose: n, texto: s };
}

// Fase escolhida ou, se não houver, manutenção (caso mais comum) / a única disponível
export function modalidadeId(cultura, escolhida) {
  if (escolhida && cultura.modalidades[escolhida]) return escolhida;
  if (cultura.modalidades.manutencao) return 'manutencao';
  return Object.keys(cultura.modalidades)[0];
}
