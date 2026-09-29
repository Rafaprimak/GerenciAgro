// Configuração (adubos, preços, PRNT...) guardada no banco local e sincronizada.
import * as store from './store.js';
import { CONFIG_PADRAO } from './data/adubos.js';

export async function getConfig() {
  const salvo = await store.obter('config', 'config');
  if (!salvo || salvo.deleted) return structuredClone(CONFIG_PADRAO);
  return {
    ...structuredClone(CONFIG_PADRAO),
    ...salvo,
    calcario: { ...CONFIG_PADRAO.calcario, ...(salvo.calcario || {}) },
    adubos: salvo.adubos?.length ? salvo.adubos : structuredClone(CONFIG_PADRAO.adubos),
  };
}

export async function salvarConfig(cfg) {
  const { _dirty, ...limpo } = cfg;
  return store.salvar('config', { ...limpo, id: 'config' });
}
