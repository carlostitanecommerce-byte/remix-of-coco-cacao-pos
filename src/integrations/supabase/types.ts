export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas_coworking: {
        Row: {
          capacidad_pax: number
          created_at: string
          es_privado: boolean
          id: string
          nombre_area: string
          precio_por_hora: number
          updated_at: string
        }
        Insert: {
          capacidad_pax?: number
          created_at?: string
          es_privado?: boolean
          id?: string
          nombre_area: string
          precio_por_hora?: number
          updated_at?: string
        }
        Update: {
          capacidad_pax?: number
          created_at?: string
          es_privado?: boolean
          id?: string
          nombre_area?: string
          precio_por_hora?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          accion: string
          created_at: string
          descripcion: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          accion: string
          created_at?: string
          descripcion?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          accion?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      cajas: {
        Row: {
          created_at: string
          diferencia: number | null
          estado: Database["public"]["Enums"]["caja_estado"]
          fecha_apertura: string
          fecha_cierre: string | null
          folio: number
          id: string
          monto_apertura: number
          monto_cierre: number | null
          notas_cierre: string | null
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          diferencia?: number | null
          estado?: Database["public"]["Enums"]["caja_estado"]
          fecha_apertura?: string
          fecha_cierre?: string | null
          folio?: number
          id?: string
          monto_apertura?: number
          monto_cierre?: number | null
          notas_cierre?: string | null
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          diferencia?: number | null
          estado?: Database["public"]["Enums"]["caja_estado"]
          fecha_apertura?: string
          fecha_cierre?: string | null
          folio?: number
          id?: string
          monto_apertura?: number
          monto_cierre?: number | null
          notas_cierre?: string | null
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      categorias_maestras: {
        Row: {
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      compras_insumos: {
        Row: {
          cantidad_presentaciones: number
          cantidad_unidades: number
          costo_presentacion: number
          costo_total: number
          created_at: string
          fecha: string
          id: string
          insumo_id: string
          nota: string | null
          usuario_id: string
        }
        Insert: {
          cantidad_presentaciones?: number
          cantidad_unidades?: number
          costo_presentacion?: number
          costo_total?: number
          created_at?: string
          fecha?: string
          id?: string
          insumo_id: string
          nota?: string | null
          usuario_id: string
        }
        Update: {
          cantidad_presentaciones?: number
          cantidad_unidades?: number
          costo_presentacion?: number
          costo_total?: number
          created_at?: string
          fecha?: string
          id?: string
          insumo_id?: string
          nota?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_ventas: {
        Row: {
          clave: string
          id: string
          updated_at: string
          valor: number
        }
        Insert: {
          clave: string
          id?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          clave?: string
          id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      coworking_reservaciones: {
        Row: {
          area_id: string
          cliente_nombre: string
          created_at: string
          duracion_horas: number
          estado: Database["public"]["Enums"]["reservacion_estado"]
          fecha_reserva: string
          hora_inicio: string
          id: string
          notas: string | null
          pax_count: number
          updated_at: string
          usuario_id: string
        }
        Insert: {
          area_id: string
          cliente_nombre: string
          created_at?: string
          duracion_horas?: number
          estado?: Database["public"]["Enums"]["reservacion_estado"]
          fecha_reserva: string
          hora_inicio: string
          id?: string
          notas?: string | null
          pax_count?: number
          updated_at?: string
          usuario_id: string
        }
        Update: {
          area_id?: string
          cliente_nombre?: string
          created_at?: string
          duracion_horas?: number
          estado?: Database["public"]["Enums"]["reservacion_estado"]
          fecha_reserva?: string
          hora_inicio?: string
          id?: string
          notas?: string | null
          pax_count?: number
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coworking_reservaciones_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_coworking"
            referencedColumns: ["id"]
          },
        ]
      }
      coworking_session_upsells: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          precio_especial: number
          producto_id: string
          session_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: string
          precio_especial?: number
          producto_id: string
          session_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          precio_especial?: number
          producto_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coworking_session_upsells_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coworking_session_upsells_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coworking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coworking_sessions: {
        Row: {
          area_id: string
          cliente_nombre: string
          created_at: string
          estado: Database["public"]["Enums"]["coworking_estado"]
          fecha_fin_estimada: string
          fecha_inicio: string
          fecha_salida_real: string | null
          id: string
          monto_acumulado: number
          pax_count: number
          tarifa_id: string | null
          updated_at: string
          upsell_precio: number | null
          upsell_producto_id: string | null
          usuario_id: string
        }
        Insert: {
          area_id: string
          cliente_nombre: string
          created_at?: string
          estado?: Database["public"]["Enums"]["coworking_estado"]
          fecha_fin_estimada: string
          fecha_inicio?: string
          fecha_salida_real?: string | null
          id?: string
          monto_acumulado?: number
          pax_count?: number
          tarifa_id?: string | null
          updated_at?: string
          upsell_precio?: number | null
          upsell_producto_id?: string | null
          usuario_id: string
        }
        Update: {
          area_id?: string
          cliente_nombre?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["coworking_estado"]
          fecha_fin_estimada?: string
          fecha_inicio?: string
          fecha_salida_real?: string | null
          id?: string
          monto_acumulado?: number
          pax_count?: number
          tarifa_id?: string | null
          updated_at?: string
          upsell_precio?: number | null
          upsell_producto_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coworking_sessions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_coworking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coworking_sessions_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas_coworking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coworking_sessions_upsell_producto_id_fkey"
            columns: ["upsell_producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      detalle_ventas: {
        Row: {
          cantidad: number
          coworking_session_id: string | null
          created_at: string
          descripcion: string | null
          id: string
          precio_unitario: number
          producto_id: string | null
          subtotal: number
          tipo_concepto: Database["public"]["Enums"]["tipo_concepto"]
          venta_id: string
        }
        Insert: {
          cantidad?: number
          coworking_session_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number
          tipo_concepto?: Database["public"]["Enums"]["tipo_concepto"]
          venta_id: string
        }
        Update: {
          cantidad?: number
          coworking_session_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number
          tipo_concepto?: Database["public"]["Enums"]["tipo_concepto"]
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "detalle_ventas_coworking_session_id_fkey"
            columns: ["coworking_session_id"]
            isOneToOne: false
            referencedRelation: "coworking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detalle_ventas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detalle_ventas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          cantidad_por_presentacion: number
          categoria: string
          costo_presentacion: number
          costo_unitario: number
          created_at: string
          id: string
          nombre: string
          presentacion: string
          stock_actual: number
          stock_minimo: number
          unidad_medida: string
          updated_at: string
        }
        Insert: {
          cantidad_por_presentacion?: number
          categoria?: string
          costo_presentacion?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          nombre: string
          presentacion?: string
          stock_actual?: number
          stock_minimo?: number
          unidad_medida?: string
          updated_at?: string
        }
        Update: {
          cantidad_por_presentacion?: number
          categoria?: string
          costo_presentacion?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          nombre?: string
          presentacion?: string
          stock_actual?: number
          stock_minimo?: number
          unidad_medida?: string
          updated_at?: string
        }
        Relationships: []
      }
      kds_order_items: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          kds_order_id: string
          nombre_producto: string
          notas: string | null
          producto_id: string | null
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: string
          kds_order_id: string
          nombre_producto: string
          notas?: string | null
          producto_id?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          kds_order_id?: string
          nombre_producto?: string
          notas?: string | null
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kds_order_items_kds_order_id_fkey"
            columns: ["kds_order_id"]
            isOneToOne: false
            referencedRelation: "kds_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_order_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_orders: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["kds_estado"]
          folio: number
          id: string
          tipo_consumo: string
          updated_at: string
          venta_id: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["kds_estado"]
          folio: number
          id?: string
          tipo_consumo?: string
          updated_at?: string
          venta_id: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["kds_estado"]
          folio?: number
          id?: string
          tipo_consumo?: string
          updated_at?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kds_orders_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      mermas: {
        Row: {
          cantidad: number
          created_at: string
          fecha: string
          id: string
          insumo_id: string
          motivo: string
          usuario_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          fecha?: string
          id?: string
          insumo_id: string
          motivo: string
          usuario_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          fecha?: string
          id?: string
          insumo_id?: string
          motivo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mermas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_caja: {
        Row: {
          caja_id: string
          created_at: string
          id: string
          monto: number
          motivo: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          caja_id: string
          created_at?: string
          id?: string
          monto?: number
          motivo: string
          tipo: string
          usuario_id: string
        }
        Update: {
          caja_id?: string
          created_at?: string
          id?: string
          monto?: number
          motivo?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria: string
          costo_total: number
          created_at: string
          id: string
          imagen_url: string | null
          instrucciones_preparacion: string | null
          margen: number
          nombre: string
          precio_upsell_coworking: number | null
          precio_venta: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria?: string
          costo_total?: number
          created_at?: string
          id?: string
          imagen_url?: string | null
          instrucciones_preparacion?: string | null
          margen?: number
          nombre: string
          precio_upsell_coworking?: number | null
          precio_venta?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: string
          costo_total?: number
          created_at?: string
          id?: string
          imagen_url?: string | null
          instrucciones_preparacion?: string | null
          margen?: number
          nombre?: string
          precio_upsell_coworking?: number | null
          precio_venta?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nombre: string
          password_encrypted: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          nombre?: string
          password_encrypted?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nombre?: string
          password_encrypted?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      recetas: {
        Row: {
          cantidad_necesaria: number
          created_at: string
          id: string
          insumo_id: string
          producto_id: string
        }
        Insert: {
          cantidad_necesaria?: number
          created_at?: string
          id?: string
          insumo_id: string
          producto_id: string
        }
        Update: {
          cantidad_necesaria?: number
          created_at?: string
          id?: string
          insumo_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recetas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_cancelacion: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["solicitud_cancelacion_estado"]
          id: string
          motivo: string
          motivo_rechazo: string | null
          revisado_por: string | null
          solicitante_id: string
          updated_at: string
          venta_id: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["solicitud_cancelacion_estado"]
          id?: string
          motivo: string
          motivo_rechazo?: string | null
          revisado_por?: string | null
          solicitante_id: string
          updated_at?: string
          venta_id: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["solicitud_cancelacion_estado"]
          id?: string
          motivo?: string
          motivo_rechazo?: string | null
          revisado_por?: string | null
          solicitante_id?: string
          updated_at?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_cancelacion_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_cancelacion_sesiones: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["solicitud_cancelacion_sesion_estado"]
          id: string
          motivo: string
          motivo_rechazo: string | null
          revisado_por: string | null
          session_id: string
          solicitante_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["solicitud_cancelacion_sesion_estado"]
          id?: string
          motivo: string
          motivo_rechazo?: string | null
          revisado_por?: string | null
          session_id: string
          solicitante_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["solicitud_cancelacion_sesion_estado"]
          id?: string
          motivo?: string
          motivo_rechazo?: string | null
          revisado_por?: string | null
          session_id?: string
          solicitante_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_cancelacion_sesiones_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coworking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifa_amenities_incluidos: {
        Row: {
          cantidad_incluida: number
          created_at: string
          id: string
          producto_id: string
          tarifa_id: string
        }
        Insert: {
          cantidad_incluida?: number
          created_at?: string
          id?: string
          producto_id: string
          tarifa_id: string
        }
        Update: {
          cantidad_incluida?: number
          created_at?: string
          id?: string
          producto_id?: string
          tarifa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarifa_amenities_incluidos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifa_amenities_incluidos_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas_coworking"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifa_upsells: {
        Row: {
          created_at: string
          id: string
          precio_especial: number
          producto_id: string
          tarifa_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          precio_especial?: number
          producto_id: string
          tarifa_id: string
        }
        Update: {
          created_at?: string
          id?: string
          precio_especial?: number
          producto_id?: string
          tarifa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarifa_upsells_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifa_upsells_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas_coworking"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifas_coworking: {
        Row: {
          activo: boolean
          areas_aplicables: string[]
          created_at: string
          id: string
          nombre: string
          precio_base: number
          tipo_cobro: Database["public"]["Enums"]["tipo_cobro"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          areas_aplicables?: string[]
          created_at?: string
          id?: string
          nombre: string
          precio_base?: number
          tipo_cobro?: Database["public"]["Enums"]["tipo_cobro"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          areas_aplicables?: string[]
          created_at?: string
          id?: string
          nombre?: string
          precio_base?: number
          tipo_cobro?: Database["public"]["Enums"]["tipo_cobro"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ventas: {
        Row: {
          comisiones_bancarias: number
          coworking_session_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["venta_estado"]
          fecha: string
          folio: number
          id: string
          iva: number
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto_efectivo: number
          monto_propina: number
          monto_tarjeta: number
          monto_transferencia: number
          motivo_cancelacion: string | null
          tipo_consumo: Database["public"]["Enums"]["tipo_consumo"]
          total_bruto: number
          total_neto: number
          updated_at: string
          usuario_id: string
        }
        Insert: {
          comisiones_bancarias?: number
          coworking_session_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["venta_estado"]
          fecha?: string
          folio?: number
          id?: string
          iva?: number
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto_efectivo?: number
          monto_propina?: number
          monto_tarjeta?: number
          monto_transferencia?: number
          motivo_cancelacion?: string | null
          tipo_consumo?: Database["public"]["Enums"]["tipo_consumo"]
          total_bruto?: number
          total_neto?: number
          updated_at?: string
          usuario_id: string
        }
        Update: {
          comisiones_bancarias?: number
          coworking_session_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["venta_estado"]
          fecha?: string
          folio?: number
          id?: string
          iva?: number
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto_efectivo?: number
          monto_propina?: number
          monto_tarjeta?: number
          monto_transferencia?: number
          motivo_cancelacion?: string | null
          tipo_consumo?: Database["public"]["Enums"]["tipo_consumo"]
          total_bruto?: number
          total_neto?: number
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_coworking_session_id_fkey"
            columns: ["coworking_session_id"]
            isOneToOne: false
            referencedRelation: "coworking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      encrypt_and_save_password: {
        Args: { p_password: string; p_user_id: string; p_username: string }
        Returns: undefined
      }
      get_decrypted_password: { Args: { p_user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "administrador"
        | "supervisor"
        | "caja"
        | "barista"
        | "recepcion"
      caja_estado: "abierta" | "cerrada"
      coworking_estado: "activo" | "finalizado" | "cancelado" | "pendiente_pago"
      kds_estado: "pendiente" | "listo"
      metodo_pago: "efectivo" | "tarjeta" | "transferencia" | "mixto"
      reservacion_estado:
        | "pendiente"
        | "confirmada"
        | "cancelada"
        | "completada"
      solicitud_cancelacion_estado: "pendiente" | "aprobada" | "rechazada"
      solicitud_cancelacion_sesion_estado:
        | "pendiente"
        | "aprobada"
        | "rechazada"
      tipo_cobro: "hora" | "dia" | "mes" | "paquete_horas"
      tipo_concepto: "producto" | "coworking" | "amenity"
      tipo_consumo: "sitio" | "para_llevar" | "delivery"
      venta_estado: "completada" | "cancelada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrador", "supervisor", "caja", "barista", "recepcion"],
      caja_estado: ["abierta", "cerrada"],
      coworking_estado: ["activo", "finalizado", "cancelado", "pendiente_pago"],
      kds_estado: ["pendiente", "listo"],
      metodo_pago: ["efectivo", "tarjeta", "transferencia", "mixto"],
      reservacion_estado: [
        "pendiente",
        "confirmada",
        "cancelada",
        "completada",
      ],
      solicitud_cancelacion_estado: ["pendiente", "aprobada", "rechazada"],
      solicitud_cancelacion_sesion_estado: [
        "pendiente",
        "aprobada",
        "rechazada",
      ],
      tipo_cobro: ["hora", "dia", "mes", "paquete_horas"],
      tipo_concepto: ["producto", "coworking", "amenity"],
      tipo_consumo: ["sitio", "para_llevar", "delivery"],
      venta_estado: ["completada", "cancelada"],
    },
  },
} as const
