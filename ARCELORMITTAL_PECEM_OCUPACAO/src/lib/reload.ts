// Depois de uma nova publicação, uma aba aberta antes dela ainda aponta para arquivos (chunks)
// que não existem mais no servidor. Nesse caso a página é recarregada uma vez para pegar a versão nova.
const KEY = 'amp-reload-chunk';

export const isChunkError = (e: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String((e as Error)?.message ?? e));

export function reloadForNewVersion() {
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 30_000) return false; // evita ciclo de recarga
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
  return true;
}

/** import() que se recupera de versão antiga em cache recarregando a página. */
export async function importFresh<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (isChunkError(e) && reloadForNewVersion()) throw new Error('O sistema foi atualizado. Recarregando a página, tente de novo em seguida.');
    throw e;
  }
}
