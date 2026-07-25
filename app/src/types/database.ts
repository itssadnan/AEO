// Generated via Supabase MCP `generate_typescript_types` against the live
// project (vloradmcvozmhvvxiyvd) after 0001-0015 were applied (adds
// check_extractions from Module 5.4, plus its claim/complete/retry/reclaim
// RPC signatures, and the enqueue_extraction_for_check_run lockdown from
// 0015). Regenerate the same way after every future migration — do not
// hand-edit table shapes here again (a prior hand-edit of just the
// check_extractions Row/Insert/Update block, 2026-07-25, was correct but
// skipped the Functions block entirely — this full regeneration replaces it).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ai_provider_key_health: {
        Row: {
          dead_at: string | null;
          is_dead: boolean;
          key_slot: string;
          last_error_code: string | null;
          provider: string;
          updated_at: string;
        };
        Insert: {
          dead_at?: string | null;
          is_dead?: boolean;
          key_slot: string;
          last_error_code?: string | null;
          provider: string;
          updated_at?: string;
        };
        Update: {
          dead_at?: string | null;
          is_dead?: boolean;
          key_slot?: string;
          last_error_code?: string | null;
          provider?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_provider_settings: {
        Row: {
          failover_mode: string;
          provider: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          failover_mode?: string;
          provider: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          failover_mode?: string;
          provider?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      ai_task_configs: {
        Row: {
          enabled: boolean;
          id: string;
          model: string;
          provider: string;
          task_key: string;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string | null;
        };
        Insert: {
          enabled?: boolean;
          id?: string;
          model: string;
          provider: string;
          task_key: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          enabled?: boolean;
          id?: string;
          model?: string;
          provider?: string;
          task_key?: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_task_configs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      brands: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          website: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          website?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          website?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brands_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      check_extractions: {
        Row: {
          attempts: number;
          brand_id: string;
          brand_mentioned: boolean | null;
          check_run_id: string;
          cited_domain_types: Json;
          cited_domains: string[];
          claimed_at: string | null;
          competitor_names_found: string[];
          created_at: string;
          extracted_at: string | null;
          id: string;
          last_error_code: string | null;
          model: string | null;
          position_among_competitors: number | null;
          prompt_id: string;
          provider: string | null;
          reasoning: string | null;
          sentiment: string | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          brand_id: string;
          brand_mentioned?: boolean | null;
          check_run_id: string;
          cited_domain_types?: Json;
          cited_domains?: string[];
          claimed_at?: string | null;
          competitor_names_found?: string[];
          created_at?: string;
          extracted_at?: string | null;
          id?: string;
          last_error_code?: string | null;
          model?: string | null;
          position_among_competitors?: number | null;
          prompt_id: string;
          provider?: string | null;
          reasoning?: string | null;
          sentiment?: string | null;
          status?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          brand_id?: string;
          brand_mentioned?: boolean | null;
          check_run_id?: string;
          cited_domain_types?: Json;
          cited_domains?: string[];
          claimed_at?: string | null;
          competitor_names_found?: string[];
          created_at?: string;
          extracted_at?: string | null;
          id?: string;
          last_error_code?: string | null;
          model?: string | null;
          position_among_competitors?: number | null;
          prompt_id?: string;
          provider?: string | null;
          reasoning?: string | null;
          sentiment?: string | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "check_extractions_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_extractions_check_run_id_fkey";
            columns: ["check_run_id"];
            isOneToOne: true;
            referencedRelation: "check_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_extractions_prompt_id_fkey";
            columns: ["prompt_id"];
            isOneToOne: false;
            referencedRelation: "prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_extractions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      check_jobs: {
        Row: {
          attempts: number;
          available_at: string;
          brand_id: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          last_error_code: string | null;
          locked_at: string | null;
          prompt_id: string;
          source: string;
          status: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          available_at?: string;
          brand_id: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          last_error_code?: string | null;
          locked_at?: string | null;
          prompt_id: string;
          source: string;
          status?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          available_at?: string;
          brand_id?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          last_error_code?: string | null;
          locked_at?: string | null;
          prompt_id?: string;
          source?: string;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "check_jobs_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_jobs_prompt_id_fkey";
            columns: ["prompt_id"];
            isOneToOne: false;
            referencedRelation: "prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_jobs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      check_runs: {
        Row: {
          brand_id: string;
          checked_at: string;
          citations: Json;
          created_at: string;
          error_code: string | null;
          grounding_metadata: Json;
          id: string;
          model: string;
          prompt_id: string;
          provider: string;
          raw_answer: string | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          brand_id: string;
          checked_at?: string;
          citations?: Json;
          created_at?: string;
          error_code?: string | null;
          grounding_metadata?: Json;
          id?: string;
          model: string;
          prompt_id: string;
          provider: string;
          raw_answer?: string | null;
          status: string;
          workspace_id: string;
        };
        Update: {
          brand_id?: string;
          checked_at?: string;
          citations?: Json;
          created_at?: string;
          error_code?: string | null;
          grounding_metadata?: Json;
          id?: string;
          model?: string;
          prompt_id?: string;
          provider?: string;
          raw_answer?: string | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "check_runs_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_runs_prompt_id_fkey";
            columns: ["prompt_id"];
            isOneToOne: false;
            referencedRelation: "prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      competitors: {
        Row: {
          brand_id: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          brand_id: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competitors_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      engine_error_logs: {
        Row: {
          created_at: string;
          error_code: string;
          id: number;
          job_id: string | null;
          key_slot: string | null;
          provider: string;
          retryable: boolean;
        };
        Insert: {
          created_at?: string;
          error_code: string;
          id?: never;
          job_id?: string | null;
          key_slot?: string | null;
          provider: string;
          retryable: boolean;
        };
        Update: {
          created_at?: string;
          error_code?: string;
          id?: never;
          job_id?: string | null;
          key_slot?: string | null;
          provider?: string;
          retryable?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "engine_error_logs_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "check_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      prompts: {
        Row: {
          brand_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          is_ai_suggested: boolean;
          text: string;
        };
        Insert: {
          brand_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_ai_suggested?: boolean;
          text: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_ai_suggested?: boolean;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prompts_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_events: {
        Row: {
          created_at: string;
          id: number;
          rate_key: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          rate_key: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          rate_key?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          created_at: string;
          id: string;
          normalized_email: string;
          raw_email: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          normalized_email: string;
          raw_email: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          normalized_email?: string;
          raw_email?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          created_at: string;
          id: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          experiments_used: number;
          id: string;
          name: string;
          plan_tier: string;
          razorpay_customer_id: string | null;
        };
        Insert: {
          created_at?: string;
          experiments_used?: number;
          id?: string;
          name: string;
          plan_tier?: string;
          razorpay_customer_id?: string | null;
        };
        Update: {
          created_at?: string;
          experiments_used?: number;
          id?: string;
          name?: string;
          plan_tier?: string;
          razorpay_customer_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_check_jobs: {
        Args: { p_limit?: number };
        Returns: {
          brand_id: string;
          job_id: string;
          prompt_id: string;
          prompt_text: string;
          workspace_id: string;
        }[];
      };
      claim_extraction_jobs: {
        Args: { p_limit?: number };
        Returns: {
          brand_id: string;
          brand_name: string;
          check_run_id: string;
          citations: Json;
          competitor_names: string[];
          extraction_id: string;
          prompt_id: string;
          raw_answer: string;
          workspace_id: string;
        }[];
      };
      complete_check_job: {
        Args: {
          p_citations: Json;
          p_grounding_metadata: Json;
          p_job_id: string;
          p_model: string;
          p_provider: string;
          p_raw_answer: string;
        };
        Returns: undefined;
      };
      complete_extraction: {
        Args: {
          p_brand_mentioned: boolean;
          p_cited_domain_types: Json;
          p_cited_domains: string[];
          p_competitor_names_found: string[];
          p_extraction_id: string;
          p_model: string;
          p_position_among_competitors: number;
          p_provider: string;
          p_reasoning: string;
          p_sentiment: string;
        };
        Returns: undefined;
      };
      create_brand_with_details: {
        Args: {
          p_competitor_names: string[];
          p_name: string;
          p_prompt_texts: string[];
          p_prompts_ai_suggested?: boolean;
          p_website: string;
          p_workspace_id: string;
        };
        Returns: string;
      };
      create_workspace: {
        Args: { p_name: string; p_plan_tier?: string };
        Returns: string;
      };
      enqueue_due_paid_checks: { Args: { p_limit?: number }; Returns: number };
      enqueue_free_check: {
        Args: {
          p_brand_id: string;
          p_prompt_id: string;
          p_workspace_id: string;
        };
        Returns: string;
      };
      mark_ai_key_dead: {
        Args: { p_error_code: string; p_key_slot: string; p_provider: string };
        Returns: undefined;
      };
      normalize_email: { Args: { p_email: string }; Returns: string };
      reclaim_stale_check_jobs: {
        Args: { p_stale_after_minutes?: number };
        Returns: number;
      };
      reclaim_stale_extractions: {
        Args: { p_stale_after_minutes?: number };
        Returns: number;
      };
      retry_or_fail_check_job: {
        Args: {
          p_error_code: string;
          p_job_id: string;
          p_provider?: string;
          p_retry_after_seconds?: number;
        };
        Returns: undefined;
      };
      retry_or_fail_extraction: {
        Args: { p_error_code: string; p_extraction_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;
