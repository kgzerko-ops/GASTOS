// ═══════════════════════════════════════════════════════════════
// QUICK CAPTURE — Detector de tipo de ticket por palabras clave
//
// Detecta el tipo de gasto a partir del texto OCR para sugerir
// una UI minimalista que solo pide los campos críticos.
//
// Tipos detectados:
//   - restaurante: bar, restaurante, café, menú, mesa
//   - combustible: gasolina, gasoil, repsol, cepsa, bp, shell
//   - parking: parking, aparcamiento, saba, ola
//   - taxi: taxi, cabify, uber, free now
//   - hotel: hotel, hostal, pernoctación, check-in
//   - supermercado: mercadona, carrefour, dia, lidl, alcampo
//   - otro: cualquier cosa que no encaje
// ═══════════════════════════════════════════════════════════════

export const TICKET_TYPES = {
  restaurante:   { label: 'Restauración',  icon: '🍽️', categoria: 'Restauración', tipoIva: 10 },
  combustible:   { label: 'Combustible',   icon: '⛽',  categoria: 'Combustible',  tipoIva: 21 },
  parking:       { label: 'Aparcamiento',  icon: '🅿️',  categoria: 'Transporte',   tipoIva: 21 },
  taxi:          { label: 'Taxi/VTC',      icon: '🚖',  categoria: 'Transporte',   tipoIva: 10 },
  hotel:         { label: 'Alojamiento',   icon: '🏨',  categoria: 'Alojamiento',  tipoIva: 10 },
  supermercado:  { label: 'Supermercado',  icon: '🛒',  categoria: 'Material',     tipoIva: 10 },
  otro:          { label: 'Otro',          icon: '🧾',  categoria: 'Otros',        tipoIva: 21 }
};

const KEYWORDS = {
  restaurante: [
    'restaurante', 'restaurant', 'bar ', ' bar', 'café', 'cafeteria', 'cafetería',
    'menú', 'menu del día', 'menú del día', 'mesa nº', 'mesa n', 'comensal',
    'tapas', 'pizzería', 'pizzeria', 'cervecería', 'cerveceria', 'asador',
    'taberna', 'gastrobar', 'cocktail', 'comida', 'cena', 'desayuno'
  ],
  combustible: [
    'gasolina', 'gasoil', 'gasóleo', 'diesel', 'sin plomo', 'litros',
    'repsol', 'cepsa', ' bp ', 'shell', 'galp', 'avia',
    'estación de servicio', 'estacion de servicio', 'surtidor', 'carburante'
  ],
  parking: [
    'parking', 'aparcamiento', 'parquímetro', 'parquimetro',
    'saba', 'empark', 'ola ', 'b:smart', 'apk2', 'plaza de garaje',
    'estancia parking', 'tiempo aparcamiento'
  ],
  taxi: [
    'taxi', 'cabify', 'uber', 'free now', 'mytaxi', 'bolt',
    'licencia taxi', 'recibo carrera', 'tarifa taxi'
  ],
  hotel: [
    'hotel', 'hostal', 'pension', 'pensión', 'hospedaje',
    'pernoctación', 'pernoctacion', 'noche/s', 'check-in', 'check in',
    'habitación', 'habitacion', 'reserva alojamiento'
  ],
  supermercado: [
    'mercadona', 'carrefour', ' dia ', ' lidl', 'alcampo', 'eroski',
    'consum', 'aldi', 'caprabo', 'supermercado', 'hipermercado',
    'cesta de compra'
  ]
};

/**
 * Detecta el tipo de ticket dado el texto OCR.
 *
 * @param {string} text - texto plano del OCR
 * @param {string} proveedor - nombre del proveedor extraído (refuerzo)
 * @returns {{ type: string, confidence: number }}
 */
export function detectTicketType(text = '', proveedor = '') {
  const haystack = (text + ' ' + proveedor).toLowerCase();
  if (!haystack.trim()) return { type: 'otro', confidence: 0 };

  const scores = {};
  for (const [type, words] of Object.entries(KEYWORDS)) {
    let hits = 0;
    for (const word of words) {
      if (haystack.includes(word.toLowerCase())) hits++;
    }
    if (hits > 0) scores[type] = hits;
  }

  if (Object.keys(scores).length === 0) {
    return { type: 'otro', confidence: 0 };
  }

  let bestType = 'otro';
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; bestType = type; }
  }

  // Confianza: 1 hit = 0.5, 2 hits = 0.75, 3+ hits = 0.9
  const confidence = bestScore >= 3 ? 0.9 : bestScore >= 2 ? 0.75 : 0.5;
  return { type: bestType, confidence };
}

/**
 * Devuelve los campos relevantes para un tipo de ticket dado.
 * Los demás se autocompletan con valores por defecto.
 */
export function getRelevantFields(type) {
  const common = ['fecha', 'total', 'proveedor'];
  const variants = {
    restaurante:  [...common, 'numeroDocumento'],
    combustible:  [...common, 'nifProveedor', 'baseImponible'],
    parking:      [...common],
    taxi:         [...common],
    hotel:        [...common, 'nifProveedor', 'baseImponible', 'numeroDocumento'],
    supermercado: [...common, 'nifProveedor'],
    otro:         [...common, 'nifProveedor', 'baseImponible', 'tipoIva', 'numeroDocumento']
  };
  return variants[type] || variants.otro;
}
