/** Normaliza texto para busca: minúsculas e sem acentos ("Dončić" casa com "doncic"). */
export const normalizeSearch = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
