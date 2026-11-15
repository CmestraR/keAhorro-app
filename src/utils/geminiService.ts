import { Account, Category, CreditCard } from '../types/finance';

export type GeminiModelType = 'gemini-2.5-flash' | 'gemini-2.5-pro';

export interface GeminiExtractedTransaction {
  tipo: 'GASTO' | 'TARJETA' | 'INGRESO' | 'TRANSFERENCIA';
  monto: number;
  concepto: string;
  fechaISO: string;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  tarjetaId: string | null;
  cuotas: number;
  categoriaId: string | null;
  aplica4x1000: boolean;
  resumenHumano: string;
}

const getTodayISO = (): string => new Date().toISOString().split('T')[0];

const getYesterdayISO = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

/**
 * Prueba la conexión con Google Gemini API usando la API Key y el modelo seleccionado.
 */
export async function testGeminiConnection(
  apiKey: string,
  model: GeminiModelType = 'gemini-2.5-flash'
): Promise<{ ok: boolean; message: string }> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return { ok: false, message: 'Ingresa una Gemini API Key válida primero.' };
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      trimmedKey
    )}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Responde únicamente con JSON: {"status":"ok"}' }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 30,
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg =
        errData?.error?.message || `Error HTTP ${response.status} al conectar con Gemini.`;
      return { ok: false, message: errMsg };
    }

    return {
      ok: true,
      message: `Conexión exitosa con ${model}. ¡Listo para dictado por voz y categorización IA!`,
    };
  } catch (error: any) {
    return {
      ok: false,
      message: error?.message || 'Error de red al intentar conectar con Google AI Studio.',
    };
  }
}

/**
 * Extrae una transacción estructurada usando Gemini en milisegundos con responseMimeType: "application/json".
 * Si no hay API key o falla la red, usa un analizador inteligente local de respaldo para no bloquear al usuario.
 */
export async function extractTransactionWithGemini(params: {
  transcript: string;
  apiKey: string;
  model: GeminiModelType;
  accounts: Account[];
  creditCards: CreditCard[];
  categories: Category[];
}): Promise<{ data: GeminiExtractedTransaction; source: 'gemini' | 'local_fallback' }> {
  const { transcript, apiKey, model, accounts, creditCards, categories } = params;
  const todayISO = getTodayISO();
  const yesterdayISO = getYesterdayISO();

  const trimmedKey = apiKey.trim();
  if (trimmedKey) {
    try {
      const accountsContext = accounts.map((a) => ({
        id: a.id,
        nombre: a.name,
        banco: a.bankName,
        tipo: a.type,
        cobra4x1000: !!a.hasGmf4x1000,
      }));

      const cardsContext = creditCards.map((c) => ({
        id: c.id,
        nombre: c.name,
        banco: c.bankName,
        franquicia: c.cardBrand,
        ultimos4: c.lastFourDigits,
      }));

      const categoriesContext = categories.map((cat) => ({
        id: cat.id,
        nombre: cat.name,
        tipo: cat.type,
        palabrasClave: cat.keywords,
      }));

      const systemPrompt = `Eres el motor financiero inteligente de la app colombiana keAhorro.
Extrae los datos del movimiento dictado por el usuario y devuelve ÚNICAMENTE un objeto JSON válido que cumpla exactamente este esquema:
{
  "tipo": "GASTO" | "TARJETA" | "INGRESO" | "TRANSFERENCIA",
  "monto": number,
  "concepto": string,
  "fechaISO": "YYYY-MM-DD",
  "cuentaOrigenId": string | null,
  "cuentaDestinoId": string | null,
  "tarjetaId": string | null,
  "cuotas": number,
  "categoriaId": string | null,
  "aplica4x1000": boolean,
  "resumenHumano": string
}

REGLAS ESTRICTAS:
1. Fecha actual (Hoy): "${todayISO}". Ayer fue: "${yesterdayISO}". Si no menciona fecha, usa "${todayISO}".
2. Cuentas del usuario disponibles: ${JSON.stringify(accountsContext)}
3. Tarjetas de crédito del usuario disponibles: ${JSON.stringify(cardsContext)}
4. Categorías disponibles: ${JSON.stringify(categoriesContext)}
5. Si el usuario menciona compra con tarjeta de crédito, cuotas o el nombre de una tarjeta (ej. Visa, Mastercard, Nu Crédito), usa "tipo": "TARJETA", asigna "tarjetaId" al ID más cercano de la lista de tarjetas (o la primera si solo hay una), y "cuentaOrigenId": null.
6. Si es un ingreso ("me pagaron", "recibí", "sueldo", "abono en mi cuenta"), usa "tipo": "INGRESO" y asigna "cuentaOrigenId" a la cuenta donde entra el dinero.
7. Si es pasar dinero entre dos cuentas propias ("transferí de Bancolombia a Nequi", "pasé a Nu"), usa "tipo": "TRANSFERENCIA", asignando "cuentaOrigenId" y "cuentaDestinoId".
8. Si es un gasto de cuenta/efectivo/billetera, usa "tipo": "GASTO" y asigna "cuentaOrigenId" a la cuenta mencionada (o la primera cuenta disponible por defecto).
9. En montos en pesos colombianos: "10 mil" = 10000, "35 mil" = 35000, "un millón doscientos" = 1200000.
10. "aplica4x1000": true si es GASTO o TRANSFERENCIA desde una cuenta que tenga cobra4x1000=true (o si el usuario lo pide explícitamente).
11. "resumenHumano": frase corta, cálida y clara en español confirmando qué se va a registrar.`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        trimmedKey
      )}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `${systemPrompt}\n\nComando de voz del usuario: "${transcript.trim()}"`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText) as GeminiExtractedTransaction;
          return {
            data: normalizeExtractedTransaction(parsed, accounts, creditCards, categories),
            source: 'gemini',
          };
        }
      }
    } catch {
      // Fallback a analizador local si hay error de red o cuota
    }
  }

  return {
    data: parseVoiceCommandLocally(transcript, accounts, creditCards, categories),
    source: 'local_fallback',
  };
}

