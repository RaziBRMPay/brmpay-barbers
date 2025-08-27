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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      api_rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      employee_commissions: {
        Row: {
          commission_percentage: number
          created_at: string
          employee_id: string
          employee_name: string
          id: string
          merchant_id: string
          updated_at: string
        }
        Insert: {
          commission_percentage?: number
          created_at?: string
          employee_id: string
          employee_name: string
          id?: string
          merchant_id: string
          updated_at?: string
        }
        Update: {
          commission_percentage?: number
          created_at?: string
          employee_id?: string
          employee_name?: string
          id?: string
          merchant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_commissions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_sales_data: {
        Row: {
          commission_amount: number
          created_at: string
          employee_id: string
          employee_name: string
          id: string
          merchant_id: string
          sales_date: string
          total_sales: number
          updated_at: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          employee_id: string
          employee_name: string
          id?: string
          merchant_id: string
          sales_date: string
          total_sales?: number
          updated_at?: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          employee_id?: string
          employee_name?: string
          id?: string
          merchant_id?: string
          sales_date?: string
          total_sales?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_sales_data_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          created_at: string
          id: string
          shop_name: string
          timezone: Database["public"]["Enums"]["us_timezone"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shop_name: string
          timezone?: Database["public"]["Enums"]["us_timezone"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shop_name?: string
          timezone?: Database["public"]["Enums"]["us_timezone"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_merchants_user_id"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      report_pipeline_status: {
        Row: {
          completed_at: string | null
          created_at: string
          data_period_end: string | null
          data_period_start: string | null
          error_message: string | null
          id: string
          merchant_id: string
          pipeline_date: string
          retry_count: number | null
          started_at: string | null
          status: string
          step_name: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data_period_end?: string | null
          data_period_start?: string | null
          error_message?: string | null
          id?: string
          merchant_id: string
          pipeline_date: string
          retry_count?: number | null
          started_at?: string | null
          status?: string
          step_name: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data_period_end?: string | null
          data_period_start?: string | null
          error_message?: string | null
          id?: string
          merchant_id?: string
          pipeline_date?: string
          retry_count?: number | null
          started_at?: string | null
          status?: string
          step_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          merchant_id: string
          report_data: Json | null
          report_date: string
          report_type: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          merchant_id: string
          report_data?: Json | null
          report_date: string
          report_type?: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          merchant_id?: string
          report_data?: Json | null
          report_date?: string
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      secure_credentials: {
        Row: {
          created_at: string
          created_by: string
          credential_type: string
          encrypted_value: string
          id: string
          is_active: boolean
          merchant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          credential_type: string
          encrypted_value: string
          id?: string
          is_active?: boolean
          merchant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          credential_type?: string
          encrypted_value?: string
          id?: string
          is_active?: boolean
          merchant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          ip_address: unknown | null
          merchant_id: string | null
          resource_id: string | null
          resource_type: string
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown | null
          merchant_id?: string | null
          resource_id?: string | null
          resource_type: string
          success?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown | null
          merchant_id?: string | null
          resource_id?: string | null
          resource_type?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          fetch_delay_minutes: number | null
          id: string
          last_completed_report_cycle_time: string | null
          merchant_id: string
          report_delay_minutes: number | null
          report_time_cycle: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fetch_delay_minutes?: number | null
          id?: string
          last_completed_report_cycle_time?: string | null
          merchant_id: string
          report_delay_minutes?: number | null
          report_time_cycle?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fetch_delay_minutes?: number | null
          id?: string
          last_completed_report_cycle_time?: string | null
          merchant_id?: string
          report_delay_minutes?: number | null
          report_time_cycle?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_admin_stores: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          sub_admin_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          sub_admin_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          sub_admin_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_admin_stores_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_admin_stores_sub_admin_id_fkey"
            columns: ["sub_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_cron_job: {
        Args: { cron_expression: string; job_name: string; merchant_id: string }
        Returns: undefined
      }
      create_cron_job_pipeline: {
        Args: {
          cron_expression: string
          function_name: string
          job_name: string
          merchant_id: string
        }
        Returns: undefined
      }
      delete_cron_job: {
        Args: { job_name: string }
        Returns: undefined
      }
      log_security_event: {
        Args: {
          p_action: string
          p_error_message?: string
          p_merchant_id: string
          p_resource_id?: string
          p_resource_type: string
          p_success?: boolean
        }
        Returns: undefined
      }
      setup_all_merchant_cron_jobs: {
        Args: Record<PropertyKey, never>
        Returns: {
          merchant_id: string
          message: string
          shop_name: string
          success: boolean
        }[]
      }
      validate_merchant_access: {
        Args: { target_merchant_id: string }
        Returns: boolean
      }
    }
    Enums: {
      us_timezone:
        | "US/Eastern"
        | "US/Central"
        | "US/Mountain"
        | "US/Pacific"
        | "US/Alaska"
        | "US/Hawaii"
      user_role: "admin" | "sub_admin" | "merchant"
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
      us_timezone: [
        "US/Eastern",
        "US/Central",
        "US/Mountain",
        "US/Pacific",
        "US/Alaska",
        "US/Hawaii",
      ],
      user_role: ["admin", "sub_admin", "merchant"],
    },
  },
} as const
