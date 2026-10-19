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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academy_lessons: {
        Row: {
          content_json: Json
          created_at: string
          id: string
          level_id: string
          order_index: number
          title: string
          updated_at: string
        }
        Insert: {
          content_json?: Json
          created_at?: string
          id?: string
          level_id: string
          order_index: number
          title: string
          updated_at?: string
        }
        Update: {
          content_json?: Json
          created_at?: string
          id?: string
          level_id?: string
          order_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_lessons_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_levels: {
        Row: {
          book_reference: string
          created_at: string
          id: string
          level_number: number
          title: string
        }
        Insert: {
          book_reference: string
          created_at?: string
          id?: string
          level_number: number
          title: string
        }
        Update: {
          book_reference?: string
          created_at?: string
          id?: string
          level_number?: number
          title?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          asset_type: string
          category: string | null
          change_24h: number | null
          change_30d: number | null
          created_at: string
          currency: string
          current_price: number
          has_options: boolean | null
          high_24h: number | null
          id: string
          is_meme: boolean | null
          is_popular: boolean | null
          is_tradable: boolean
          low_24h: number | null
          name: string
          price_source: string | null
          price_updated_at: string | null
          quote_is_delayed: boolean
          sell_price: number | null
          signal_type: string | null
          ticker: string
          updated_at: string
          volatility_1d: number | null
        }
        Insert: {
          asset_type: string
          category?: string | null
          change_24h?: number | null
          change_30d?: number | null
          created_at?: string
          currency?: string
          current_price: number
          has_options?: boolean | null
          high_24h?: number | null
          id?: string
          is_meme?: boolean | null
          is_popular?: boolean | null
          is_tradable?: boolean
          low_24h?: number | null
          name: string
          price_source?: string | null
          price_updated_at?: string | null
          quote_is_delayed?: boolean
          sell_price?: number | null
          signal_type?: string | null
          ticker: string
          updated_at?: string
          volatility_1d?: number | null
        }
        Update: {
          asset_type?: string
          category?: string | null
          change_24h?: number | null
          change_30d?: number | null
          created_at?: string
          currency?: string
          current_price?: number
          has_options?: boolean | null
          high_24h?: number | null
          id?: string
          is_meme?: boolean | null
          is_popular?: boolean | null
          is_tradable?: boolean
          low_24h?: number | null
          name?: string
          price_source?: string | null
          price_updated_at?: string | null
          quote_is_delayed?: boolean
          sell_price?: number | null
          signal_type?: string | null
          ticker?: string
          updated_at?: string
          volatility_1d?: number | null
        }
        Relationships: []
      }
      equity_snapshots: {
        Row: {
          equity: number
          observed_at: string
          quotes_fresh: boolean
          snapshot_date: string
          user_id: string
        }
        Insert: {
          equity: number
          observed_at: string
          quotes_fresh: boolean
          snapshot_date: string
          user_id: string
        }
        Update: {
          equity?: number
          observed_at?: string
          quotes_fresh?: boolean
          snapshot_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equity_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equity_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      life_reloads_log: {
        Row: {
          balance_after: number
          balance_before: number
          id: string
          lives_after_reload: number
          reloaded_at: string
          user_id: string
          was_pro: boolean
        }
        Insert: {
          balance_after?: number
          balance_before: number
          id?: string
          lives_after_reload: number
          reloaded_at?: string
          user_id: string
          was_pro: boolean
        }
        Update: {
          balance_after?: number
          balance_before?: number
          id?: string
          lives_after_reload?: number
          reloaded_at?: string
          user_id?: string
          was_pro?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "life_reloads_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "life_reloads_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      performance_baselines: {
        Row: {
          equity: number
          started_at: string
          user_id: string
        }
        Insert: {
          equity: number
          started_at?: string
          user_id: string
        }
        Update: {
          equity?: number
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_baselines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_baselines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      portfolio_cash_flows: {
        Row: {
          amount: number
          id: string
          occurred_at: string
          reload_id: string
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          occurred_at?: string
          reload_id: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          occurred_at?: string
          reload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_cash_flows_reload_id_fkey"
            columns: ["reload_id"]
            isOneToOne: true
            referencedRelation: "life_reloads_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_cash_flows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_cash_flows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      portfolios: {
        Row: {
          asset_id: string
          average_buy_price: number
          created_at: string
          id: string
          total_quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_id: string
          average_buy_price: number
          created_at?: string
          id?: string
          total_quantity: number
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_id?: string
          average_buy_price?: number
          created_at?: string
          id?: string
          total_quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          asset_id: string
          created_at: string
          direction: string
          id: string
          read_at: string | null
          status: string
          target_price: number
          triggered_at: string | null
          triggered_price: number | null
          user_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          direction: string
          id?: string
          read_at?: string | null
          status?: string
          target_price: number
          triggered_at?: string | null
          triggered_price?: number | null
          user_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          direction?: string
          id?: string
          read_at?: string | null
          status?: string
          target_price?: number
          triggered_at?: string | null
          triggered_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pro_upgrade_requests: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_upgrade_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_upgrade_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          fictional_balance: number
          id: string
          lives_remaining: number
          role: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          stripe_sync_started_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          fictional_balance?: number
          id: string
          lives_remaining?: number
          role?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          stripe_sync_started_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          fictional_balance?: number
          id?: string
          lives_remaining?: number
          role?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          stripe_sync_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quizzes: {
        Row: {
          lesson_id: string
          passing_score: number
          questions: Json
        }
        Insert: {
          lesson_id: string
          passing_score?: number
          questions: Json
        }
        Update: {
          lesson_id?: string
          passing_score?: number
          questions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          event_type: string
          processed_at: string | null
          received_at: string
          stripe_event_created_at: string
          stripe_event_id: string
          stripe_subscription_id: string
        }
        Insert: {
          event_type: string
          processed_at?: string | null
          received_at?: string
          stripe_event_created_at: string
          stripe_event_id: string
          stripe_subscription_id: string
        }
        Update: {
          event_type?: string
          processed_at?: string | null
          received_at?: string
          stripe_event_created_at?: string
          stripe_event_id?: string
          stripe_subscription_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          status: string
          stripe_customer_id: string
          stripe_event_created_at: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          status: string
          stripe_customer_id: string
          stripe_event_created_at?: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string
          stripe_event_created_at?: string
          stripe_price_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trader_follows: {
        Row: {
          created_at: string
          followed_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          followed_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          followed_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trader_follows_followed_user_id_fkey"
            columns: ["followed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trader_follows_followed_user_id_fkey"
            columns: ["followed_user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trader_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trader_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      transactions: {
        Row: {
          asset_id: string
          balance_after: number
          client_request_id: string
          executed_at: string
          execution_price: number
          id: string
          position_after: number
          quantity: number
          realized_pnl: number | null
          total_value: number
          transaction_type: string
          user_id: string
        }
        Insert: {
          asset_id: string
          balance_after: number
          client_request_id: string
          executed_at?: string
          execution_price: number
          id?: string
          position_after: number
          quantity: number
          realized_pnl?: number | null
          total_value: number
          transaction_type: string
          user_id: string
        }
        Update: {
          asset_id?: string
          balance_after?: number
          client_request_id?: string
          executed_at?: string
          execution_price?: number
          id?: string
          position_after?: number
          quantity?: number
          realized_pnl?: number | null
          total_value?: number
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_academy_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          id: string
          lesson_id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id: string
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_academy_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "academy_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_academy_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_academy_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_academy_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      lessons: {
        Row: {
          content_json: Json | null
          created_at: string | null
          id: string | null
          level_id: string | null
          order_index: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          content_json?: Json | null
          created_at?: string | null
          id?: string | null
          level_id?: string | null
          order_index?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          content_json?: Json | null
          created_at?: string | null
          id?: string | null
          level_id?: string | null
          order_index?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_lessons_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      v_account_equity: {
        Row: {
          cash_balance: number | null
          holdings_value: number | null
          total_equity: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_portfolio_positions: {
        Row: {
          acquisition_cost: number | null
          asset_id: string | null
          asset_name: string | null
          average_buy_price: number | null
          current_price: number | null
          market_value: number | null
          price_updated_at: string | null
          quote_is_delayed: boolean | null
          ticker: string | null
          total_quantity: number | null
          unrealized_pnl: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_account_equity"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      apply_stripe_subscription: {
        Args: {
          p_customer_id: string
          p_event_id: string
          p_role: string
          p_status: string
          p_subscription_id: string
          p_sync_started_at: string
        }
        Returns: undefined
      }
      apply_stripe_subscription_event: {
        Args: {
          p_current_period_end: string
          p_customer_id: string
          p_event_created_at: string
          p_event_id: string
          p_event_type: string
          p_price_id: string
          p_status: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      complete_academy_lesson: {
        Args: { p_lesson_id: string }
        Returns: {
          completed: boolean
          completed_at: string | null
          id: string
          lesson_id: string
          score: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "user_academy_progress"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      execute_trade: {
        Args: {
          p_asset_id: string
          p_price: number
          p_quantity: number
          p_request_id?: string
          p_type: string
          p_user_id: string
        }
        Returns: {
          position_quantity: number
          resulting_balance: number
          transaction_id: string
        }[]
      }
      get_global_leaderboard: {
        Args: {
          p_following?: boolean
          p_limit?: number
          p_offset?: number
          p_period?: string
        }
        Returns: {
          badges: string[]
          display_name: string
          is_following: boolean
          measured_since: string
          rank: number
          roi_pct: number
          sell_count: number
          total_count: number
          total_equity: number
          user_id: string
          win_rate_pct: number
        }[]
      }
      get_my_achievements: {
        Args: never
        Returns: {
          badges: string[]
          completed_lessons: number
          trade_count: number
          winning_sells: number
        }[]
      }
      get_portfolio_performance: {
        Args: { p_period?: string }
        Returns: {
          equity: number
          is_daily_close: boolean
          observed_at: string
          quotes_fresh: boolean
          return_pct: number
        }[]
      }
      get_trading_statistics: {
        Args: { p_period?: string }
        Returns: {
          sell_count: number
          win_rate_pct: number
          winning_sells: number
        }[]
      }
      record_lesson_result: {
        Args: {
          p_completed: boolean
          p_lesson_id: string
          p_score: number
          p_user_id: string
        }
        Returns: string
      }
      refill_portfolio_balance: {
        Args: never
        Returns: {
          reload_id: string
          remaining_lives: number
          resulting_balance: number
        }[]
      }
      refresh_asset_prices: { Args: never; Returns: number }
      reserve_stripe_checkout: {
        Args: {
          p_generation: string
          p_origin: string
          p_price_id: string
          p_user_id: string
        }
        Returns: string
      }
      submit_academy_quiz: {
        Args: { p_answers: number[]; p_lesson_id: string }
        Returns: {
          correct_count: number
          passed: boolean
          question_count: number
          score: number
        }[]
      }
      use_life_reload: {
        Args: { p_user_id: string }
        Returns: {
          reload_id: string
          remaining_lives: number
          resulting_balance: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