/**
 * Predice la categoría más adecuada usando Gemini (cuando hay API key y autocategorización activa).
 */
export async function predictCategoryWithGemini(params: {
  concept: string;
  type: 'income' | 'expense';
  categories: Category[];
  apiKey: string;
  model: GeminiModelType;
}): Promise<string | null> {
  const { concept, type, categories, apiKey, model } = params;
  const trimmedKey = apiKey.trim();
  if (!trimmedKey || concept.trim().length < 3) return null;

  const filtered = categories.filter((c) => c.type === type);
  if (filtered.length === 0) return null;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      trimmedKey
    )}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Elige el "categoriaId" más apropiado para el concepto "${concept}" (${type}) de esta lista: ${JSON.stringify(
                  filtered.map((c) => ({ id: c.id, nombre: c.name }))
                )}. Responde solo JSON: {"categoriaId": "..."}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 40,
        },
      }),
    });

    if (!response.ok) return null;
    const json = await response.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.categoriaId && filtered.some((c) => c.id === parsed.categoriaId)) {
      return parsed.categoriaId;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeExtractedTransaction(
  raw: Partial<GeminiExtractedTransaction>,
  accounts: Account[],
  creditCards: CreditCard[],
  categories: Category[]
): GeminiExtractedTransaction {
  const validTypes = ['GASTO', 'TARJETA', 'INGRESO', 'TRANSFERENCIA'] as const;
  const tipo = validTypes.includes(raw.tipo as any) ? (raw.tipo as any) : 'GASTO';
  const monto = Math.max(0, Math.round(Number(raw.monto) || 0));
  const fechaISO =
    typeof raw.fechaISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.fechaISO)
      ? raw.fechaISO
      : getTodayISO();
  const cuotas = Math.max(1, Math.min(48, Math.round(Number(raw.cuotas) || 1)));

  let cuentaOrigenId =
    raw.cuentaOrigenId && accounts.some((a) => a.id === raw.cuentaOrigenId)
      ? raw.cuentaOrigenId
      : null;
  let cuentaDestinoId =
    raw.cuentaDestinoId && accounts.some((a) => a.id === raw.cuentaDestinoId)
      ? raw.cuentaDestinoId
      : null;
  let tarjetaId =
    raw.tarjetaId && creditCards.some((c) => c.id === raw.tarjetaId) ? raw.tarjetaId : null;

  if (tipo === 'TARJETA') {
    if (!tarjetaId && creditCards[0]) {
      tarjetaId = creditCards[0].id;
    }
    cuentaOrigenId = null;
    cuentaDestinoId = null;
  } else {
    if (!cuentaOrigenId && accounts[0]) {
      cuentaOrigenId = accounts[0].id;
    }
    if (tipo === 'TRANSFERENCIA' && (!cuentaDestinoId || cuentaDestinoId === cuentaOrigenId)) {
      const other = accounts.find((a) => a.id !== cuentaOrigenId);
      cuentaDestinoId = other ? other.id : null;
    }
  }

  const targetCatType = tipo === 'INGRESO' ? 'income' : 'expense';
  const validCat = categories.find((c) => c.id === raw.categoriaId);
  const defaultCat =
    categories.find((c) => c.type === targetCatType) || categories[0] || null;
  const categoriaId = validCat ? validCat.id : defaultCat ? defaultCat.id : null;

  const originAcc = accounts.find((a) => a.id === cuentaOrigenId);
  const aplica4x1000 =
    typeof raw.aplica4x1000 === 'boolean'
      ? raw.aplica4x1000
      : (tipo === 'GASTO' || tipo === 'TRANSFERENCIA') && !!originAcc?.hasGmf4x1000;

  const concepto = (raw.concepto || '').trim() || 'Movimiento por voz';
  const resumenHumano =
    (raw.resumenHumano || '').trim() ||
    `${tipo}: $${monto.toLocaleString('es-CO')} — ${concepto}`;

  return {
    tipo,
    monto,
    concepto,
    fechaISO,
    cuentaOrigenId,
    cuentaDestinoId,
    tarjetaId,
    cuotas,
    categoriaId,
    aplica4x1000,
    resumenHumano,
  };
}

