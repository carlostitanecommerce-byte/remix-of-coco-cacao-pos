export interface PaqueteComponente {
  producto_id: string;
  nombre: string;
  cantidad: number;
}

export interface CartItem {
  producto_id: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  subtotal: number;
  tipo_concepto: 'producto' | 'coworking' | 'amenity' | 'paquete';
  coworking_session_id?: string;
  descripcion?: string;
  paquete_id?: string;
  componentes?: PaqueteComponente[];
  notas?: string;
}

export interface VentaConfig {
  iva_porcentaje: number;
  comision_bancaria_porcentaje: number;
}

export interface MixedPayment {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
}

export interface VentaSummary {
  items: CartItem[];
  subtotal: number;
  iva: number;
  comision: number;
  propina: number;
  total: number;
  metodo_pago: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';
  tipo_consumo: 'sitio' | 'para_llevar' | 'delivery';
  mixed_payment?: MixedPayment;
  propina_en_digital?: boolean;
  coworking_session_id?: string;
  caja_id?: string;
  usuario_nombre?: string;
  fecha?: string;
  folio?: number;
}
