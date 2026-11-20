import { Category, TransactionType } from '../types/finance';

export interface ParsedBankMessage {
  bankName: string;
  type: TransactionType;
  amount: number;
  description: string;
  merchant?: string;
  lastFourDigits?: string;
  sourceAccountType?: 'debit' | 'credit' | 'savings' | 'wallet';
  installments?: number;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  rawText: string;
}

const getTodayISO = (): string => new Date().toISOString().split('T')[0];

/**
 * Normaliza montos en formato colombiano o internacional:
 * Ej: "$45.900,00" -> 45900 | "$1.250.000" -> 1250000 | "$45,900.00" -> 45900
 */
function parseColombianAmount(rawAmountStr: string): number {
  let clean = rawAmountStr.trim().replace(/[$\sCOP]/gi, '');
  // Quitar punto o coma final si era puntuación de la oración (ej. "$45.000.")
  clean = clean.replace(/[.,]+$/, '');
  if (!clean) return 0;

  // Caso 1: Formato colombiano con decimales al final: "45.900,00" o "1.250.000,50"
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(clean)) {
    const withoutDecimals = clean.split(',')[0].replace(/\./g, '');
    return parseInt(withoutDecimals, 10) || 0;
  }

  // Caso 2: Formato internacional con decimales al final: "45,900.00" o "1,250,000.00"
  if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(clean)) {
    const withoutDecimals = clean.split('.')[0].replace(/,/g, '');
    return parseInt(withoutDecimals, 10) || 0;
  }

  // Caso 3: Número simple con decimales: "45900,00" o "45900.00"
  if (/^\d+[.,]\d{2}$/.test(clean)) {
    const intPart = clean.split(/[.,]/)[0];
    return parseInt(intPart, 10) || 0;
  }

  // Caso 4: Separadores de miles sin decimales: "45.900" o "1.250.000" o "45,900"
  const digitsOnly = clean.replace(/[.,]/g, '');
  return parseInt(digitsOnly, 10) || 0;
}

/**
 * Extrae la fecha en formato YYYY-MM-DD desde textos como:
 * "el 19/11/2026 a las 14:32", "19-11-2026", "2026/11/19", "19/11/26"
 */
function extractDateFromText(text: string): { date: string; time?: string } {
  const today = getTodayISO();

  // Hora opcional (ej. "14:32")
  const timeMatch = text.match(/(?:a las\s+|hora\s+)?(\d{1,2}:\d{2})(?:\s*(?:am|pm|hrs))?/i);
  const time = timeMatch ? timeMatch[1] : undefined;

  // DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2}|\d{2})\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    const mNum = parseInt(month, 10);
    const dNum = parseInt(day, 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return { date: `${year}-${month}-${day}`, time };
    }
  }

  // YYYY/MM/DD o YYYY-MM-DD
  const ymdMatch = text.match(/\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return { date: `${year}-${month}-${day}`, time };
  }

  return { date: today, time };
}

/**
 * Analizador Inteligente de Notificaciones Push y SMS Bancarios de Colombia.
 * Soporta formatos reales de:
 * - Bancolombia (Compras T.Deb, Compras T.Cred, Transferencias recibidas/enviadas, QR, Nómina, Retiros)
 * - RappiCard / RappiPay (Compras con tarjeta de crédito RappiCard, RappiCuenta)
 * - Nequi (Envíos, Recepción de plata, Pagos en comercios)
 * - Nu Colombia (La Moradita T.Cred y Cuenta Nu)
 * - Daviplata, Davivienda, BBVA, Lulo Bank, Banco de Bogotá, Falabella, Scotiabank Colpatria
 */