/**
 * Analizador local instantáneo en español para pruebas sin conexión o sin API Key.
 */
export function parseVoiceCommandLocally(
  transcript: string,
  accounts: Account[],
  creditCards: CreditCard[],
  categories: Category[]
): GeminiExtractedTransaction {
  const lower = transcript.toLowerCase().trim();
  const todayISO = getTodayISO();
  const yesterdayISO = getYesterdayISO();

  // 1. Determinar tipo
  let tipo: 'GASTO' | 'TARJETA' | 'INGRESO' | 'TRANSFERENCIA' = 'GASTO';
  const matchedCard = creditCards.find(
    (c) =>
      lower.includes(c.name.toLowerCase()) ||
      lower.includes(c.bankName.toLowerCase()) ||
      lower.includes(c.cardBrand.toLowerCase())
  );

  if (
    lower.includes('cuota') ||
    lower.includes('tarjeta') ||
    lower.includes('crédito') ||
    lower.includes('credito') ||
    matchedCard
  ) {
    tipo = 'TARJETA';
  } else if (
    lower.includes('transferí') ||
    lower.includes('transferi') ||
    lower.includes('traspaso') ||
    lower.includes('pasé de') ||
    lower.includes('pase de')
  ) {
    tipo = 'TRANSFERENCIA';
  } else if (
    lower.includes('me pagaron') ||
    lower.includes('recibí') ||
    lower.includes('recibi') ||
    lower.includes('ingreso') ||
    lower.includes('nómina') ||
    lower.includes('nomina') ||
    lower.includes('sueldo') ||
    lower.includes('me transfirieron')
  ) {
    tipo = 'INGRESO';
  }

  // 2. Extraer monto
  let monto = 0;
  const milMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  const millonMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mill[oó]n(?:es)?\b/);
  const numericMatches = lower.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,9})/);

  if (millonMatch) {
    monto = Math.round(parseFloat(millonMatch[1].replace(',', '.')) * 1000000);
  } else if (milMatch) {
    monto = Math.round(parseFloat(milMatch[1].replace(',', '.')) * 1000);
  } else if (numericMatches) {
    monto = parseInt(numericMatches[1].replace(/[.,]/g, ''), 10) || 0;
  } else {
    const smallNum = lower.match(/\b(\d{1,3})\b/);
    if (smallNum) {
      const val = parseInt(smallNum[1], 10);
      monto = val < 500 ? val * 1000 : val;
    }
  }

  // 3. Extraer cuotas
  let cuotas = 1;
  const cuotasMatch = lower.match(/a\s*(\d{1,2})\s*cuotas?/) || lower.match(/(\d{1,2})\s*cuotas?/);
  if (cuotasMatch) {
    cuotas = Math.max(1, Math.min(48, parseInt(cuotasMatch[1], 10) || 1));
  }

  // 4. Fecha
  const fechaISO = lower.includes('ayer') ? yesterdayISO : todayISO;

  // 5. Cuenta / Tarjeta
  const matchedAccounts = accounts.filter(
    (a) =>
      lower.includes(a.name.toLowerCase()) ||
      lower.includes(a.bankName.toLowerCase()) ||
      (lower.includes('efectivo') && a.type === 'cash')
  );

  const cuentaOrigenId =
    tipo === 'TARJETA' ? null : matchedAccounts[0]?.id || accounts[0]?.id || null;
  const cuentaDestinoId =
    tipo === 'TRANSFERENCIA'
      ? matchedAccounts[1]?.id || accounts.find((a) => a.id !== cuentaOrigenId)?.id || null
      : null;
  const tarjetaId =
    tipo === 'TARJETA' ? matchedCard?.id || creditCards[0]?.id || null : null;

  // 6. Categoría
  const catType = tipo === 'INGRESO' ? 'income' : 'expense';
  let matchedCat = categories.find(
    (cat) =>
      cat.type === catType &&
      (lower.includes(cat.name.toLowerCase()) ||
        cat.keywords?.some((k) => lower.includes(k.toLowerCase())))
  );
  if (!matchedCat) {
    matchedCat = categories.find((c) => c.type === catType) || categories[0];
  }

  // 7. Limpiar concepto
  let concepto = transcript
    .trim()
    .replace(/^(compré|compre|pagué|pague|gasté|gaste|me pagaron|recibí|recibi|transferí|transferi)\s+/i, '')
    .replace(/\s+(por|de)\s+\$?\s*\d[\d.,]*(\s*mil|\s*millones|\s*millón)?/i, '')
    .replace(/\s+a\s+\d+\s+cuotas?/i, '')
    .trim();

  if (!concepto || concepto.length < 2) {
    concepto =
      tipo === 'INGRESO'
        ? 'Ingreso registrado por voz'
        : tipo === 'TARJETA'
        ? 'Compra con tarjeta por voz'
        : tipo === 'TRANSFERENCIA'
        ? 'Transferencia entre cuentas'
        : 'Gasto registrado por voz';
  } else {
    concepto = concepto.charAt(0).toUpperCase() + concepto.slice(1);
  }

  const originAcc = accounts.find((a) => a.id === cuentaOrigenId);
  const aplica4x1000 =
    (tipo === 'GASTO' || tipo === 'TRANSFERENCIA') && !!originAcc?.hasGmf4x1000;

  const targetName =
    tipo === 'TARJETA'
      ? creditCards.find((c) => c.id === tarjetaId)?.name || 'Tarjeta'
      : originAcc?.name || 'Cuenta';

  const resumenHumano = `${
    tipo === 'INGRESO'
      ? 'Ingreso'
      : tipo === 'TARJETA'
      ? `Compra a ${cuotas} cuota(s)`
      : tipo === 'TRANSFERENCIA'
      ? 'Transferencia'
      : 'Gasto'
  } de $ ${monto.toLocaleString('es-CO')} en ${targetName} (${concepto})`;

  return {
    tipo,
    monto,
    concepto,
    fechaISO,
    cuentaOrigenId,
    cuentaDestinoId,
    tarjetaId,
    cuotas,
    categoriaId: matchedCat?.id || null,
    aplica4x1000,
    resumenHumano,
  };
}
