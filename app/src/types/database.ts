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
      ai_provider_key_health: {
        Row: {
          dead_at: string | null
          is_dead: boolean
          key_slot: string
          last_error_code: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          dead_at?: string | null
          is_dead?: boolean
          key_slot: string
          last_error_code?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          dead_at?: string | null
          is_dead?: boolean
          key_slot?: string
          last_error_code?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_provider_settings: {
        Row: {
          failover_mode: string
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          failover_mode?: string
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          failover_mode?: string
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_task_configs: {
        Row: {
          enabled: boolean
          id: string
          model: string
          provider: string
          task_key: string
          updated_at: string
          updated_by: string | null
          workspace_id: string | null
        }
        Insert: {
          enabled?: boolean
          id?: string
          model: string
          provider: string
          task_key: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          model?: string
          provider?: string
          task_key?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_task_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      check_extractions: {
        Row: {
          attempts: number
          brand_id: string
          brand_mentioned: boolean | null
          check_run_id: string
          cited_domain_types: Json
          cited_domains: string[]
          claimed_at: string | null
          competitor_names_found: string[]
          created_at: string
          extracted_at: string | null
          id: string
          last_error_code: string | null
          model: string | null
          position_among_competitors: number | null
          prompt_id: string
          provider: string | null
          reasoning: string | null
          sentiment: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          brand_id: string
          brand_mentioned?: boolean | null
          check_run_id: string
          cited_domain_types?: Json
          cited_domains?: string[]
          claimed_at?: string | null
          competitor_names_found?: string[]
          created_at?: string
          extracted_at?: string | null
          id?: string
          last_error_code?: string | null
          model?: string | null
          position_among_competitors?: number | null
          prompt_id: string
          provider?: string | null
          reasoning?: string | null
          sentiment?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          brand_mentioned?: boolean | null
          check_run_id?: string
          cited_domain_types?: Json
          cited_domains?: string[]
          claimed_at?: string | null
          competitor_names_found?: string[]
          created_at?: string
          extracted_at?: string | null
          id?: string
          last_error_code?: string | null
          model?: string | null
          position_among_competitors?: number | null
          prompt_id?: string
          provider?: string | null
          reasoning?: string | null
          sentiment?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_extractions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_extractions_check_run_id_fkey"
            columns: ["check_run_id"]
            isOneToOne: true
            referencedRelation: "check_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_extractions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_extractions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      check_jobs: {
        Row: {
          attempts: number
          available_at: string
          brand_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_error_code: string | null
          locked_at: string | null
          prompt_id: string
          source: string
          status: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          brand_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          prompt_id: string
          source: string
          status?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          prompt_id?: string
          source?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_jobs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      check_runs: {
        Row: {
          brand_id: string
          checked_at: string
          citations: Json
          created_at: string
          error_code: string | null
          grounding_metadata: Json
          id: string
          key_slot: string | null
          model: string
          prompt_id: string
          provider: string
          raw_answer: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          brand_id: string
          checked_at?: string
          citations?: Json
          created_at?: string
          error_code?: string | null
          grounding_metadata?: Json
          id?: string
          key_slot?: string | null
          model: string
          prompt_id: string
          provider: string
          raw_answer?: string | null
          status: string
          workspace_id: string
        }
        Update: {
          brand_id?: string
          checked_at?: string
          citations?: Json
          created_at?: string
          error_code?: string | null
          grounding_metadata?: Json
          id?: string
          key_slot?: string | null
          model?: string
          prompt_id?: string
          provider?: string
          raw_answer?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_runs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      crawl_audits: {
        Row: {
          brand_id: string
          checked_at: string
          created_at: string
          domain: string
          heading_structure: Json
          id: string
          llms_txt_present: boolean
          robots_txt_result: Json
          schema_present: boolean
        }
        Insert: {
          brand_id: string
          checked_at?: string
          created_at?: string
          domain: string
          heading_structure: Json
          id?: string
          llms_txt_present?: boolean
          robots_txt_result: Json
          schema_present?: boolean
        }
        Update: {
          brand_id?: string
          checked_at?: string
          created_at?: string
          domain?: string
          heading_structure?: Json
          id?: string
          llms_txt_present?: boolean
          robots_txt_result?: Json
          schema_present?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "crawl_audits_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_error_logs: {
        Row: {
          created_at: string
          error_code: string
          id: number
          job_id: string | null
          key_slot: string | null
          provider: string
          retryable: boolean
        }
        Insert: {
          created_at?: string
          error_code: string
          id?: never
          job_id?: string | null
          key_slot?: string | null
          provider: string
          retryable: boolean
        }
        Update: {
          created_at?: string
          error_code?: string
          id?: never
          job_id?: string | null
          key_slot?: string | null
          provider?: string
          retryable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "engine_error_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "check_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_active: boolean
          is_ai_suggested: boolean
          text: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_ai_suggested?: boolean
          text: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_ai_suggested?: boolean
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          created_at: string
          id: number
          rate_key: string
        }
        Insert: {
          created_at?: string
          id?: never
          rate_key: string
        }
        Update: {
          created_at?: string
          id?: never
          rate_key?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          id: string
          normalized_email: string
          raw_email: string
        }
        Insert: {
          created_at?: string
          id: string
          normalized_email: string
          raw_email: string
        }
        Update: {
          created_at?: string
          id?: string
          normalized_email?: string
          raw_email?: string
        }
        Relationships: []
      }
      visibility_snapshots: {
        Row: {
          attempts: number
          avg_rank: number | null
          brand_id: string
          claimed_at: string | null
          explanation_breakdown: Json | null
          explanation_completed_at: string | null
          explanation_model: string | null
          explanation_provider: string | null
          explanation_skip_reason: string | null
          generated_at: string
          id: string
          last_error_code: string | null
          mention_count: number
          opportunity_gaps: Json
          period_end: string
          period_start: string
          recommended_actions: Json | null
          score: number
          share_of_voice: Json
          source_influence: Json
          status: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          avg_rank?: number | null
          brand_id: string
          claimed_at?: string | null
          explanation_breakdown?: Json | null
          explanation_completed_at?: string | null
          explanation_model?: string | null
          explanation_provider?: string | null
          explanation_skip_reason?: string | null
          generated_at?: string
          id?: string
          last_error_code?: string | null
          mention_count?: number
          opportunity_gaps?: Json
          period_end?: string
          period_start?: string
          recommended_actions?: Json | null
          score?: number
          share_of_voice?: Json
          source_influence?: Json
          status?: string
          workspace_id?: string
        }
        Update: {
          attempts?: number
          avg_rank?: number | null
          brand_id?: string
          claimed_at?: string | null
          explanation_breakdown?: Json | null
          explanation_completed_at?: string | null
          explanation_model?: string | null
          explanation_provider?: string | null
          explanation_skip_reason?: string | null
          generated_at?: string
          id?: string
          last_error_code?: string | null
          mention_count?: number
          opportunity_gaps?: Json
          period_end?: string
          period_start?: string
          recommended_actions?: Json | null
          score?: number
          share_of_voice?: Json
          source_influence?: Json
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visibility_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visibility_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          experiments_used: number
          id: string
          name: string
          plan_tier: string
          razorpay_customer_id: string | null
        }
        Insert: {
          created_at?: string
          experiments_used?: number
          id?: string
          name?: string
          plan_tier?: string
          razorpay_customer_id?: string | null
        }
        Update: {
          created_at?: string
          experiments_used?: number
          id?: string
          name?: string
          plan_tier?: string
          razorpay_customer_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_check_jobs: {
        Args: { p_limit?: number }
        Returns: {
          brand_id: string
          job_id: string
          prompt_id: string
          prompt_text: string
          workspace_id: string
        }[]
      }
      claim_extraction_jobs: {
        Args: { p_limit?: number }
        Returns: {
          brand_id: string
          brand_name: string
          check_run_id: string
          citations: Json
          competitor_names: string[]
          extraction_id: string
          prompt_id: string
          raw_answer: string
          workspace_id: string
        }[]
      }
      claim_visibility_explanation_jobs: {
        Args: { p_limit?: number }
        Returns: {
          brand_citation_profile: Json
          brand_id: string
          brand_mention_count: number
          brand_name: string
          citation_ratio: number
          competitor_citation_profile: Json
          competitor_mention_count: number
          competitor_name: string
          opportunity_gaps: Json
          snapshot_id: string
          workspace_id: string
        }[]
      }
      complete_check_job:
        | {
            Args: {
              p_citations: Json
              p_grounding_metadata: Json
              p_job_id: string
              p_model: string
              p_provider: string
              p_raw_answer: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_citations: Json
              p_grounding_metadata: Json
              p_job_id: string
              p_key_slot?: string
              p_model: string
              p_provider: string
              p_raw_answer: string
            }
            Returns: undefined
          }
      complete_extraction: {
        Args: {
          p_brand_mentioned: boolean
          p_cited_domain_types: Json
          p_cited_domains: string[]
          p_competitor_names_found: string[]
          p_extraction_id: string
          p_model: string
          p_position_among_competitors: number
          p_provider: string
          p_reasoning: string
          p_sentiment: string
        }
        Returns: undefined
      }
      complete_visibility_explanation: {
        Args: {
          p_explanation_text: string
          p_model: string
          p_provider: string
          p_recommended_actions: Json
          p_snapshot_id: string
        }
        Returns: undefined
      }
      create_brand_with_details: {
        Args: {
          p_competitor_names: string[]
          p_name: string
          p_prompt_texts: string[]
          p_prompts_ai_suggested?: boolean
          p_website: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_workspace: {
        Args: { p_name: string; p_plan_tier?: string }
        Returns: string
      }
      enqueue_due_paid_checks: { Args: { p_limit?: number }; Returns: number }
      enqueue_free_check: {
        Args: {
          p_brand_id: string
          p_prompt_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      mark_ai_key_dead: {
        Args: { p_error_code: string; p_key_slot: string; p_provider: string }
        Returns: undefined
      }
      normalize_email: { Args: { p_email: string }; Returns: string }
      reclaim_stale_check_jobs: {
        Args: { p_stale_after_minutes?: number }
        Returns: number
      }
      reclaim_stale_extractions: {
        Args: { p_stale_after_minutes?: number }
        Returns: number
      }
      reclaim_stale_visibility_explanations: {
        Args: { p_stale_after_minutes?: number }
        Returns: number
      }
      retry_or_fail_check_job:
        | {
            Args: {
              p_error_code: string
              p_job_id: string
              p_provider?: string
              p_retry_after_seconds?: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_error_code: string
              p_job_id: string
              p_key_slot?: string
              p_provider?: string
              p_retry_after_seconds?: number
            }
            Returns: undefined
          }
      retry_or_fail_extraction: {
        Args: { p_error_code: string; p_extraction_id: string }
        Returns: undefined
      }
      retry_or_fail_visibility_explanation: {
        Args: { p_error_code: string; p_snapshot_id: string }
        Returns: undefined
      }
      run_visibility_scoring_cycle: { Args: never; Returns: number }
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
    Enums: {},
  },
} as const