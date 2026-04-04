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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bulk_import_logs: {
        Row: {
          admin_user_id: string
          column_mapping: Json | null
          created_at: string
          error_report: Json | null
          failed_count: number
          file_name: string
          id: string
          status: string
          success_count: number
          total_rows: number
        }
        Insert: {
          admin_user_id: string
          column_mapping?: Json | null
          created_at?: string
          error_report?: Json | null
          failed_count?: number
          file_name: string
          id?: string
          status?: string
          success_count?: number
          total_rows?: number
        }
        Update: {
          admin_user_id?: string
          column_mapping?: Json | null
          created_at?: string
          error_report?: Json | null
          failed_count?: number
          file_name?: string
          id?: string
          status?: string
          success_count?: number
          total_rows?: number
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          address: string | null
          business_name: string
          city: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          logo_url: string | null
          phone: string | null
          postal_code: string | null
          state_code: string | null
          state_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_name?: string
          city?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          state_code?: string | null
          state_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_name?: string
          city?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          state_code?: string | null
          state_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_type: Database["public"]["Enums"]["category_type"]
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_type?: Database["public"]["Enums"]["category_type"]
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_type?: Database["public"]["Enums"]["category_type"]
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          order_id: string
          payment_date: string
          payment_method: string
          recorded_by: string | null
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          payment_date?: string
          payment_method?: string
          recorded_by?: string | null
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          payment_date?: string
          payment_method?: string
          recorded_by?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_run_orders: {
        Row: {
          allocated_cost: number
          created_at: string
          delivery_run_id: string
          id: string
          order_id: string
        }
        Insert: {
          allocated_cost?: number
          created_at?: string
          delivery_run_id: string
          id?: string
          order_id: string
        }
        Update: {
          allocated_cost?: number
          created_at?: string
          delivery_run_id?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_run_orders_delivery_run_id_fkey"
            columns: ["delivery_run_id"]
            isOneToOne: false
            referencedRelation: "delivery_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_run_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_runs: {
        Row: {
          cost_allocation_method: string
          created_at: string
          created_by: string | null
          driver_name: string | null
          id: string
          notes: string | null
          run_date: string
          total_cost: number
          updated_at: string
          vehicle: string | null
        }
        Insert: {
          cost_allocation_method?: string
          created_at?: string
          created_by?: string | null
          driver_name?: string | null
          id?: string
          notes?: string | null
          run_date?: string
          total_cost?: number
          updated_at?: string
          vehicle?: string | null
        }
        Update: {
          cost_allocation_method?: string
          created_at?: string
          created_by?: string | null
          driver_name?: string | null
          id?: string
          notes?: string | null
          run_date?: string
          total_cost?: number
          updated_at?: string
          vehicle?: string | null
        }
        Relationships: []
      }
      financial_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      gst_config: {
        Row: {
          category: string
          created_at: string
          default_gst_rate: number
          default_gst_type: string
          description: string | null
          hsn_code: string
          id: string
          is_configurable: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          default_gst_rate?: number
          default_gst_type?: string
          description?: string | null
          hsn_code: string
          id?: string
          is_configurable?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_gst_rate?: number
          default_gst_type?: string
          description?: string | null
          hsn_code?: string
          id?: string
          is_configurable?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_edit_logs: {
        Row: {
          action: string
          admin_user_id: string
          changes: Json
          created_at: string
          id: string
          order_id: string
          snapshot_after: Json
          snapshot_before: Json
        }
        Insert: {
          action?: string
          admin_user_id: string
          changes?: Json
          created_at?: string
          id?: string
          order_id: string
          snapshot_after?: Json
          snapshot_before?: Json
        }
        Update: {
          action?: string
          admin_user_id?: string
          changes?: Json
          created_at?: string
          id?: string
          order_id?: string
          snapshot_after?: Json
          snapshot_before?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_edit_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          actual_weight: number | null
          billed_weight: number | null
          cgst_amount: number
          created_at: string
          gst_rate: number
          gst_type: string
          hsn_code: string | null
          id: string
          igst_amount: number
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sgst_amount: number
          taxable_value: number
          total_price: number
          unit_price: number
          vendor_cost: number | null
          vendor_id: string | null
          weight_adjusted_at: string | null
        }
        Insert: {
          actual_weight?: number | null
          billed_weight?: number | null
          cgst_amount?: number
          created_at?: string
          gst_rate?: number
          gst_type?: string
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          sgst_amount?: number
          taxable_value?: number
          total_price: number
          unit_price: number
          vendor_cost?: number | null
          vendor_id?: string | null
          weight_adjusted_at?: string | null
        }
        Update: {
          actual_weight?: number | null
          billed_weight?: number | null
          cgst_amount?: number
          created_at?: string
          gst_rate?: number
          gst_type?: string
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sgst_amount?: number
          taxable_value?: number
          total_price?: number
          unit_price?: number
          vendor_cost?: number | null
          vendor_id?: string | null
          weight_adjusted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number
          balance_due: number
          building_name: string | null
          converted_to_sale: boolean | null
          created_at: string
          customer_email: string | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          financial_year_id: string | null
          flat_number: string | null
          id: string
          invoice_number: string | null
          is_igst: boolean
          notes: string | null
          order_source: string | null
          payment_status: string
          phone: string | null
          place_of_supply: string | null
          sale_converted_at: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_cost: number | null
          shipping_label_generated: boolean | null
          shipping_postal_code: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string | null
          weight_finalized: boolean | null
          weight_finalized_at: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          building_name?: string | null
          converted_to_sale?: boolean | null
          created_at?: string
          customer_email?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          financial_year_id?: string | null
          flat_number?: string | null
          id?: string
          invoice_number?: string | null
          is_igst?: boolean
          notes?: string | null
          order_source?: string | null
          payment_status?: string
          phone?: string | null
          place_of_supply?: string | null
          sale_converted_at?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_label_generated?: boolean | null
          shipping_postal_code?: string | null
          status?: string
          total_amount: number
          updated_at?: string
          user_id?: string | null
          weight_finalized?: boolean | null
          weight_finalized_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          building_name?: string | null
          converted_to_sale?: boolean | null
          created_at?: string
          customer_email?: string | null
          discount_amount?: number | null
          discount_type?: string | null
          discount_value?: number | null
          financial_year_id?: string | null
          flat_number?: string | null
          id?: string
          invoice_number?: string | null
          is_igst?: boolean
          notes?: string | null
          order_source?: string | null
          payment_status?: string
          phone?: string | null
          place_of_supply?: string | null
          sale_converted_at?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_label_generated?: boolean | null
          shipping_postal_code?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
          weight_finalized?: boolean | null
          weight_finalized_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      page_content: {
        Row: {
          content: Json
          created_at: string
          id: string
          section_key: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          section_key: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          section_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          brand: string | null
          category: string
          category_id: string | null
          created_at: string
          description: string | null
          gst_rate: number
          gst_type: string
          hsn_code: string | null
          id: string
          image_url: string | null
          in_stock: boolean | null
          is_published: boolean
          mrp: number | null
          name: string
          price: number
          pricing_model: string
          sku: string | null
          stock_quantity: number | null
          unit: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          gst_rate?: number
          gst_type?: string
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          is_published?: boolean
          mrp?: number | null
          name: string
          price: number
          pricing_model?: string
          sku?: string | null
          stock_quantity?: number | null
          unit?: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          gst_rate?: number
          gst_type?: string
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          is_published?: boolean
          mrp?: number | null
          name?: string
          price?: number
          pricing_model?: string
          sku?: string | null
          stock_quantity?: number | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          apartment_name: string | null
          city: string | null
          created_at: string
          flat_number: string | null
          full_name: string | null
          id: string
          latitude: number | null
          longitude: number | null
          phone: string | null
          postal_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          apartment_name?: string | null
          city?: string | null
          created_at?: string
          flat_number?: string | null
          full_name?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          apartment_name?: string | null
          city?: string | null
          created_at?: string
          flat_number?: string | null
          full_name?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          actual_received_weight: number | null
          created_at: string
          id: string
          order_id: string | null
          order_item_id: string | null
          product_id: string | null
          product_name: string
          purchase_order_id: string
          quantity: number
          received_at: string | null
          received_quantity: number | null
          received_remarks: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          actual_received_weight?: number | null
          created_at?: string
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          product_id?: string | null
          product_name: string
          purchase_order_id: string
          quantity: number
          received_at?: string | null
          received_quantity?: number | null
          received_remarks?: string | null
          total_cost: number
          unit_cost: number
        }
        Update: {
          actual_received_weight?: number | null
          created_at?: string
          id?: string
          order_id?: string | null
          order_item_id?: string | null
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string
          quantity?: number
          received_at?: string | null
          received_quantity?: number | null
          received_remarks?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_delivery_date: string | null
          financial_year_id: string | null
          id: string
          notes: string | null
          order_date: string
          paid_amount: number | null
          payment_status: string
          po_number: string
          received_date: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          financial_year_id?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          paid_amount?: number | null
          payment_status?: string
          po_number: string
          received_date?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          financial_year_id?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          paid_amount?: number | null
          payment_status?: string
          po_number?: string
          received_date?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          financial_year_id: string | null
          id: string
          invoice_number: string
          notes: string | null
          order_id: string
          payment_status: string
          sale_date: string
        }
        Insert: {
          created_at?: string
          financial_year_id?: string | null
          id?: string
          invoice_number: string
          notes?: string | null
          order_id: string
          payment_status?: string
          sale_date?: string
        }
        Update: {
          created_at?: string
          financial_year_id?: string | null
          id?: string
          invoice_number?: string
          notes?: string | null
          order_id?: string
          payment_status?: string
          sale_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          created_at: string
          description: string | null
          event_timestamp: string
          id: string
          location: string | null
          raw_data: Json | null
          shipment_id: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_timestamp?: string
          id?: string
          location?: string | null
          raw_data?: Json | null
          shipment_id: string
          status: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_timestamp?: string
          id?: string
          location?: string | null
          raw_data?: Json | null
          shipment_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          awb_number: string | null
          created_at: string
          delivered_at: string | null
          delivery_proof_url: string | null
          estimated_delivery: string | null
          id: string
          order_id: string
          picked_up_at: string | null
          pickup_scheduled_at: string | null
          provider_id: string | null
          raw_response: Json | null
          rider_name: string | null
          rider_phone: string | null
          shipping_cost: number | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          awb_number?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_proof_url?: string | null
          estimated_delivery?: string | null
          id?: string
          order_id: string
          picked_up_at?: string | null
          pickup_scheduled_at?: string | null
          provider_id?: string | null
          raw_response?: Json | null
          rider_name?: string | null
          rider_phone?: string | null
          shipping_cost?: number | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          awb_number?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_proof_url?: string | null
          estimated_delivery?: string | null
          id?: string
          order_id?: string
          picked_up_at?: string | null
          pickup_scheduled_at?: string | null
          provider_id?: string | null
          raw_response?: Json | null
          rider_name?: string | null
          rider_phone?: string | null
          shipping_cost?: number | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "shipping_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_providers: {
        Row: {
          api_base_url: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          supported_cities: string[] | null
          updated_at: string
        }
        Insert: {
          api_base_url?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          supported_cities?: string[] | null
          updated_at?: string
        }
        Update: {
          api_base_url?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          supported_cities?: string[] | null
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
          role?: Database["public"]["Enums"]["app_role"]
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
      vendor_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          purchase_order_id: string | null
          reference_number: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          purchase_order_id?: string | null
          reference_number?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          purchase_order_id?: string | null
          reference_number?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_products: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          is_preferred_vendor: boolean | null
          lead_time_days: number | null
          minimum_order_quantity: number | null
          notes: string | null
          product_id: string
          vendor_id: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          is_preferred_vendor?: boolean | null
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          notes?: string | null
          product_id: string
          vendor_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          is_preferred_vendor?: boolean | null
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          notes?: string | null
          product_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          pan_number: string | null
          payment_terms: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          pan_number?: string | null
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          pan_number?: string | null
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_invoice_number: { Args: never; Returns: string }
      generate_po_number: { Args: never; Returns: string }
      get_financial_year_for_date: {
        Args: { target_date: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      category_type: "fresh" | "packaged" | "gourmet"
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
      app_role: ["admin", "user"],
      category_type: ["fresh", "packaged", "gourmet"],
    },
  },
} as const
