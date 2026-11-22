import { Account, Category, CreditCard } from '../types/finance';

export type GeminiModelType =
  | 'gemini-3.0-flash'
  | 'gemini-3.9-flash'
  | 'gemini-3-flash-preview'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | string;

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
  transcripcion?: string;
}

const getTodayISO = (): string => new Date().toISOString().split('T')[0];

const getYesterdayISO = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

const FALLBACK_FLASH_MODELS = [
  'gemini-3.9-flash',
  'gemini-3.0-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
];

const FALLBACK_PRO_MODELS = [
  'gemini-3.0-pro',
  'gemini-3-pro-preview',
  'gemini-2.5-pro',
  'gemini-pro-latest',
];

let cachedWorkingModel: string | null = null;

/**
 * Obtiene dinámicamente desde Google AI Studio los modelos habilitados para la API Key del usuario.
 */
async function fetchAvailableModelsForKey(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.models)) return [];

    return data.models
      .filter(
        (m: any) =>
          Array.isArray(m?.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          typeof m?.name === 'string'
      )
      .map((m: any) => (m.name as string).replace(/^models\//, ''))
      .filter((name: string) => name.startsWith('gemini-') && !name.includes('tts') && !name.includes('image') && !name.includes('embedding'));
  } catch {
    return [];
  }
}

/**
 * Extrae nombres de modelos sugeridos dentro del mensaje de error de Google (si Google recomienda uno específico).
 */
function extractSuggestedModelsFromError(errMsg: string, failedModel: string): string[] {
  const matches = errMsg.match(/gemini-[a-z0-9.-]+/gi) || [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase()))).filter(
    (m) => m !== failedModel.toLowerCase()
  );
}

/**
 * Ejecuta una petición generateContent a Gemini con auto-detección de modelo compatible
 * si el modelo elegido no está disponible para cuentas nuevas.
 */
