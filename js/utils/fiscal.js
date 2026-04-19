// ═══════════════════════════════════════════════════════════════
// FISCAL — claves AEAT, tipos IRPF automáticos, recargo equivalencia
// ═══════════════════════════════════════════════════════════════

/**
 * Claves de tipo de operación del modelo 303 (Libro Registro de Facturas Recibidas).
 */
export const CLAVES_OPERACION = [
  { value: '01', label: '01 · Operación interior (régimen general)' },
  { value: '02', label: '02 · Exportación' },
  { value: '03', label: '03 · Operaciones con bienes' },
  { value: '04', label: '04 · Régimen especial oro de inversión' },
  { value: '05', label: '05 · Régimen especial agencias de viajes' },
  { value: '06', label: '06 · Régimen especial grupo de entidades' },
  { value: '07', label: '07 · Régimen especial criterio de caja' },
  { value: '08', label: '08 · Operaciones sujetas al IPSI/IGIC (Ceuta/Melilla/Canarias)' },
  { value: '09', label: '09 · Adquisiciones intracomunitarias' },
  { value: '11', label: '11 · Arrendamiento de local de negocio sujeto a retención' },
  { value: '12', label: '12 · Arrendamiento de local sin retención' },
  { value: '13', label: '13 · Importaciones' },
  { value: '14', label: '14 · Inversión del sujeto pasivo (ISP)' },
  { value: '16', label: '16 · Primas de seguros' },
  { value: '53', label: '53 · Operaciones no sujetas' }
];

/**
 * Tipos de retención IRPF más comunes en facturas.
 */
export const TIPOS_IRPF = [
  { value: 0,  label: '0% (sin retención)' },
  { value: 2,  label: '2% (agrarias)' },
  { value: 7,  label: '7% (profesionales nuevos - 3 primeros años)' },
  { value: 15, label: '15% (profesionales - general)' },
  { value: 19, label: '19% (arrendamientos urbanos)' }
];

/**
 * Tipos de recargo de equivalencia (comerciantes minoristas).
 * Asociado a cada tipo de IVA general.
 */
export const RECARGO_EQUIVALENCIA = {
  4:  0.5,   // IVA 4% → recargo 0,5%
  10: 1.4,   // IVA 10% → recargo 1,4%
  21: 5.2    // IVA 21% → recargo 5,2%
  // IVA 0% → sin recargo
};

/**
 * Detecta si un NIF es de persona física (DNI 8 dígitos + letra).
 * Útil para sugerir IRPF automático en facturas de autónomos.
 */
export function esNifPersonaFisica(nif) {
  if (!nif) return false;
  const n = String(nif).toUpperCase().trim();
  return /^\d{8}[A-Z]$/.test(n) || /^[XYZ]\d{7}[A-Z]$/.test(n);
}

/**
 * Sugerencia de IRPF según categoría + NIF.
 * Retorna { tipo, motivo } o null si no aplica.
 */
export function sugerenciaIrpf({ categoria, nifProveedor }) {
  if (categoria === 'Servicios profesionales' && esNifPersonaFisica(nifProveedor)) {
    return { tipo: 15, motivo: 'Factura de autónomo — IRPF 15% estándar. Si es nuevo autónomo (primeros 3 años) puedes cambiar a 7%.' };
  }
  if (categoria === 'Alojamiento' && nifProveedor && !esNifPersonaFisica(nifProveedor)) {
    // Alquiler de local
    return null;
  }
  return null;
}

/**
 * Detecta si un total pagado > total factura sugiere una propina.
 * Devuelve { propina, motivo } o null.
 */
export function detectarPropina({ total, totalPagado }) {
  if (!total || !totalPagado) return null;
  const diff = totalPagado - total;
  if (diff > 0.5 && diff < total * 0.3) {  // entre 0,50€ y 30% del total
    return { propina: +diff.toFixed(2), motivo: 'Diferencia entre total factura y total pagado' };
  }
  return null;
}

/**
 * Valida formato de matrícula española.
 * Formato nuevo: 0000 AAA (4 dígitos + 3 letras sin vocales)
 * Formato viejo: A 0000 AA o AA 0000 AA
 */
export function validarMatricula(m) {
  if (!m) return false;
  const s = String(m).toUpperCase().replace(/[\s\-]/g, '');
  if (/^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/.test(s)) return true;
  if (/^[A-Z]{1,2}\d{4}[A-Z]{2}$/.test(s)) return true;
  return false;
}

/**
 * Categorías que indican desplazamiento en vehículo (para sugerir matrícula).
 */
export const CATEGORIAS_CON_MATRICULA = ['Combustible', 'Transporte'];

/**
 * Categorías de hotel (para sugerir campos de pernocta).
 */
export const CATEGORIAS_HOTEL = ['Alojamiento'];