export function parseBankNotification(text: string): ParsedBankMessage | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 10) return null;

  // 1. Detectar Entidad Financiera / Bancaria
  let bankName = 'Banco';
  const isRappiCardExplicit = /rappicard/i.test(clean);
  const isRappiExplicit = /rappicard|rappipay|\brappi\b/i.test(clean);

  if (isRappiCardExplicit) bankName = 'RappiCard';
  else if (isRappiExplicit) bankName = 'RappiPay';
  else if (/bancolombia/i.test(clean)) bankName = 'Bancolombia';
  else if (/nequi/i.test(clean)) bankName = 'Nequi';
  else if (/\bnu\b|nubank|moradita/i.test(clean)) bankName = 'Nu';
  else if (/daviplata/i.test(clean)) bankName = 'Daviplata';
  else if (/davivienda/i.test(clean)) bankName = 'Davivienda';
  else if (/lulo\s*bank|\blulo\b/i.test(clean)) bankName = 'Lulo Bank';
  else if (/bbva/i.test(clean)) bankName = 'BBVA';
  else if (/falabella/i.test(clean)) bankName = 'Falabella';
  else if (/bogot[aá]/i.test(clean)) bankName = 'Banco de Bogotá';
  else if (/scotiabank|colpatria/i.test(clean)) bankName = 'Scotiabank';
  else if (/dale!/i.test(clean)) bankName = 'Dale!';

  // 2. Extraer Monto en COP
  let amount = 0;
  const currencyPatterns = [
    /(?:\$|COP)\s*([\d.,]+(?:\.\d{2}|,\d{2})?)/i,
    /(?:por|de|valor|monto|gastaste|compraste|recibiste|transferiste|enviaste|pagaste|retiraste)\s+\$?\s*([\d.,]+(?:\.\d{2}|,\d{2})?)/i,
  ];

  for (const regex of currencyPatterns) {
    const match = clean.match(regex);
    if (match && match[1]) {
      const parsed = parseColombianAmount(match[1]);
      if (parsed >= 100) {
        amount = parsed;
        break;
      }
    }
  }

  if (amount <= 0) return null;

  // 3. Extraer Fecha y Hora reales del mensaje
  const { date, time } = extractDateFromText(clean);

  // 4. Extraer últimos 4 dígitos de cuenta o tarjeta (*4829, T.Cred *7312, cta *1234)
  let lastFourDigits: string | undefined;
  const digitsMatch =
    clean.match(/(?:\*|terminada en\s+|t\.deb\s*\*?|t\.cred\s*\*?|cta\s*\*?|cuenta\s*\*?|tarjeta\s*\*?|rappicard\s*\*?)\s*(\d{4})\b/i);
  if (digitsMatch && digitsMatch[1]) {
    lastFourDigits = digitsMatch[1];
  }

  // 5. Extraer cuotas si las menciona (ej. "a 3 cuotas", "1 cuota")
  let installments = 1;
  const cuotasMatch = clean.match(/\ba\s*(\d{1,2})\s*cuotas?\b/i);
  if (cuotasMatch && cuotasMatch[1]) {
    installments = Math.max(1, Math.min(48, parseInt(cuotasMatch[1], 10) || 1));
  }

  // 6. Determinar Tipo de Movimiento y Producto (Tarjeta de Crédito vs Cuenta/Débito vs Ingreso)
  let type: TransactionType = 'expense';
  let sourceAccountType: ParsedBankMessage['sourceAccountType'] = 'savings';

  const isCreditCardMentioned =
    isRappiCardExplicit ||
    /t\.\s*cred|tarjeta de cr[eé]dito|compra t\.c|con tu tarjeta nu|con tu rappicard|cr[eé]dito\s*\*\d{4}/i.test(
      clean
    ) ||
    (bankName === 'Nu' && /compra aprobada|con tu tarjeta/i.test(clean) && !/débito|debito|cuenta nu/i.test(clean)) ||
    (bankName === 'RappiPay' && /tarjeta|rappicard|compra aprobada/i.test(clean));

  const isDebitMentioned =
    /t\.\s*deb|tarjeta d[eé]bito|d[eé]bito/i.test(clean);

  const isIncomeMentioned =
    /recibiste|recepci[oó]n transferencia|te transfirieron|te lleg[oó] plata|recibi[oó]|abono|consignaci[oó]n|pago de n[oó]mina|n[oó]mina de|rendimientos/i.test(
      clean
    );

  const isOutgoingTransferMentioned =
    /transferiste|transferencia por|transferencia a|enviaste|paso plata|traspaso/i.test(clean) &&
    !isIncomeMentioned;

  if (isIncomeMentioned) {
    type = 'income';
    sourceAccountType = bankName === 'Nequi' || bankName === 'Daviplata' ? 'wallet' : 'savings';
  } else if (isCreditCardMentioned) {
    type = 'card_purchase';
    sourceAccountType = 'credit';
  } else if (isDebitMentioned) {
    type = 'expense';
    sourceAccountType = 'debit';
  } else if (isOutgoingTransferMentioned) {
    // Las transferencias enviadas a terceros se registran como gasto de la cuenta origen
    type = 'expense';
    sourceAccountType = bankName === 'Nequi' || bankName === 'Daviplata' ? 'wallet' : 'savings';
  } else {
    type = 'expense';
  }

  // 7. Extraer Lugar / Comercio / Remitente / Destinatario con precisión
  let merchant: string | undefined;
  let description = '';

  if (type === 'income') {
    // Ej: "Recibiste una transferencia por $250.000,00 de ANDRES PEREZ en tu cuenta"
    // Ej: "Recepcion transferencia de CARLOS GOMEZ por $180.000"
    // Ej: "Recibiste un pago de Nómina de EMPRESA SAS por $2.500.000"
    const senderMatch =
      clean.match(/(?:pago de n[oó]mina de|transferencia de|recibiste[^.]+?de|recibi[oó][^.]+?de)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s.&\-]+?)(?:\s+por\s+|\s+en\s+tu|\s+en\s+la|\s+el\s+\d|,|\.|$)/i);

    if (senderMatch && senderMatch[1]) {
      const sender = senderMatch[1].trim();
      if (sender.length >= 2) {
        merchant = sender;
        description = /n[oó]mina/i.test(clean)
          ? `Nómina ${sender}`
          : `Transferencia de ${sender}`;
      }
    }
    if (!description) {
      description = /n[oó]mina/i.test(clean)
        ? `Pago de Nómina (${bankName})`
        : `Transferencia recibida en ${bankName}`;
    }
  } else if (isOutgoingTransferMentioned) {
    // Ej: "Enviaste $35.000 a Carlos Mario al 300..." o "Transferiste $80.000 desde tu cuenta *1234 a la cuenta *5678"
    const recipientMatch = clean.match(
      /(?:enviaste[^.]+?a|transferiste[^.]+?a|transferencia[^.]+?a)\s+(?:la\s+cuenta\s+|cta\s+)?([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s.*\-]+?)(?:\s+al\s+\d|\s+el\s+\d|,|\.|$)/i
    );
    if (recipientMatch && recipientMatch[1]) {
      const recipient = recipientMatch[1].trim();
      merchant = recipient;
      description = `Transferencia a ${recipient}`;
    } else {
      description = `Transferencia desde ${bankName}`;
    }
  } else if (/retiraste|retiro/i.test(clean)) {
    const atmMatch = clean.match(
      /(?:en|cajero)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s._\-&]+?)(?:\s+de\s+tu|\s+desde|\s+el\s+\d|,|\.|$)/i
    );
    merchant = atmMatch?.[1]?.trim();
    description = merchant ? `Retiro en ${merchant}` : `Retiro ${bankName}`;
  } else {
    // Compras en comercios (Bancolombia, RappiCard, Nu, Nequi, etc.)
    // Ej: "Compraste $45.900,00 en D1 SAS con tu T.Deb *4829"
    // Ej: "compra por $45.000 en EXITO WOW con T.Deb"
    // Ej: "Compra aprobada por $64.900 en CREPES Y WAFFLES el 19/11/2026"
    // Ej: "Pagaste $32.000 con QR desde tu cuenta *1234 a PANADERIA EL SOL el..."
    const placeMatch =
      clean.match(
        /\ben\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s._\-&*]+?)(?:\s+con\s+tu|\s+con\s+t\.|\s+con\s+tarjeta|\s+fue\s+aprobada|\s+a\s+\d+\s+cuota|\s+el\s+\d|\s+por\s+\$|,|\.|$)/i
      ) ||
      clean.match(
        /\b(?:pagaste|qr)[^.]+?\ba\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s._\-&]+?)(?:\s+el\s+\d|,|\.|$)/i
      );

    if (placeMatch && placeMatch[1]) {
      const candidate = placeMatch[1].trim();
      if (
        candidate.length >= 2 &&
        !/^(tu\s+cuenta|la\s+cuenta|tu\s+nequi|tu\s+rappicuenta)$/i.test(candidate)
      ) {
        merchant = candidate.substring(0, 38);
        description = merchant;
      }
    }

    if (!description) {
      description =
        type === 'card_purchase'
          ? `Compra con ${bankName}`
          : `Compra ${bankName}`;
    }
  }

  return {
    bankName,
    type,
    amount,
    description,
    merchant,
    lastFourDigits,
    sourceAccountType,
    installments,
    date,
    time,
    rawText: clean,
  };
}