async function callGeminiWithAutoFallback(
  apiKey: string,
  preferredModel: string,
  bodyPayload: Record<string, any>
): Promise<{
  ok: boolean;
  resultJson?: any;
  resolvedModel: string;
  errorMessage?: string;
}> {
  const cleanPreferred = (preferredModel || 'gemini-3.0-flash').replace(/^models\//, '').trim();
  const isProPreferred = cleanPreferred.includes('pro');

  const tried = new Set<string>();
  const trySingleModel = async (
    modelName: string
  ): Promise<{ ok: boolean; status: number; json: any; errMsg: string }> => {
    tried.add(modelName);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    const json = await response.json().catch(() => null);
    if (response.ok) {
      return { ok: true, status: response.status, json, errMsg: '' };
    }
    const errMsg =
      json?.error?.message || `Error HTTP ${response.status} al conectar con ${modelName}.`;
    return { ok: false, status: response.status, json, errMsg };
  };

  // 1. Intentar primero el modelo preferido (o el último modelo funcional en caché si coincide en familia)
  const firstCandidate =
    cachedWorkingModel && cachedWorkingModel.includes(isProPreferred ? 'pro' : 'flash')
      ? cachedWorkingModel
      : cleanPreferred;

  const firstAttempt = await trySingleModel(firstCandidate);
  if (firstAttempt.ok) {
    cachedWorkingModel = firstCandidate;
    return { ok: true, resultJson: firstAttempt.json, resolvedModel: firstCandidate };
  }

  // Si el error es de API Key inválida (400 API_KEY_INVALID o 403), no tiene sentido probar otros modelos
  const lowerErr = firstAttempt.errMsg.toLowerCase();
  if (
    lowerErr.includes('api key not valid') ||
    lowerErr.includes('api_key_invalid') ||
    firstAttempt.status === 401
  ) {
    return {
      ok: false,
      resolvedModel: cleanPreferred,
      errorMessage: 'La API Key ingresada no es válida. Verifica que esté bien copiada desde Google AI Studio.',
    };
  }

  // 2. Construir lista de candidatos prioritarios (incluyendo sugeridos en el error + lista oficial de la cuenta)
  const suggestedFromError = extractSuggestedModelsFromError(firstAttempt.errMsg, firstCandidate);
  const accountModels = await fetchAvailableModelsForKey(apiKey);

  // Ordenar los modelos de la cuenta priorizando 3.x / flash (o pro)
  const sortedAccountModels = [...accountModels].sort((a, b) => {
    const aMatchesTier = a.includes(isProPreferred ? 'pro' : 'flash') ? 1 : 0;
    const bMatchesTier = b.includes(isProPreferred ? 'pro' : 'flash') ? 1 : 0;
    if (aMatchesTier !== bMatchesTier) return bMatchesTier - aMatchesTier;
    return b.localeCompare(a); // versiones más recientes (ej. gemini-3.x) primero
  });

  const candidates = [
    ...suggestedFromError,
    cleanPreferred,
    ...(isProPreferred ? FALLBACK_PRO_MODELS : FALLBACK_FLASH_MODELS),
    ...sortedAccountModels,
  ];

  let lastErrorMsg = firstAttempt.errMsg;

  for (const candidate of candidates) {
    if (!candidate || tried.has(candidate)) continue;
    const attempt = await trySingleModel(candidate);
    if (attempt.ok) {
      cachedWorkingModel = candidate;
      return { ok: true, resultJson: attempt.json, resolvedModel: candidate };
    }
    lastErrorMsg = attempt.errMsg;
  }

  return {
    ok: false,
    resolvedModel: cleanPreferred,
    errorMessage: lastErrorMsg,
  };
}

/**
 * Prueba la conexión con Google Gemini API usando la API Key y el modelo seleccionado.
 * Si el modelo no está disponible para nuevos usuarios, detecta y selecciona automáticamente el modelo activo en su cuenta.
 */
export async function testGeminiConnection(
  apiKey: string,
  model: GeminiModelType = 'gemini-3.0-flash'
): Promise<{ ok: boolean; message: string; resolvedModel?: string }> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return { ok: false, message: 'Ingresa una Gemini API Key válida primero.' };
  }

  try {
    const res = await callGeminiWithAutoFallback(trimmedKey, model, {
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
    });

    if (!res.ok) {
      return {
        ok: false,
        message: res.errorMessage || 'No fue posible conectar con Gemini.',
      };
    }

    const switchedNote =
      res.resolvedModel !== model
        ? ` (Se ajustó automáticamente al modelo compatible: ${res.resolvedModel})`
        : '';

    return {
      ok: true,
      resolvedModel: res.resolvedModel,
      message: `¡Conexión exitosa con ${res.resolvedModel}!${switchedNote} Listo para dictado por voz y categorización IA.`,
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
  audioBase64?: string;
  audioMimeType?: string;
  apiKey: string;
  model: GeminiModelType;
  accounts: Account[];
  creditCards: CreditCard[];
  categories: Category[];
}): Promise<{ data: GeminiExtractedTransaction; source: 'gemini' | 'local_fallback' }> {
  const { transcript, audioBase64, audioMimeType, apiKey, model, accounts, creditCards, categories } = params;
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
  "resumenHumano": string,
  "transcripcion": string
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
11. "resumenHumano": frase corta, cálida y clara en español confirmando qué se va a registrar.
12. "transcripcion": texto exacto en español de lo que dijo el usuario en el audio.`;

      const userParts: any[] = [];
      if (audioBase64) {
        userParts.push({
          text: `${systemPrompt}\n\nEscucha este comando de voz del usuario y extrae el JSON exacto:`,
        });
        userParts.push({
          inlineData: {
            mimeType: audioMimeType || 'audio/mp4',
            data: audioBase64,
          },
        });
      } else {
        userParts.push({
          text: `${systemPrompt}\n\nComando de voz del usuario: "${transcript.trim()}"`,
        });
      }

      const res = await callGeminiWithAutoFallback(trimmedKey, model, {
        contents: [
          {
            role: 'user',
            parts: userParts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      if (res.ok && res.resultJson) {
        const rawText = res.resultJson?.candidates?.[0]?.content?.parts?.[0]?.text;
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
    const res = await callGeminiWithAutoFallback(trimmedKey, model, {
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
    });

    if (!res.ok || !res.resultJson) return null;
    const raw = res.resultJson?.candidates?.[0]?.content?.parts?.[0]?.text;
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
    transcripcion: typeof raw.transcripcion === 'string' ? raw.transcripcion.trim() : undefined,
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

export interface GeminiExtractedStatementPurchase {
  id: string;
  description: string;
  purchaseDate: string; // YYYY-MM-DD
  originalAmount: number;
  installmentsTotal: number;
  installmentsPaid: number; // Cuotas ya pagadas ANTES de este extracto
  currentInstallmentNumber: number; // Cuota facturada en este extracto (ej. 2 si dice "2 de 6")
  monthlyQuota: number;
  remainingPrincipal: number;
  interestRateMonthly: number;
  categoryId: string;
}

export interface GeminiExtractedStatement {
  bankName: string;
  statementDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  cutOffDay: number;
  paymentDueDay: number;
  creditLimit: number;
  availableLimit: number;
  totalCurrentDebt: number;
  totalStatementBalance: number;
  minimumPayment: number;
  interestRateMonthly: number;
  currentInterest: number;
  lateInterest: number;
  handlingFee: number;
  taxesAndFees: number;
  previousUnitemizedPrincipal: number;
  purchases: GeminiExtractedStatementPurchase[];
  resumenHumano: string;
}

/**
 * Analiza un extracto completo de tarjeta de crédito (texto pegado del PDF/App, dictado de voz o documento/imagen base64)
 * usando Gemini y devuelve todos los movimientos a cuotas, cargos y saldos exactos para dejar la tarjeta igual al banco.
 */
export async function analyzeCardStatementWithGemini(params: {
  statementText?: string;
  audioBase64?: string;
  audioMimeType?: string;
  fileBase64?: string;
  fileMimeType?: string;
  card: CreditCard;
  categories: Category[];
  apiKey: string;
  model: GeminiModelType;
}): Promise<{ data: GeminiExtractedStatement; source: 'gemini' | 'local_fallback' }> {
  const {
    statementText = '',
    audioBase64,
    audioMimeType,
    fileBase64,
    fileMimeType,
    card,
    categories,
    apiKey,
    model,
  } = params;

  const todayISO = getTodayISO();
  const expenseCategories = categories
    .filter((c) => c.type === 'expense')
    .map((c) => ({ id: c.id, nombre: c.name, palabrasClave: c.keywords }));

  const trimmedKey = apiKey.trim();

  if (trimmedKey && (statementText.trim().length > 5 || audioBase64 || fileBase64)) {
    try {
      const systemPrompt = `Eres el auditor contable experto en tarjetas de crédito colombianas (Bancolombia, Nu Colombia, RappiCard, Davivienda, BBVA, Scotiabank Colpatria, Falabella, Lulo Bank) de la app keAhorro.
Analiza el extracto o resumen de tarjeta de crédito proporcionado por el usuario y devuelve ÚNICAMENTE un objeto JSON válido con este esquema exacto:
{
  "bankName": string,
  "statementDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "cutOffDay": number,
  "paymentDueDay": number,
  "creditLimit": number,
  "availableLimit": number,
  "totalCurrentDebt": number,
  "totalStatementBalance": number,
  "minimumPayment": number,
  "interestRateMonthly": number,
  "currentInterest": number,
  "lateInterest": number,
  "handlingFee": number,
  "taxesAndFees": number,
  "previousUnitemizedPrincipal": number,
  "purchases": [
    {
      "description": string,
      "purchaseDate": "YYYY-MM-DD",
      "originalAmount": number,
      "installmentsTotal": number,
      "installmentsPaid": number,
      "currentInstallmentNumber": number,
      "monthlyQuota": number,
      "remainingPrincipal": number,
      "interestRateMonthly": number,
      "categoryId": string
    }
  ],
  "resumenHumano": string
}

CONTEXTO DE LA TARJETA ACTUAL EN LA APP:
- Nombre: "${card.name}" (${card.bankName})
- Cupo Total actual en app: ${card.creditLimit}
- Día de corte actual: ${card.cutOffDay}, Día límite de pago: ${card.paymentDueDay}
- Tasa mensual actual (% E.M.): ${card.interestRateMonthly}
- Fecha actual: "${todayISO}"
- Categorías de gasto disponibles: ${JSON.stringify(expenseCategories)}

REGLAS CONTABLES ESTRICTAS PARA DEJAR LA TARJETA IDÉNTICA AL BANCO:
1. Todos los valores monetarios deben ser enteros en pesos colombianos (COP) sin decimales (ej. "$1.250.000,00" -> 1250000).
2. En cada compra ("purchases"):
   - Si el extracto dice "Cuota 2 de 6" o "2/6" (es decir, en este extracto se está cobrando la cuota 2 de un total de 6):
     * "installmentsTotal": 6
     * "currentInstallmentNumber": 2
     * "installmentsPaid": 1 (porque la cuota 1 ya se pagó en el extracto anterior, y las cuotas 2, 3, 4, 5 y 6 siguen pendientes de pago).
   - Si es una compra del mes a 1 sola cuota ("1 de 1" o "1/1"):
     * "installmentsTotal": 1
     * "currentInstallmentNumber": 1
     * "installmentsPaid": 0 (porque está facturada en este extracto y aún no se ha pagado).
   - Si el extracto muestra "Valor original" y "Saldo pendiente", respétalos. Si solo muestra la cuota mensual y las cuotas pendientes, calcula "remainingPrincipal" = monthlyQuota * (installmentsTotal - installmentsPaid) y "originalAmount" = monthlyQuota * installmentsTotal.
   - Si una compra es a 1 cuota o tiene promoción 0% interés, pon "interestRateMonthly": 0. Si tiene intereses, usa la tasa mensual del extracto (ej. 2.15).
3. Cuadre exacto de saldos con la app bancaria:
   - "totalStatementBalance": Pago total del mes / Saldo facturado a pagar en la fecha límite actual.
   - "minimumPayment": Pago mínimo exigido en este corte.
   - "totalCurrentDebt": Deuda total actual en la tarjeta (capital total utilizado + intereses/cargos pendientes). Si no se menciona explícitamente pero están las compras y cargos, súmalos: suma de "remainingPrincipal" de todas las compras + currentInterest + lateInterest + handlingFee + taxesAndFees.
   - "creditLimit": Cupo total de la tarjeta (si no se menciona en el extracto, usa ${card.creditLimit}).
   - "availableLimit": Cupo disponible exacto que muestra el banco. Si no se menciona explícitamente, calcúlalo como: creditLimit - (capital total utilizado).
   - "previousUnitemizedPrincipal": Si la deuda de capital total reportada por el banco es mayor que la suma de "remainingPrincipal" de las compras listadas, pon aquí la diferencia exacta para que la deuda total cuadre al 100% con el banco. Si cuadra, pon 0.
4. "resumenHumano": Resumen claro en español indicando cuántas compras se detectaron, el saldo facturado del mes y la deuda total sincronizada.`;

      const userParts: any[] = [];
      if (audioBase64) {
        userParts.push({
          text: `${systemPrompt}\n\nEscucha la descripción del extracto de tarjeta de crédito dictada por el usuario y extrae el JSON completo:`,
        });
        userParts.push({
          inlineData: {
            mimeType: audioMimeType || 'audio/mp4',
            data: audioBase64,
          },
        });
      } else if (fileBase64) {
        userParts.push({
          text: `${systemPrompt}\n\nAnaliza este documento/imagen del extracto de tarjeta de crédito y extrae todos los movimientos y saldos en el JSON:`,
        });
        userParts.push({
          inlineData: {
            mimeType: fileMimeType || 'application/pdf',
            data: fileBase64,
          },
        });
      } else {
        userParts.push({
          text: `${systemPrompt}\n\nTEXTO DEL EXTRACTO BANCARIO:\n"""\n${statementText.trim()}\n"""`,
        });
      }

      const res = await callGeminiWithAutoFallback(trimmedKey, model, {
        contents: [
          {
            role: 'user',
            parts: userParts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      if (res.ok && res.resultJson) {
        const rawText = res.resultJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          return {
            data: normalizeExtractedStatement(parsed, card, categories),
            source: 'gemini',
          };
        }
      }
    } catch {
      // Fallback a analizador local de extractos
    }
  }

  return {
    data: parseStatementTextLocally(statementText, card, categories),
    source: 'local_fallback',
  };
}

function normalizeExtractedStatement(
  raw: any,
  card: CreditCard,
  categories: Category[]
): GeminiExtractedStatement {
  const todayISO = getTodayISO();
  const defaultCatId =
    categories.find((c) => c.type === 'expense')?.id || categories[0]?.id || 'cat-food';

  const cutOffDay = Math.max(
    1,
    Math.min(31, Math.round(Number(raw?.cutOffDay) || card.cutOffDay || 15))
  );
  const paymentDueDay = Math.max(
    1,
    Math.min(31, Math.round(Number(raw?.paymentDueDay) || card.paymentDueDay || 5))
  );

  const statementDate =
    typeof raw?.statementDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.statementDate)
      ? raw.statementDate
      : todayISO;

  const dueDate =
    typeof raw?.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate)
      ? raw.dueDate
      : todayISO;

  const cardRate = Number(raw?.interestRateMonthly) >= 0
    ? Number(raw.interestRateMonthly)
    : card.interestRateMonthly || 2.15;

  const currentInterest = Math.max(0, Math.round(Number(raw?.currentInterest) || 0));
  const lateInterest = Math.max(0, Math.round(Number(raw?.lateInterest) || 0));
  const handlingFee = Math.max(0, Math.round(Number(raw?.handlingFee) || 0));
  const taxesAndFees = Math.max(0, Math.round(Number(raw?.taxesAndFees) || 0));
  const nonPrincipalTotal = currentInterest + lateInterest + handlingFee + taxesAndFees;

  const rawPurchases = Array.isArray(raw?.purchases) ? raw.purchases : [];
  const purchases: GeminiExtractedStatementPurchase[] = rawPurchases
    .map((p: any, idx: number) => {
      const installmentsTotal = Math.max(1, Math.min(60, Math.round(Number(p?.installmentsTotal) || 1)));
      let installmentsPaid = Math.round(Number(p?.installmentsPaid) || 0);
      const currentInst = Math.round(Number(p?.currentInstallmentNumber) || 1);

      if (installmentsPaid === 0 && currentInst > 1) {
        installmentsPaid = currentInst - 1;
      }
      installmentsPaid = Math.max(0, Math.min(installmentsTotal - 1, installmentsPaid));

      const remainingQuotas = Math.max(1, installmentsTotal - installmentsPaid);
      let originalAmount = Math.max(0, Math.round(Number(p?.originalAmount) || 0));
      let remainingPrincipal = Math.max(0, Math.round(Number(p?.remainingPrincipal) || 0));
      let monthlyQuota = Math.max(0, Math.round(Number(p?.monthlyQuota) || 0));

      if (originalAmount <= 0 && remainingPrincipal > 0) {
        originalAmount = Math.round((remainingPrincipal / remainingQuotas) * installmentsTotal);
      } else if (originalAmount <= 0 && monthlyQuota > 0) {
        originalAmount = monthlyQuota * installmentsTotal;
      }

      if (remainingPrincipal <= 0 && originalAmount > 0) {
        remainingPrincipal = Math.round((originalAmount / installmentsTotal) * remainingQuotas);
      }

      if (monthlyQuota <= 0 && remainingPrincipal > 0) {
        monthlyQuota = Math.round(remainingPrincipal / remainingQuotas);
      }

      const pRate =
        installmentsTotal === 1
          ? 0
          : typeof p?.interestRateMonthly === 'number' && p.interestRateMonthly >= 0
          ? p.interestRateMonthly
          : cardRate;

      const validCat = categories.find((c) => c.id === p?.categoryId)?.id || defaultCatId;
      const purchaseDate =
        typeof p?.purchaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.purchaseDate)
          ? p.purchaseDate
          : statementDate;

      return {
        id: `ext-p-${Date.now()}-${idx}`,
        description: (p?.description || `Compra #${idx + 1}`).toString().trim(),
        purchaseDate,
        originalAmount,
        installmentsTotal,
        installmentsPaid,
        currentInstallmentNumber: installmentsPaid + 1,
        monthlyQuota,
        remainingPrincipal,
        interestRateMonthly: pRate,
        categoryId: validCat,
      };
    })
    .filter((p: GeminiExtractedStatementPurchase) => p.remainingPrincipal > 0 || p.originalAmount > 0);

  const sumPurchasesRemainingPrincipal = purchases.reduce(
    (sum, p) => sum + p.remainingPrincipal,
    0
  );
  const sumMonthlyQuotas = purchases.reduce((sum, p) => sum + p.monthlyQuota, 0);

  const creditLimit = Math.max(
    card.creditLimit || 1000000,
    Math.round(Number(raw?.creditLimit) || card.creditLimit || 5000000)
  );

  let totalCurrentDebt = Math.max(0, Math.round(Number(raw?.totalCurrentDebt) || 0));
  if (totalCurrentDebt <= 0) {
    totalCurrentDebt = sumPurchasesRemainingPrincipal + nonPrincipalTotal;
  }

  const targetPrincipalDebt = Math.max(
    sumPurchasesRemainingPrincipal,
    totalCurrentDebt - nonPrincipalTotal
  );

  const previousUnitemizedPrincipal = Math.max(
    0,
    Math.round(Number(raw?.previousUnitemizedPrincipal) || targetPrincipalDebt - sumPurchasesRemainingPrincipal)
  );

  const finalPrincipalDebt = sumPurchasesRemainingPrincipal + previousUnitemizedPrincipal;
  totalCurrentDebt = finalPrincipalDebt + nonPrincipalTotal;

  let availableLimit =
    typeof raw?.availableLimit === 'number' && raw.availableLimit >= 0
      ? Math.round(raw.availableLimit)
      : Math.max(0, creditLimit - finalPrincipalDebt);

  let totalStatementBalance = Math.max(0, Math.round(Number(raw?.totalStatementBalance) || 0));
  if (totalStatementBalance <= 0) {
    totalStatementBalance = Math.min(totalCurrentDebt, sumMonthlyQuotas + nonPrincipalTotal);
  }

  let minimumPayment = Math.max(0, Math.round(Number(raw?.minimumPayment) || 0));
  if (minimumPayment <= 0 && totalStatementBalance > 0) {
    minimumPayment = Math.min(totalStatementBalance, Math.max(50000, Math.round(totalStatementBalance * 0.15)));
  }

  const resumenHumano =
    (raw?.resumenHumano || '').toString().trim() ||
    `Se detectaron ${purchases.length} movimiento(s), pago del mes por $${totalStatementBalance.toLocaleString(
      'es-CO'
    )} y deuda total de $${totalCurrentDebt.toLocaleString('es-CO')}.`;

  return {
    bankName: (raw?.bankName || card.bankName || 'Banco').toString().trim(),
    statementDate,
    dueDate,
    cutOffDay,
    paymentDueDay,
    creditLimit,
    availableLimit,
    totalCurrentDebt,
    totalStatementBalance,
    minimumPayment,
    interestRateMonthly: cardRate,
    currentInterest,
    lateInterest,
    handlingFee,
    taxesAndFees,
    previousUnitemizedPrincipal,
    purchases,
    resumenHumano,
  };
}

