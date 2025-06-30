// modules/utils.js

/**
 * Normaliza uma string: remove acentos, converte para minúsculas e remove espaços extras.
 * @param {string} str - A string a ser normalizada.
 * @returns {string} A string normalizada ou string vazia se entrada inválida.
 */
export function normalizeString(str) {
    if (typeof str !== 'string' || !str) return '';
    try {
        return str
            .normalize('NFD') // Decompõe caracteres acentuados
            .replace(/[\u0300-\u036f]/g, '') // Remove os diacríticos (acentos)
            .toLowerCase()
            .replace(/\s+/g, ' ') // Substitui múltiplos espaços por um único
            .trim();
    } catch (e) {
        console.warn("[Utils] Erro ao normalizar string:", str, e);
        return str.toLowerCase().replace(/\s+/g, ' ').trim(); // Fallback
    }
}

/**
 * Tenta parsear uma string de data em vários formatos para um objeto Date (UTC).
 * Prioriza ISO 8601, depois formatos comuns pt-BR e US.
 * @param {string} dateStr - A string da data.
 * @returns {Date|null} Objeto Date (representando UTC) ou null se o parsing falhar.
 */
export function parseDate(dateStr) {
    if (typeof dateStr !== 'string' || !dateStr) return null;
    const cleanedDateStr = dateStr.trim();

    // Verifica se a string contém pelo menos um dígito para evitar parsear nomes
    if (!/\d/.test(cleanedDateStr)) return null;

    // 1. Tentativa direta com o construtor Date (ótimo para ISO 8601 e formatos reconhecidos nativamente)
    if (isNaN(cleanedDateStr) || cleanedDateStr.includes('-') || cleanedDateStr.includes('/') || cleanedDateStr.includes('T')) {
        const directDate = new Date(cleanedDateStr);
        if (!isNaN(directDate.getTime())) {
            const year = directDate.getFullYear();
            if (year > 1900 && year < 2100) {
                if (cleanedDateStr.includes('T') || cleanedDateStr.includes('Z')) {
                     return directDate;
                } else {
                    // Para formatos como YYYY-MM-DD, Date() pode usar fuso local. Força UTC.
                    return new Date(Date.UTC(directDate.getFullYear(), directDate.getMonth(), directDate.getDate()));
                }
            }
        }
    }

    // 2. Tentativa com formatos específicos pt-BR / internacionais
    const monthMap = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
    };

    const tryCreateDateUTC = (day, month, year) => {
        if (year < 100) year += (year >= 70) ? 1900 : 2000;
        if (isNaN(day) || isNaN(month) || isNaN(year) || month < 0 || month > 11 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
        const date = new Date(Date.UTC(year, month, day));
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) return date;
        return null;
    };

    let parsedDate = null;
    let match;

    // DD-MMM-YY(YY)
    match = cleanedDateStr.match(/^(\d{1,2})[-./\s]([A-Z]{3})[-./\s](\d{2,4})$/i);
    if (match) {
        const monthNum = monthMap[match[2].toLowerCase()];
        if (monthNum !== undefined) {
            parsedDate = tryCreateDateUTC(parseInt(match[1], 10), monthNum, parseInt(match[3], 10));
            if (parsedDate) return parsedDate;
        }
    }

    // DD/MM/YYYY ou variantes
    match = cleanedDateStr.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
    if (match) {
        parsedDate = tryCreateDateUTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
        if (parsedDate) return parsedDate;
    }

    // DD/MM/YY ou variantes
    match = cleanedDateStr.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2})$/);
    if (match) {
        parsedDate = tryCreateDateUTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
        if (parsedDate) return parsedDate;
    }

    // MM/DD/YYYY (Fallback US)
    match = cleanedDateStr.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
    if (match) {
        parsedDate = tryCreateDateUTC(parseInt(match[2], 10), parseInt(match[1], 10) - 1, parseInt(match[3], 10));
        if (parsedDate) return parsedDate;
    }

     // MM/DD/YY (Fallback US)
    match = cleanedDateStr.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2})$/);
    if (match) {
        parsedDate = tryCreateDateUTC(parseInt(match[2], 10), parseInt(match[1], 10) - 1, parseInt(match[3], 10));
        if (parsedDate) return parsedDate;
    }

    // Log apenas se a string original continha números e não era texto puro
    if (!parsedDate && /\d/.test(dateStr) && !/^[a-z\s]+$/i.test(cleanedDateStr)) {
        console.warn(`[Utils] Não foi possível parsear a string de data: ${dateStr}`);
    }
    return null; // Retorna null se nenhum formato funcionou
}


/**
 * Formata um objeto Date ou timestamp para o formato DD/MM/YYYY.
 */
export function formatDate(dateInput) {
    let date = dateInput instanceof Date ? dateInput : parseDate(String(dateInput));
    if (!date || isNaN(date.getTime())) return '';
    try {
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        if (year < 1900 || year > 2100) return '';
        return `${day}/${month}/${year}`;
    } catch (e) { console.error("[Utils] Erro ao formatar data:", dateInput, e); return ''; }
}

/**
 * Obtém a data atual do sistema do usuário formatada como DD/MM/YYYY.
 */
export function getCurrentDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
}

/** Valida e-mail */
export function validateEmail(email) { if (typeof email !== 'string') return false; const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/; return re.test(email.trim()); }
/** Valida senha */
export function validatePassword(password, minLength = 6) { if (typeof password !== 'string') return false; return password.length >= minLength; }
/** Formata moeda BRL */
export function formatCurrency(value) { const number = Number(value); if (isNaN(number)) return 'R$ --'; return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
/** Debounce */
export function debounce(func, wait, immediate = false) { let timeout; return function executedFunction(...args) { const context = this; const later = function() { timeout = null; if (!immediate) func.apply(context, args); }; const callNow = immediate && !timeout; clearTimeout(timeout); timeout = setTimeout(later, wait); if (callNow) func.apply(context, args); }; }
/** Gera ID */
export function generateId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 9); }

// Exporta todas as funções