/**
 * Sugiere automáticamente la categoría más adecuada según el comercio o concepto detectado.
 */
export function guessCategoryForNotification(
  parsed: ParsedBankMessage,
  categories: Category[]
): string {
  const targetType = parsed.type === 'income' ? 'income' : 'expense';
  const available = categories.filter((c) => c.type === targetType);
  if (available.length === 0) {
    return parsed.type === 'income' ? 'cat-salary' : 'cat-food';
  }

  const textToSearch = `${parsed.description} ${parsed.merchant || ''} ${parsed.rawText}`.toLowerCase();

  // 1. Buscar coincidencia en keywords configuradas de las categorías
  const keywordMatch = available.find(
    (cat) =>
      textToSearch.includes(cat.name.toLowerCase()) ||
      cat.keywords?.some((kw) => textToSearch.includes(kw.toLowerCase()))
  );
  if (keywordMatch) return keywordMatch.id;

  // 2. Reglas heurísticas de comercios colombianos frecuentes
  if (targetType === 'expense') {
    if (
      /d1|ara|exito|éxito|carulla|jumbo|olimpica|olímpica|makro|alkosto|merqueo|rappi|crepes|frisby|restaurante|panaderia|panadería|cafe|café|starbucks|juan valdez|mcdonald|burger|corral|almuerzo|comida|supermercado/i.test(
        textToSearch
      )
    ) {
      return available.find((c) => c.id === 'cat-food' || /alimenta|comida|mercado/i.test(c.name))?.id || available[0].id;
    }
    if (
      /uber|didi|cabify|indriver|taxi|transmilenio|metro|mio|gasolina|terpel|primax|texaco|peaje|parqueadero|transporte|latam|avianca|wingo/i.test(
        textToSearch
      )
    ) {
      return available.find((c) => c.id === 'cat-transport' || /transporte/i.test(c.name))?.id || available[0].id;
    }
    if (
      /netflix|spotify|disney|hbo|max|prime|youtube|cine|cinemark|cinecolombia|playstation|xbox|steam|entretenimiento/i.test(
        textToSearch
      )
    ) {
      return available.find((c) => c.id === 'cat-entertainment' || /entretenimiento|ocio/i.test(c.name))?.id || available[0].id;
    }
    if (
      /epm|enel|vanti|acueducto|claro|movistar|tigo|wom|etb|arriendo|administracion|servicio/i.test(
        textToSearch
      )
    ) {
      return available.find((c) => c.id === 'cat-housing' || c.id === 'cat-services' || /hogar|servicio/i.test(c.name))?.id || available[0].id;
    }
    if (/farmatodo|cruz verde|la rebaja|drogueria|droguería|eps|sura|sanitas|salud|medico/i.test(textToSearch)) {
      return available.find((c) => c.id === 'cat-health' || /salud/i.test(c.name))?.id || available[0].id;
    }
  }

  return available[0].id;
}