/**
 * Analizador local inteligente de respaldo para texto de extractos bancarios cuando no hay conexión.
 */
export function parseStatementTextLocally(
  text: string,
  card: CreditCard,
  categories: Category[]
): GeminiExtractedStatement {
  const clean = text.trim();
  const todayISO = getTodayISO();
  const defaultCatId =
    categories.find((c) => c.type === 'expense')?.id || categories[0]?.id || 'cat-food';

  const extractNum = (regex: RegExp, fallback = 0): number => {
    const m = clean.match(regex);
    if (!m || !m[1]) return fallback;
    const rawStr = m[1].replace(/[$\sCOP]/gi, '').replace(/[.,]+$/, '');
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(rawStr)) {
      return parseInt(rawStr.split(',')[0].replace(/\./g, ''), 10) || fallback;
    }
    if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(rawStr)) {
      return parseInt(rawStr.split('.')[0].replace(/,/g, ''), 10) || fallback;
    }
    return parseInt(rawStr.replace(/[.,]/g, ''), 10) || fallback;
  };

  const creditLimit = extractNum(/cupo\s+total[:\s]*\$?\s*([\d.,]+)/i, card.creditLimit);
  const totalCurrentDebt = extractNum(/(?:deuda\s+total|saldo\s+total\s+deuda|deuda\s+actual)[:\s]*\$?\s*([\d.,]+)/i, 0);
  const totalStatementBalance = extractNum(/(?:pago\s+total|total\s+a\s+pagar|facturado\s+al\s+corte|saldo\s+al\s+corte)[:\s]*\$?\s*([\d.,]+)/i, 0);
  const minimumPayment = extractNum(/pago\s+m[ií]nimo[:\s]*\$?\s*([\d.,]+)/i, 0);
  const currentInterest = extractNum(/intereses?\s+corrientes?[:\s]*\$?\s*([\d.,]+)/i, 0);
  const handlingFee = extractNum(/(?:cuota\s+de\s+manejo|seguro\s+deudor)[:\s]*\$?\s*([\d.,]+)/i, card.handlingFee || 0);

  // Detectar líneas de compras: ej. "- MERCADOLIBRE | $600.000 | Cuota 2 de 6" o "ALKOSTO $2.400.000 3/12"
  const lines = clean.split(/\r?\n/);
  const purchases: GeminiExtractedStatementPurchase[] = [];

  lines.forEach((line, idx) => {
    const l = line.trim();
    if (!l || /cupo|pago\s+total|pago\s+m[ií]nimo|deuda\s+total|intereses|cuota\s+de\s+manejo|fecha\s+de\s+corte/i.test(l)) {
      return;
    }

    const quotaMatch =
      l.match(/cuota\s+(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/i) ||
      l.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:cuotas?)?\b/i) ||
      l.match(/\ba\s+(\d{1,2})\s+cuotas?/i);

    const amountMatches = l.match(/\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{4,9})/g);
    if (!amountMatches || amountMatches.length === 0) return;

    const firstAmount = extractNum(new RegExp(amountMatches[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 0);
    if (firstAmount <= 0) return;

    let currentInst = 1;
    let totalInst = 1;
    if (quotaMatch) {
      if (quotaMatch[2]) {
        currentInst = Math.max(1, parseInt(quotaMatch[1], 10) || 1);
        totalInst = Math.max(currentInst, parseInt(quotaMatch[2], 10) || 1);
      } else {
        totalInst = Math.max(1, parseInt(quotaMatch[1], 10) || 1);
      }
    }

    const installmentsPaid = Math.max(0, currentInst - 1);
    const remainingQuotas = Math.max(1, totalInst - installmentsPaid);
    const originalAmount = firstAmount;
    const monthlyQuota = Math.round(originalAmount / totalInst);
    const remainingPrincipal = Math.round((originalAmount / totalInst) * remainingQuotas);

    let desc = l
      .replace(/\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{4,9})/g, '')
      .replace(/cuota\s+\d+\s*(?:de|\/)\s*\d+/gi, '')
      .replace(/\b\d{1,2}\/\d{1,2}\b/g, '')
      .replace(/\d{4}-\d{2}-\d{2}/g, '')
      .replace(/^[•\-*|:\s]+|[•\-*|:\s]+$/g, '')
      .trim();

    if (!desc || desc.length < 2) desc = `Compra Extracto #${idx + 1}`;

    purchases.push({
      id: `local-p-${Date.now()}-${idx}`,
      description: desc.substring(0, 42),
      purchaseDate: todayISO,
      originalAmount,
      installmentsTotal: totalInst,
      installmentsPaid,
      currentInstallmentNumber: currentInst,
      monthlyQuota,
      remainingPrincipal,
      interestRateMonthly: totalInst === 1 ? 0 : card.interestRateMonthly || 2.15,
      categoryId: defaultCatId,
    });
  });

  return normalizeExtractedStatement(
    {
      bankName: card.bankName,
      statementDate: todayISO,
      dueDate: todayISO,
      cutOffDay: card.cutOffDay,
      paymentDueDay: card.paymentDueDay,
      creditLimit,
      totalCurrentDebt,
      totalStatementBalance,
      minimumPayment,
      interestRateMonthly: card.interestRateMonthly,
      currentInterest,
      lateInterest: 0,
      handlingFee,
      taxesAndFees: 0,
      purchases,
    },
    card,
    categories
  );
}

