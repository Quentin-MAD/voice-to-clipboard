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
      ai_usage_log: {
        Row: {
          cost_credits: number | null
          created_at: string
          id: number
          input_tokens: number | null
          model: string
          operation: string
          output_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cost_credits?: number | null
          created_at?: string
          id?: number
          input_tokens?: number | null
          model: string
          operation: string
          output_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cost_credits?: number | null
          created_at?: string
          id?: number
          input_tokens?: number | null
          model?: string
          operation?: string
          output_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      credit_wallets: {
        Row: {
          purchased_balance: number
          updated_at: string
          user_id: string
          voice_balance: number
        }
        Insert: {
          purchased_balance?: number
          updated_at?: string
          user_id: string
          voice_balance?: number
        }
        Update: {
          purchased_balance?: number
          updated_at?: string
          user_id?: string
          voice_balance?: number
        }
        Relationships: []
      }
      page_views: {
        Row: {
          created_at: string
          id: number
          path: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          path: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          path?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount_eur: number
          created_at: string
          currency: string | null
          environment: string
          id: string
          kind: string
          paddle_subscription_id: string | null
          paddle_transaction_id: string
          raw: Json | null
          user_id: string | null
        }
        Insert: {
          amount_eur?: number
          created_at?: string
          currency?: string | null
          environment: string
          id?: string
          kind: string
          paddle_subscription_id?: string | null
          paddle_transaction_id: string
          raw?: Json | null
          user_id?: string | null
        }
        Update: {
          amount_eur?: number
          created_at?: string
          currency?: string | null
          environment?: string
          id?: string
          kind?: string
          paddle_subscription_id?: string | null
          paddle_transaction_id?: string
          raw?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          price_id: string | null
          product_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      translations_log: {
        Row: {
          created_at: string
          id: number
          operation_type: string
          source_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          operation_type?: string
          source_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          operation_type?: string
          source_type?: string
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_purchased_credits: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
      }
      add_voice_credits: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
      }
      admin_add_credits: {
        Args: { _amount: number; _target_user: string }
        Returns: undefined
      }
      admin_add_voice_credits: {
        Args: { _amount: number; _target_user: string }
        Returns: undefined
      }
      admin_list_users: {
        Args: never
        Returns: {
          cost_usd_30d: number
          cost_usd_7d: number
          cost_usd_total: number
          created_at: string
          current_period_end: string
          email: string
          is_tester: boolean
          ops_today: number
          profit_eur_total: number
          purchased_balance: number
          revenue_eur_total: number
          sub_status: string
          subscribed: boolean
          translations_30d: number
          translations_total: number
          user_id: string
          voice_balance: number
        }[]
      }
      admin_set_credits: {
        Args: { _amount: number; _target_user: string }
        Returns: undefined
      }
      admin_set_subscription: {
        Args: { _action: string; _target_user: string }
        Returns: undefined
      }
      admin_set_tester: {
        Args: { _enable: boolean; _target_user: string }
        Returns: undefined
      }
      admin_set_voice_credits: {
        Args: { _amount: number; _target_user: string }
        Returns: undefined
      }
      consume_translation: {
        Args: { _user_id: string }
        Returns: {
          ok: boolean
          reason: string
          remaining_free: number
          remaining_purchased: number
          subscribed: boolean
        }[]
      }
      consume_translation_v2: {
        Args: { _amount?: number; _operation?: string; _user_id: string }
        Returns: {
          ok: boolean
          reason: string
          remaining_free: number
          remaining_purchased: number
          subscribed: boolean
        }[]
      }
      consume_voice_read: {
        Args: { _user_id: string }
        Returns: {
          ok: boolean
          reason: string
          remaining_voice: number
          subscribed: boolean
          voice_daily_limit: number
          voice_daily_used: number
        }[]
      }
      get_user_status: {
        Args: { _user_id: string }
        Returns: {
          daily_limit: number
          daily_reset_at: string
          daily_used: number
          free_remaining: number
          hourly_limit: number
          hourly_used: number
          purchased_balance: number
          subscribed: boolean
          voice_balance: number
          voice_daily_limit: number
          voice_daily_reset_at: string
          voice_daily_used: number
        }[]
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
      app_role: "admin" | "tester"
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
      app_role: ["admin", "tester"],
    },
  },
} as const
