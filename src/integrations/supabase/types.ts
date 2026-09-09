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
      ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_metric_logs: {
        Row: {
          created_at: string
          id: string
          log_date: string
          metric_id: string
          user_id: string
          value_num: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          log_date?: string
          metric_id: string
          user_id: string
          value_num?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          log_date?: string
          metric_id?: string
          user_id?: string
          value_num?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_metric_logs_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "custom_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_metrics: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          kind: string
          name: string
          sort_order: number
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gaming_stats: {
        Row: {
          faceit_elo: number | null
          faceit_kd: number | null
          faceit_level: number | null
          faceit_recent: Json | null
          faceit_winrate: number | null
          last_synced_at: string | null
          steam_top_games: Json | null
          steam_total_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          faceit_elo?: number | null
          faceit_kd?: number | null
          faceit_level?: number | null
          faceit_recent?: Json | null
          faceit_winrate?: number | null
          last_synced_at?: string | null
          steam_top_games?: Json | null
          steam_total_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          faceit_elo?: number | null
          faceit_kd?: number | null
          faceit_level?: number | null
          faceit_recent?: Json | null
          faceit_winrate?: number | null
          last_synced_at?: string | null
          steam_top_games?: Json | null
          steam_total_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          progress_pct: number
          target_pct: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          progress_pct?: number
          target_pct?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          progress_pct?: number
          target_pct?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      health_logs: {
        Row: {
          created_at: string
          energy: number | null
          id: string
          log_date: string
          mood: number | null
          notes: string | null
          steps: number | null
          updated_at: string
          user_id: string
          water_ml: number | null
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          energy?: number | null
          id?: string
          log_date?: string
          mood?: number | null
          notes?: string | null
          steps?: number | null
          updated_at?: string
          user_id: string
          water_ml?: number | null
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          energy?: number | null
          id?: string
          log_date?: string
          mood?: number | null
          notes?: string | null
          steps?: number | null
          updated_at?: string
          user_id?: string
          water_ml?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          entry_date: string
          id: string
          mood: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          entry_date?: string
          id?: string
          mood?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          entry_date?: string
          id?: string
          mood?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          created_at: string
          display_name: string | null
          faceit_nickname: string | null
          gender: string | null
          id: string
          interests: string[] | null
          steam_id: string | null
          theme: string
          updated_at: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          display_name?: string | null
          faceit_nickname?: string | null
          gender?: string | null
          id: string
          interests?: string[] | null
          steam_id?: string | null
          theme?: string
          updated_at?: string
        }
        Update: {
          age?: number | null
          created_at?: string
          display_name?: string | null
          faceit_nickname?: string | null
          gender?: string | null
          id?: string
          interests?: string[] | null
          steam_id?: string | null
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      routine_logs: {
        Row: {
          created_at: string
          done: boolean
          id: string
          log_date: string
          routine_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          log_date?: string
          routine_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          log_date?: string
          routine_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_logs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          active: boolean
          created_at: string
          day_of_week: number | null
          id: string
          sort_order: number
          time_of_day: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_week?: number | null
          id?: string
          sort_order?: number
          time_of_day?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_week?: number | null
          id?: string
          sort_order?: number
          time_of_day?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sleep_logs: {
        Row: {
          bedtime: string | null
          created_at: string
          hours: number
          id: string
          log_date: string
          notes: string | null
          quality: number | null
          updated_at: string
          user_id: string
          wake_time: string | null
        }
        Insert: {
          bedtime?: string | null
          created_at?: string
          hours: number
          id?: string
          log_date?: string
          notes?: string | null
          quality?: number | null
          updated_at?: string
          user_id: string
          wake_time?: string | null
        }
        Update: {
          bedtime?: string | null
          created_at?: string
          hours?: number
          id?: string
          log_date?: string
          notes?: string | null
          quality?: number | null
          updated_at?: string
          user_id?: string
          wake_time?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          routine_id: string | null
          scheduled_for: string
          scope: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          routine_id?: string | null
          scheduled_for?: string
          scope?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          routine_id?: string | null
          scheduled_for?: string
          scope?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          duration_min: number | null
          id: string
          intensity: number | null
          kind: string | null
          notes: string | null
          title: string
          updated_at: string
          user_id: string
          workout_date: string
        }
        Insert: {
          created_at?: string
          duration_min?: number | null
          id?: string
          intensity?: number | null
          kind?: string | null
          notes?: string | null
          title: string
          updated_at?: string
          user_id: string
          workout_date?: string
        }
        Update: {
          created_at?: string
          duration_min?: number | null
          id?: string
          intensity?: number | null
          kind?: string | null
          notes?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          workout_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
