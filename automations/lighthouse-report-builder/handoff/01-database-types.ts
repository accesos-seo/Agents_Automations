// Auto-generated TypeScript types for Supabase schema (Light_House project)
// Generated via Supabase Management API
// Includes all schemas: public, ahrefs_web_analysis, etc.
//
// Usage:
//   import type { Database } from "./01-database-types";
//   const supabase = createClient<Database>(url, anonKey);
//

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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agency_roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      agency_roles_backup_20241012: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      ahrefs_geo_distribution: {
        Row: {
          created_at: string | null
          id: string
          keywords_count: number | null
          location_country: string
          proyecto_id: string
          report_date: string
          share_percentage: number | null
          traffic: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          keywords_count?: number | null
          location_country: string
          proyecto_id: string
          report_date?: string
          share_percentage?: number | null
          traffic?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          keywords_count?: number | null
          location_country?: string
          proyecto_id?: string
          report_date?: string
          share_percentage?: number | null
          traffic?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ahrefs_geo_distribution_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ahrefs_geo_distribution_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      ahrefs_keyword_intent_metrics: {
        Row: {
          branded_count: number | null
          commercial_count: number | null
          created_at: string | null
          id: string
          informational_count: number | null
          local_count: number | null
          navigational_count: number | null
          non_branded_count: number | null
          non_local_count: number | null
          proyecto_id: string
          report_date: string
          total_keywords: number | null
          total_traffic_sum: number | null
          transactional_count: number | null
        }
        Insert: {
          branded_count?: number | null
          commercial_count?: number | null
          created_at?: string | null
          id?: string
          informational_count?: number | null
          local_count?: number | null
          navigational_count?: number | null
          non_branded_count?: number | null
          non_local_count?: number | null
          proyecto_id: string
          report_date?: string
          total_keywords?: number | null
          total_traffic_sum?: number | null
          transactional_count?: number | null
        }
        Update: {
          branded_count?: number | null
          commercial_count?: number | null
          created_at?: string | null
          id?: string
          informational_count?: number | null
          local_count?: number | null
          navigational_count?: number | null
          non_branded_count?: number | null
          non_local_count?: number | null
          proyecto_id?: string
          report_date?: string
          total_keywords?: number | null
          total_traffic_sum?: number | null
          transactional_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ahrefs_keyword_intent_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ahrefs_keyword_intent_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      ahrefs_market_dominance_keywords: {
        Row: {
          created_at: string | null
          id: string
          keyword: string
          location: string | null
          position: number | null
          proyecto_id: string
          report_date: string
          traffic: number | null
          url: string | null
          volume: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          keyword: string
          location?: string | null
          position?: number | null
          proyecto_id: string
          report_date?: string
          traffic?: number | null
          url?: string | null
          volume?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          keyword?: string
          location?: string | null
          position?: number | null
          proyecto_id?: string
          report_date?: string
          traffic?: number | null
          url?: string | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ahrefs_market_dominance_keywords_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ahrefs_market_dominance_keywords_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      ahrefs_referring_domains: {
        Row: {
          created_at: string | null
          domain: string
          domain_rating: number | null
          id: string
          linked_keywords: number | null
          proyecto_id: string
          report_date: string
          traffic: number | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          domain_rating?: number | null
          id?: string
          linked_keywords?: number | null
          proyecto_id: string
          report_date?: string
          traffic?: number | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          domain_rating?: number | null
          id?: string
          linked_keywords?: number | null
          proyecto_id?: string
          report_date?: string
          traffic?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ahrefs_referring_domains_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ahrefs_referring_domains_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      ahrefs_top_pages: {
        Row: {
          created_at: string | null
          id: string
          keywords_count: number | null
          proyecto_id: string
          report_date: string
          top_keyword: string | null
          top_keyword_position: number | null
          traffic: number | null
          traffic_value: number | null
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          keywords_count?: number | null
          proyecto_id: string
          report_date?: string
          top_keyword?: string | null
          top_keyword_position?: number | null
          traffic?: number | null
          traffic_value?: number | null
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          keywords_count?: number | null
          proyecto_id?: string
          report_date?: string
          top_keyword?: string | null
          top_keyword_position?: number | null
          traffic?: number | null
          traffic_value?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ahrefs_top_pages_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ahrefs_top_pages_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      ahrefs_traffic_history: {
        Row: {
          created_at: string | null
          domain_rating: number | null
          id: string
          impressions: number | null
          organic_pages: number | null
          organic_traffic: number | null
          paid_traffic: number | null
          proyecto_id: string
          referring_domains: number | null
          report_date: string
          traffic_value: number | null
        }
        Insert: {
          created_at?: string | null
          domain_rating?: number | null
          id?: string
          impressions?: number | null
          organic_pages?: number | null
          organic_traffic?: number | null
          paid_traffic?: number | null
          proyecto_id: string
          referring_domains?: number | null
          report_date: string
          traffic_value?: number | null
        }
        Update: {
          created_at?: string | null
          domain_rating?: number | null
          id?: string
          impressions?: number | null
          organic_pages?: number | null
          organic_traffic?: number | null
          paid_traffic?: number | null
          proyecto_id?: string
          referring_domains?: number | null
          report_date?: string
          traffic_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ahrefs_traffic_history_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ahrefs_traffic_history_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      ai_brand_learnings: {
        Row: {
          category_tag: string | null
          client_id: string
          comment_id: string | null
          created_at: string | null
          embedding: string | null
          id: string
          learning_context: string
          metadata: Json | null
          proyecto_id: string | null
        }
        Insert: {
          category_tag?: string | null
          client_id: string
          comment_id?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          learning_context: string
          metadata?: Json | null
          proyecto_id?: string | null
        }
        Update: {
          category_tag?: string | null
          client_id?: string
          comment_id?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          learning_context?: string
          metadata?: Json | null
          proyecto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_brand_learnings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_brand_learnings_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "content_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_brand_learnings_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_brand_learnings_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      ai_citations_metrics: {
        Row: {
          ai_overview_paginas: number | null
          ai_overview_valor: number | null
          archived: boolean | null
          chatgpt_paginas: number | null
          chatgpt_valor: number | null
          cliente_id: string
          copilot_paginas: number | null
          copilot_valor: number | null
          created_at: string | null
          fecha_registro: string
          gemini_paginas: number | null
          gemini_valor: number | null
          id: string
          periodo_desde: string
          periodo_hasta: string
          perplexity_paginas: number | null
          perplexity_valor: number | null
          proyecto_id: string
          shared_analysis_id: string | null
          updated_at: string | null
        }
        Insert: {
          ai_overview_paginas?: number | null
          ai_overview_valor?: number | null
          archived?: boolean | null
          chatgpt_paginas?: number | null
          chatgpt_valor?: number | null
          cliente_id: string
          copilot_paginas?: number | null
          copilot_valor?: number | null
          created_at?: string | null
          fecha_registro?: string
          gemini_paginas?: number | null
          gemini_valor?: number | null
          id?: string
          periodo_desde: string
          periodo_hasta: string
          perplexity_paginas?: number | null
          perplexity_valor?: number | null
          proyecto_id: string
          shared_analysis_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_overview_paginas?: number | null
          ai_overview_valor?: number | null
          archived?: boolean | null
          chatgpt_paginas?: number | null
          chatgpt_valor?: number | null
          cliente_id?: string
          copilot_paginas?: number | null
          copilot_valor?: number | null
          created_at?: string | null
          fecha_registro?: string
          gemini_paginas?: number | null
          gemini_valor?: number | null
          id?: string
          periodo_desde?: string
          periodo_hasta?: string
          perplexity_paginas?: number | null
          perplexity_valor?: number | null
          proyecto_id?: string
          shared_analysis_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_citations_metrics_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_citations_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_citations_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      archivos_adjuntos: {
        Row: {
          id: number
          nombre_archivo: string
          solicitud_id: number | null
          uploaded_at: string | null
          url_archivo: string
        }
        Insert: {
          id?: number
          nombre_archivo: string
          solicitud_id?: number | null
          uploaded_at?: string | null
          url_archivo: string
        }
        Update: {
          id?: number
          nombre_archivo?: string
          solicitud_id?: number | null
          uploaded_at?: string | null
          url_archivo?: string
        }
        Relationships: []
      }
      article_analysis_index: {
        Row: {
          analysis_notes: string | null
          analysis_status: string
          analysis_version: number
          brand_name: string | null
          category_id: string | null
          category_name: string | null
          client_id: string | null
          cluster_id: string | null
          cluster_key: string | null
          content_item_id: string
          content_role: string | null
          content_type: string | null
          content_word_count: number | null
          country: string | null
          created_at: string
          customer_journey_stage: string | null
          domain: string | null
          final_published_url: string | null
          has_article_content: boolean
          has_final_url: boolean
          id: string
          language: string | null
          main_entities: Json
          metadata: Json
          primary_keyword: string | null
          proyecto_id: string | null
          recommended_cta_type: string | null
          search_intent: string | null
          secondary_keywords: string[] | null
          semantic_fingerprint: string | null
          slug: string | null
          status: string | null
          summary_150_words: string | null
          title: string
          topic_name: string | null
          topics_id: string | null
          updated_at: string
        }
        Insert: {
          analysis_notes?: string | null
          analysis_status?: string
          analysis_version?: number
          brand_name?: string | null
          category_id?: string | null
          category_name?: string | null
          client_id?: string | null
          cluster_id?: string | null
          cluster_key?: string | null
          content_item_id: string
          content_role?: string | null
          content_type?: string | null
          content_word_count?: number | null
          country?: string | null
          created_at?: string
          customer_journey_stage?: string | null
          domain?: string | null
          final_published_url?: string | null
          has_article_content?: boolean
          has_final_url?: boolean
          id?: string
          language?: string | null
          main_entities?: Json
          metadata?: Json
          primary_keyword?: string | null
          proyecto_id?: string | null
          recommended_cta_type?: string | null
          search_intent?: string | null
          secondary_keywords?: string[] | null
          semantic_fingerprint?: string | null
          slug?: string | null
          status?: string | null
          summary_150_words?: string | null
          title: string
          topic_name?: string | null
          topics_id?: string | null
          updated_at?: string
        }
        Update: {
          analysis_notes?: string | null
          analysis_status?: string
          analysis_version?: number
          brand_name?: string | null
          category_id?: string | null
          category_name?: string | null
          client_id?: string | null
          cluster_id?: string | null
          cluster_key?: string | null
          content_item_id?: string
          content_role?: string | null
          content_type?: string | null
          content_word_count?: number | null
          country?: string | null
          created_at?: string
          customer_journey_stage?: string | null
          domain?: string | null
          final_published_url?: string | null
          has_article_content?: boolean
          has_final_url?: boolean
          id?: string
          language?: string | null
          main_entities?: Json
          metadata?: Json
          primary_keyword?: string | null
          proyecto_id?: string | null
          recommended_cta_type?: string | null
          search_intent?: string | null
          secondary_keywords?: string[] | null
          semantic_fingerprint?: string | null
          slug?: string | null
          status?: string | null
          summary_150_words?: string | null
          title?: string
          topic_name?: string | null
          topics_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_analysis_index_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_analysis_index_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_analysis_index_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_analysis_index_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_analysis_index_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_analysis_index_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_analysis_index_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "article_analysis_index_topics_id_fkey"
            columns: ["topics_id"]
            isOneToOne: false
            referencedRelation: "topic_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_voice_profiles: {
        Row: {
          accent: string | null
          audio_mode: string
          created_at: string
          description: string | null
          do_not: Json
          energy: string | null
          id: string
          is_active: boolean
          is_default: boolean
          language_code: string
          locale_label: string | null
          metadata: Json
          model: string
          name: string
          pace: string | null
          profile_key: string
          pronunciation_notes: Json
          provider: string
          tone: string | null
          tts_prompt: string | null
          updated_at: string
          version: number
          voice_name: string
        }
        Insert: {
          accent?: string | null
          audio_mode?: string
          created_at?: string
          description?: string | null
          do_not?: Json
          energy?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          language_code?: string
          locale_label?: string | null
          metadata?: Json
          model?: string
          name: string
          pace?: string | null
          profile_key: string
          pronunciation_notes?: Json
          provider?: string
          tone?: string | null
          tts_prompt?: string | null
          updated_at?: string
          version?: number
          voice_name?: string
        }
        Update: {
          accent?: string | null
          audio_mode?: string
          created_at?: string
          description?: string | null
          do_not?: Json
          energy?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          language_code?: string
          locale_label?: string | null
          metadata?: Json
          model?: string
          name?: string
          pace?: string | null
          profile_key?: string
          pronunciation_notes?: Json
          provider?: string
          tone?: string | null
          tts_prompt?: string | null
          updated_at?: string
          version?: number
          voice_name?: string
        }
        Relationships: []
      }
      backlink_history: {
        Row: {
          backlink_id: string | null
          campo_modificado: string | null
          id: string
          modificado_en: string | null
          modificado_por: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          backlink_id?: string | null
          campo_modificado?: string | null
          id?: string
          modificado_en?: string | null
          modificado_por?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          backlink_id?: string | null
          campo_modificado?: string | null
          id?: string
          modificado_en?: string | null
          modificado_por?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_history_backlink_id_fkey"
            columns: ["backlink_id"]
            isOneToOne: false
            referencedRelation: "backlinks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_history_modificado_por_fkey"
            columns: ["modificado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_monthly_reports: {
        Row: {
          created_at: string
          id: string
          no_backlinks_reason: string | null
          proyecto_id: string
          report_month: string
          report_summary: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          total_backlinks_added: number
          total_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          no_backlinks_reason?: string | null
          proyecto_id: string
          report_month: string
          report_summary?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          total_backlinks_added?: number
          total_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          no_backlinks_reason?: string | null
          proyecto_id?: string
          report_month?: string
          report_summary?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          total_backlinks_added?: number
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_monthly_reports_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_monthly_reports_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      backlink_prospect_projects: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          backlink_prospect_id: string
          client_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          proyecto_id: string
          published_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          backlink_prospect_id: string
          client_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          proyecto_id: string
          published_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          backlink_prospect_id?: string
          client_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          proyecto_id?: string
          published_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_prospect_projects_assigned_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospect_projects_backlink_fkey"
            columns: ["backlink_prospect_id"]
            isOneToOne: false
            referencedRelation: "backlink_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospect_projects_client_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospect_projects_proyecto_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospect_projects_proyecto_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      backlink_prospects: {
        Row: {
          ahrefs_snapshot: Json | null
          ahrefs_snapshot_fetched_at: string | null
          anchor_text: string | null
          archived: boolean | null
          article_title: string | null
          assigned_to: string | null
          backlink_type: string | null
          brief_url: string | null
          citation_flow: number | null
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          country: string | null
          created_at: string | null
          domain_rating: number | null
          follow_nofollow: string | null
          id: string
          is_used: boolean | null
          notes: string | null
          price: number | null
          proyecto_id: string | null
          published_date: string | null
          quality_level: string | null
          response_time: number | null
          scheduled_date: string | null
          site_name: string | null
          site_url: string
          status: string | null
          strategy_id: string | null
          traffic_rating: number | null
          trust_flow: number | null
          updated_at: string | null
        }
        Insert: {
          ahrefs_snapshot?: Json | null
          ahrefs_snapshot_fetched_at?: string | null
          anchor_text?: string | null
          archived?: boolean | null
          article_title?: string | null
          assigned_to?: string | null
          backlink_type?: string | null
          brief_url?: string | null
          citation_flow?: number | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          domain_rating?: number | null
          follow_nofollow?: string | null
          id?: string
          is_used?: boolean | null
          notes?: string | null
          price?: number | null
          proyecto_id?: string | null
          published_date?: string | null
          quality_level?: string | null
          response_time?: number | null
          scheduled_date?: string | null
          site_name?: string | null
          site_url: string
          status?: string | null
          strategy_id?: string | null
          traffic_rating?: number | null
          trust_flow?: number | null
          updated_at?: string | null
        }
        Update: {
          ahrefs_snapshot?: Json | null
          ahrefs_snapshot_fetched_at?: string | null
          anchor_text?: string | null
          archived?: boolean | null
          article_title?: string | null
          assigned_to?: string | null
          backlink_type?: string | null
          brief_url?: string | null
          citation_flow?: number | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          domain_rating?: number | null
          follow_nofollow?: string | null
          id?: string
          is_used?: boolean | null
          notes?: string | null
          price?: number | null
          proyecto_id?: string | null
          published_date?: string | null
          quality_level?: string | null
          response_time?: number | null
          scheduled_date?: string | null
          site_name?: string | null
          site_url?: string
          status?: string | null
          strategy_id?: string | null
          traffic_rating?: number | null
          trust_flow?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_prospects_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "backlink_prospects_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "seo_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_prospects_cassino: {
        Row: {
          ahrefs_snapshot: Json | null
          ahrefs_snapshot_fetched_at: string | null
          anchor_text: string | null
          archived: boolean | null
          article_title: string | null
          assigned_to: string | null
          backlink_type: string | null
          brief_url: string | null
          citation_flow: number | null
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          country: string | null
          created_at: string | null
          domain_rating: number | null
          follow_nofollow: string | null
          id: string
          is_used: boolean | null
          notes: string | null
          price: number | null
          proyecto_id: string | null
          published_date: string | null
          quality_level: string | null
          response_time: number | null
          scheduled_date: string | null
          site_name: string | null
          site_url: string
          status: string | null
          strategy_id: string | null
          traffic_rating: number | null
          trust_flow: number | null
          updated_at: string | null
        }
        Insert: {
          ahrefs_snapshot?: Json | null
          ahrefs_snapshot_fetched_at?: string | null
          anchor_text?: string | null
          archived?: boolean | null
          article_title?: string | null
          assigned_to?: string | null
          backlink_type?: string | null
          brief_url?: string | null
          citation_flow?: number | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          domain_rating?: number | null
          follow_nofollow?: string | null
          id?: string
          is_used?: boolean | null
          notes?: string | null
          price?: number | null
          proyecto_id?: string | null
          published_date?: string | null
          quality_level?: string | null
          response_time?: number | null
          scheduled_date?: string | null
          site_name?: string | null
          site_url: string
          status?: string | null
          strategy_id?: string | null
          traffic_rating?: number | null
          trust_flow?: number | null
          updated_at?: string | null
        }
        Update: {
          ahrefs_snapshot?: Json | null
          ahrefs_snapshot_fetched_at?: string | null
          anchor_text?: string | null
          archived?: boolean | null
          article_title?: string | null
          assigned_to?: string | null
          backlink_type?: string | null
          brief_url?: string | null
          citation_flow?: number | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          domain_rating?: number | null
          follow_nofollow?: string | null
          id?: string
          is_used?: boolean | null
          notes?: string | null
          price?: number | null
          proyecto_id?: string | null
          published_date?: string | null
          quality_level?: string | null
          response_time?: number | null
          scheduled_date?: string | null
          site_name?: string | null
          site_url?: string
          status?: string | null
          strategy_id?: string | null
          traffic_rating?: number | null
          trust_flow?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_prospects_cassino_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_cassino_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_cassino_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_cassino_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "backlink_prospects_cassino_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "seo_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_prospects_verabet: {
        Row: {
          ahrefs_snapshot: Json | null
          ahrefs_snapshot_fetched_at: string | null
          anchor_text: string | null
          archived: boolean | null
          article_title: string | null
          assigned_to: string | null
          backlink_type: string | null
          brief_url: string | null
          citation_flow: number | null
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          country: string | null
          created_at: string | null
          domain_rating: number | null
          follow_nofollow: string | null
          id: string
          is_used: boolean | null
          notes: string | null
          price: number | null
          proyecto_id: string | null
          published_date: string | null
          quality_level: string | null
          response_time: number | null
          scheduled_date: string | null
          site_name: string | null
          site_url: string
          status: string | null
          strategy_id: string | null
          traffic_rating: number | null
          trust_flow: number | null
          updated_at: string | null
        }
        Insert: {
          ahrefs_snapshot?: Json | null
          ahrefs_snapshot_fetched_at?: string | null
          anchor_text?: string | null
          archived?: boolean | null
          article_title?: string | null
          assigned_to?: string | null
          backlink_type?: string | null
          brief_url?: string | null
          citation_flow?: number | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          domain_rating?: number | null
          follow_nofollow?: string | null
          id?: string
          is_used?: boolean | null
          notes?: string | null
          price?: number | null
          proyecto_id?: string | null
          published_date?: string | null
          quality_level?: string | null
          response_time?: number | null
          scheduled_date?: string | null
          site_name?: string | null
          site_url: string
          status?: string | null
          strategy_id?: string | null
          traffic_rating?: number | null
          trust_flow?: number | null
          updated_at?: string | null
        }
        Update: {
          ahrefs_snapshot?: Json | null
          ahrefs_snapshot_fetched_at?: string | null
          anchor_text?: string | null
          archived?: boolean | null
          article_title?: string | null
          assigned_to?: string | null
          backlink_type?: string | null
          brief_url?: string | null
          citation_flow?: number | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          domain_rating?: number | null
          follow_nofollow?: string | null
          id?: string
          is_used?: boolean | null
          notes?: string | null
          price?: number | null
          proyecto_id?: string | null
          published_date?: string | null
          quality_level?: string | null
          response_time?: number | null
          scheduled_date?: string | null
          site_name?: string | null
          site_url?: string
          status?: string | null
          strategy_id?: string | null
          traffic_rating?: number | null
          trust_flow?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_prospects_verabet_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_verabet_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_verabet_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_prospects_verabet_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "backlink_prospects_verabet_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "seo_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_report_escalations: {
        Row: {
          escalation_level: number
          id: string
          notification_count: number
          projects_pending: Json
          report_month: string
          triggered_at: string
        }
        Insert: {
          escalation_level: number
          id?: string
          notification_count?: number
          projects_pending?: Json
          report_month: string
          triggered_at?: string
        }
        Update: {
          escalation_level?: number
          id?: string
          notification_count?: number
          projects_pending?: Json
          report_month?: string
          triggered_at?: string
        }
        Relationships: []
      }
      backlinks: {
        Row: {
          allowed_anchor_id: string | null
          anchor_text: string | null
          assigned_to: string | null
          client_id: string
          costo: number | null
          created_at: string | null
          domain_rating: number | null
          estado: string | null
          fecha_publicacion: string | null
          follow_nofollow: string | null
          id: string
          nivel_calidad: string | null
          notas: string | null
          pais: string | null
          proyecto_id: string | null
          report_month: string | null
          responsable: string | null
          sitio_web: string | null
          strategy_id: string | null
          tipo_backlink: string | null
          traffic_rating: number | null
          updated_at: string | null
          url_destino: string
          url_origen: string
        }
        Insert: {
          allowed_anchor_id?: string | null
          anchor_text?: string | null
          assigned_to?: string | null
          client_id: string
          costo?: number | null
          created_at?: string | null
          domain_rating?: number | null
          estado?: string | null
          fecha_publicacion?: string | null
          follow_nofollow?: string | null
          id?: string
          nivel_calidad?: string | null
          notas?: string | null
          pais?: string | null
          proyecto_id?: string | null
          report_month?: string | null
          responsable?: string | null
          sitio_web?: string | null
          strategy_id?: string | null
          tipo_backlink?: string | null
          traffic_rating?: number | null
          updated_at?: string | null
          url_destino: string
          url_origen: string
        }
        Update: {
          allowed_anchor_id?: string | null
          anchor_text?: string | null
          assigned_to?: string | null
          client_id?: string
          costo?: number | null
          created_at?: string | null
          domain_rating?: number | null
          estado?: string | null
          fecha_publicacion?: string | null
          follow_nofollow?: string | null
          id?: string
          nivel_calidad?: string | null
          notas?: string | null
          pais?: string | null
          proyecto_id?: string | null
          report_month?: string | null
          responsable?: string | null
          sitio_web?: string | null
          strategy_id?: string | null
          tipo_backlink?: string | null
          traffic_rating?: number | null
          updated_at?: string | null
          url_destino?: string
          url_origen?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlinks_allowed_anchor_id_fkey"
            columns: ["allowed_anchor_id"]
            isOneToOne: false
            referencedRelation: "strategy_allowed_anchors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlinks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlinks_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlinks_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlinks_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "backlinks_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "seo_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      backlinks_metrics: {
        Row: {
          archived: boolean | null
          backlinks_count: number | null
          cliente_id: string
          created_at: string | null
          domain_rating: number | null
          dominios_referentes: number | null
          fecha_registro: string
          id: string
          periodo_desde: string
          periodo_hasta: string
          proyecto_id: string
          shared_analysis_id: string | null
          total_backlinks_historico: number | null
          total_dominios_referentes_historico: number | null
          updated_at: string | null
          url_rating: number | null
        }
        Insert: {
          archived?: boolean | null
          backlinks_count?: number | null
          cliente_id: string
          created_at?: string | null
          domain_rating?: number | null
          dominios_referentes?: number | null
          fecha_registro?: string
          id?: string
          periodo_desde: string
          periodo_hasta: string
          proyecto_id: string
          shared_analysis_id?: string | null
          total_backlinks_historico?: number | null
          total_dominios_referentes_historico?: number | null
          updated_at?: string | null
          url_rating?: number | null
        }
        Update: {
          archived?: boolean | null
          backlinks_count?: number | null
          cliente_id?: string
          created_at?: string | null
          domain_rating?: number | null
          dominios_referentes?: number | null
          fecha_registro?: string
          id?: string
          periodo_desde?: string
          periodo_hasta?: string
          proyecto_id?: string
          shared_analysis_id?: string | null
          total_backlinks_historico?: number | null
          total_dominios_referentes_historico?: number | null
          updated_at?: string | null
          url_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backlinks_metrics_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlinks_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlinks_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      backup_metadata: {
        Row: {
          backup_date: string | null
          backup_type: string | null
          id: string
          notes: string | null
          record_count: number | null
          table_name: string | null
        }
        Insert: {
          backup_date?: string | null
          backup_type?: string | null
          id?: string
          notes?: string | null
          record_count?: number | null
          table_name?: string | null
        }
        Update: {
          backup_date?: string | null
          backup_type?: string | null
          id?: string
          notes?: string | null
          record_count?: number | null
          table_name?: string | null
        }
        Relationships: []
      }
      brand_ahrefs_competitor_cache: {
        Row: {
          client_id: string
          country_code: string
          created_at: string
          id: string
          keywords_limit: number
          last_fetched_at: string
          meta_json: Json
          next_refresh_at: string
          proyecto_id: string
          rows_json: Json
          serp_top_positions: number
          source_date: string | null
          source_date_compared: string | null
          target_domain: string
          updated_at: string
        }
        Insert: {
          client_id: string
          country_code?: string
          created_at?: string
          id?: string
          keywords_limit?: number
          last_fetched_at?: string
          meta_json?: Json
          next_refresh_at?: string
          proyecto_id: string
          rows_json?: Json
          serp_top_positions?: number
          source_date?: string | null
          source_date_compared?: string | null
          target_domain: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          country_code?: string
          created_at?: string
          id?: string
          keywords_limit?: number
          last_fetched_at?: string
          meta_json?: Json
          next_refresh_at?: string
          proyecto_id?: string
          rows_json?: Json
          serp_top_positions?: number
          source_date?: string | null
          source_date_compared?: string | null
          target_domain?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_ahrefs_competitor_cache_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ahrefs_competitor_cache_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ahrefs_competitor_cache_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          brand_identity_id: string
          created_at: string | null
          description: string | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          brand_identity_id: string
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          brand_identity_id?: string
          created_at?: string | null
          description?: string | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_identity_fkey"
            columns: ["brand_identity_id"]
            isOneToOne: false
            referencedRelation: "brand_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_colors: {
        Row: {
          brand_identity_id: string
          created_at: string | null
          description: string | null
          hex_value: string
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          brand_identity_id: string
          created_at?: string | null
          description?: string | null
          hex_value: string
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          brand_identity_id?: string
          created_at?: string | null
          description?: string | null
          hex_value?: string
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_colors_identity_fkey"
            columns: ["brand_identity_id"]
            isOneToOne: false
            referencedRelation: "brand_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_identities: {
        Row: {
          base_scale: number | null
          base_size_px: number | null
          base_unit_px: number | null
          body_font: string | null
          border_radius_px: number | null
          created_at: string | null
          heading_font: string | null
          id: string
          is_dark_mode: boolean | null
          personality_energy: string | null
          personality_tone: string | null
          proyecto_id: string
          target_audience: string | null
          updated_at: string | null
        }
        Insert: {
          base_scale?: number | null
          base_size_px?: number | null
          base_unit_px?: number | null
          body_font?: string | null
          border_radius_px?: number | null
          created_at?: string | null
          heading_font?: string | null
          id?: string
          is_dark_mode?: boolean | null
          personality_energy?: string | null
          personality_tone?: string | null
          proyecto_id: string
          target_audience?: string | null
          updated_at?: string | null
        }
        Update: {
          base_scale?: number | null
          base_size_px?: number | null
          base_unit_px?: number | null
          body_font?: string | null
          border_radius_px?: number | null
          created_at?: string | null
          heading_font?: string | null
          id?: string
          is_dark_mode?: boolean | null
          personality_energy?: string | null
          personality_tone?: string | null
          proyecto_id?: string
          target_audience?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_identities_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: true
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_identities_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: true
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      business_calendar: {
        Row: {
          calendar_date: string
          country_code: string
          created_at: string
          is_working_day: boolean
          reason: string
          source: string
          timezone: string
          updated_at: string
        }
        Insert: {
          calendar_date: string
          country_code?: string
          created_at?: string
          is_working_day: boolean
          reason: string
          source?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          calendar_date?: string
          country_code?: string
          created_at?: string
          is_working_day?: boolean
          reason?: string
          source?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          created_at: string | null
          id: number
          nombre: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          nombre: string
        }
        Update: {
          created_at?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      certification_answers: {
        Row: {
          explanation: string | null
          id: string
          is_correct: boolean | null
          question_id: string
          score_value: number | null
          text: string
        }
        Insert: {
          explanation?: string | null
          id?: string
          is_correct?: boolean | null
          question_id: string
          score_value?: number | null
          text: string
        }
        Update: {
          explanation?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string
          score_value?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "certification_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_attempt_answers: {
        Row: {
          answer_id: string | null
          attempt_id: string | null
          id: string
          is_correct: boolean | null
          question_id: string | null
        }
        Insert: {
          answer_id?: string | null
          attempt_id?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string | null
        }
        Update: {
          answer_id?: string | null
          attempt_id?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certification_attempt_answers_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "certification_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certification_attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "certification_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certification_attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "certification_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_attempts: {
        Row: {
          completed_at: string | null
          exam_id: string
          id: string
          passed: boolean | null
          score_obtained: number | null
          started_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          exam_id: string
          id?: string
          passed?: boolean | null
          score_obtained?: number | null
          started_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          exam_id?: string
          id?: string
          passed?: boolean | null
          score_obtained?: number | null
          started_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "certification_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certification_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      certification_exam_candidates: {
        Row: {
          assigned_at: string | null
          exam_id: string
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          exam_id: string
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          exam_id?: string
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_exam_candidates_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "certification_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certification_exam_candidates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_exams: {
        Row: {
          categories: string[] | null
          category: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          level: string
          min_passing_points: number | null
          passing_score: number | null
          scheduled_at: string | null
          status: string | null
          time_limit_minutes: number | null
          title: string
        }
        Insert: {
          categories?: string[] | null
          category?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          level?: string
          min_passing_points?: number | null
          passing_score?: number | null
          scheduled_at?: string | null
          status?: string | null
          time_limit_minutes?: number | null
          title: string
        }
        Update: {
          categories?: string[] | null
          category?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          level?: string
          min_passing_points?: number | null
          passing_score?: number | null
          scheduled_at?: string | null
          status?: string | null
          time_limit_minutes?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_exams_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "certification_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_questions: {
        Row: {
          categories: string[]
          created_at: string
          difficulty: string | null
          exam_id: string | null
          id: string
          order_index: number | null
          points: number | null
          question_type: string | null
          text: string
          time_limit_seconds: number | null
        }
        Insert: {
          categories: string[]
          created_at?: string
          difficulty?: string | null
          exam_id?: string | null
          id?: string
          order_index?: number | null
          points?: number | null
          question_type?: string | null
          text: string
          time_limit_seconds?: number | null
        }
        Update: {
          categories?: string[]
          created_at?: string
          difficulty?: string | null
          exam_id?: string | null
          id?: string
          order_index?: number | null
          points?: number | null
          question_type?: string | null
          text?: string
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "certification_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "certification_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_memory: {
        Row: {
          created_at: string | null
          id: string
          message: Json
          session_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: Json
          session_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      clickup_task_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          task_id: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          task_id: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          task_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "clickup_task_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "clickup_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "view_salud_tablero"
            referencedColumns: ["tarea_id"]
          },
        ]
      }
      clickup_task_mentions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean | null
          mentioned_user_id: string
          message: string | null
          read_at: string | null
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean | null
          mentioned_user_id: string
          message?: string | null
          read_at?: string | null
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean | null
          mentioned_user_id?: string
          message?: string | null
          read_at?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clickup_task_mentions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_mentions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "clickup_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_mentions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "view_salud_tablero"
            referencedColumns: ["tarea_id"]
          },
        ]
      }
      clickup_task_subtasks: {
        Row: {
          assignee_id: string | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          id: string
          is_expanded: boolean | null
          parent_id: string | null
          priority: string | null
          status: string | null
          task_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string
          is_expanded?: boolean | null
          parent_id?: string | null
          priority?: string | null
          status?: string | null
          task_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string
          is_expanded?: boolean | null
          parent_id?: string | null
          priority?: string | null
          status?: string | null
          task_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clickup_task_subtasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_subtasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_subtasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "clickup_task_subtasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "clickup_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_task_subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "view_salud_tablero"
            referencedColumns: ["tarea_id"]
          },
        ]
      }
      clickup_tasks: {
        Row: {
          assigned_to: string | null
          assignees: Json | null
          clickup_url: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_viewed: boolean | null
          name: string | null
          priority: string | null
          priority_id: number | null
          proyecto_id: string | null
          status: string | null
          status_id: number | null
          status_name: string | null
          tags: Json | null
          updated_at: string | null
          updated_at_supabase: string | null
          url: string | null
          viewed_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          assignees?: Json | null
          clickup_url?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id: string
          is_viewed?: boolean | null
          name?: string | null
          priority?: string | null
          priority_id?: number | null
          proyecto_id?: string | null
          status?: string | null
          status_id?: number | null
          status_name?: string | null
          tags?: Json | null
          updated_at?: string | null
          updated_at_supabase?: string | null
          url?: string | null
          viewed_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          assignees?: Json | null
          clickup_url?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_viewed?: boolean | null
          name?: string | null
          priority?: string | null
          priority_id?: number | null
          proyecto_id?: string | null
          status?: string | null
          status_id?: number | null
          status_name?: string | null
          tags?: Json | null
          updated_at?: string | null
          updated_at_supabase?: string | null
          url?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clickup_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_tasks_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_tasks_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "fk_clickup_tasks_priority"
            columns: ["priority_id"]
            isOneToOne: false
            referencedRelation: "task_priorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clickup_tasks_status"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      client_article_feedback: {
        Row: {
          area_afectada: string | null
          atendido_por: string | null
          client_id: string
          content_item_id: string
          created_at: string
          descripcion: string
          ejemplo_sugerido: string | null
          id: string
          respuesta_texto: string | null
          status: string
          submitted_by: string
          tipo: string
          updated_at: string
        }
        Insert: {
          area_afectada?: string | null
          atendido_por?: string | null
          client_id: string
          content_item_id: string
          created_at?: string
          descripcion: string
          ejemplo_sugerido?: string | null
          id?: string
          respuesta_texto?: string | null
          status?: string
          submitted_by: string
          tipo: string
          updated_at?: string
        }
        Update: {
          area_afectada?: string | null
          atendido_por?: string | null
          client_id?: string
          content_item_id?: string
          created_at?: string
          descripcion?: string
          ejemplo_sugerido?: string | null
          id?: string
          respuesta_texto?: string | null
          status?: string
          submitted_by?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_article_feedback_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_article_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_article_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_article_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_article_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_article_feedback_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_request_attention_alerts: {
        Row: {
          alert_level: number
          assigned_to: string | null
          attention_reason: string | null
          client_request_id: string
          consecutive_days_attention: number
          created_at: string
          first_detected_at: string
          is_active: boolean
          last_alert_level_sent: number
          last_evaluated_on: string | null
          last_notified_at: string | null
          proyecto_id: string | null
          resolved_at: string | null
          slack_channel_id: string | null
          updated_at: string
        }
        Insert: {
          alert_level?: number
          assigned_to?: string | null
          attention_reason?: string | null
          client_request_id: string
          consecutive_days_attention?: number
          created_at?: string
          first_detected_at?: string
          is_active?: boolean
          last_alert_level_sent?: number
          last_evaluated_on?: string | null
          last_notified_at?: string | null
          proyecto_id?: string | null
          resolved_at?: string | null
          slack_channel_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_level?: number
          assigned_to?: string | null
          attention_reason?: string | null
          client_request_id?: string
          consecutive_days_attention?: number
          created_at?: string
          first_detected_at?: string
          is_active?: boolean
          last_alert_level_sent?: number
          last_evaluated_on?: string | null
          last_notified_at?: string | null
          proyecto_id?: string | null
          resolved_at?: string | null
          slack_channel_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_request_attention_alerts_client_request_id_fkey"
            columns: ["client_request_id"]
            isOneToOne: true
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_request_attention_alerts_client_request_id_fkey"
            columns: ["client_request_id"]
            isOneToOne: true
            referencedRelation: "client_requests_attention"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requests: {
        Row: {
          archived: boolean | null
          assigned_to: string | null
          attachments: Json | null
          blocked_reason: string | null
          category: string
          completed_at: string | null
          completion_description: string | null
          completion_links: Json | null
          created_at: string | null
          created_by: string | null
          description: string
          escalation_level: number
          expected_date: string
          external_brand_id: string | null
          follow_up_count: number
          follow_up_date: string | null
          id: string
          internal_notes: string | null
          last_attention_notified_at: string | null
          last_follow_up_at: string | null
          last_message_at: string | null
          message_count: number
          next_follow_up_at: string | null
          priority: string
          proyecto_id: string | null
          reference_links: Json | null
          request_name: string
          snoozed_until: string | null
          status: string | null
          subcategory: string
          updated_at: string | null
          waiting_since: string | null
        }
        Insert: {
          archived?: boolean | null
          assigned_to?: string | null
          attachments?: Json | null
          blocked_reason?: string | null
          category: string
          completed_at?: string | null
          completion_description?: string | null
          completion_links?: Json | null
          created_at?: string | null
          created_by?: string | null
          description: string
          escalation_level?: number
          expected_date: string
          external_brand_id?: string | null
          follow_up_count?: number
          follow_up_date?: string | null
          id?: string
          internal_notes?: string | null
          last_attention_notified_at?: string | null
          last_follow_up_at?: string | null
          last_message_at?: string | null
          message_count?: number
          next_follow_up_at?: string | null
          priority: string
          proyecto_id?: string | null
          reference_links?: Json | null
          request_name: string
          snoozed_until?: string | null
          status?: string | null
          subcategory: string
          updated_at?: string | null
          waiting_since?: string | null
        }
        Update: {
          archived?: boolean | null
          assigned_to?: string | null
          attachments?: Json | null
          blocked_reason?: string | null
          category?: string
          completed_at?: string | null
          completion_description?: string | null
          completion_links?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          escalation_level?: number
          expected_date?: string
          external_brand_id?: string | null
          follow_up_count?: number
          follow_up_date?: string | null
          id?: string
          internal_notes?: string | null
          last_attention_notified_at?: string | null
          last_follow_up_at?: string | null
          last_message_at?: string | null
          message_count?: number
          next_follow_up_at?: string | null
          priority?: string
          proyecto_id?: string | null
          reference_links?: Json | null
          request_name?: string
          snoozed_until?: string | null
          status?: string | null
          subcategory?: string
          updated_at?: string | null
          waiting_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_assigned_to_fkey1"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_created_by_fkey1"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_external_brand_id_fkey"
            columns: ["external_brand_id"]
            isOneToOne: false
            referencedRelation: "external_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      client_resources: {
        Row: {
          created_at: string | null
          file_type: string | null
          file_url: string | null
          id: string
          proyecto_id: string
          resource_description: string | null
          resource_title: string
          resource_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          proyecto_id: string
          resource_description?: string | null
          resource_title: string
          resource_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          proyecto_id?: string
          resource_description?: string | null
          resource_title?: string
          resource_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_resources_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_resources_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      client_services_config: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          service_type: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          service_type: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          service_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_services_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_validation_summaries: {
        Row: {
          client_id: string
          id: string
          summary_html: string | null
          tasks_data: Json | null
          updated_at: string | null
          week_of: string | null
        }
        Insert: {
          client_id: string
          id?: string
          summary_html?: string | null
          tasks_data?: Json | null
          updated_at?: string | null
          week_of?: string | null
        }
        Update: {
          client_id?: string
          id?: string
          summary_html?: string | null
          tasks_data?: Json | null
          updated_at?: string | null
          week_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_validation_summaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_users: {
        Row: {
          client_id: string
          created_at: string
          language: string | null
          proyecto_id: string | null
          selected: boolean
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          language?: string | null
          proyecto_id?: string | null
          selected?: boolean
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          language?: string | null
          proyecto_id?: string | null
          selected?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_users_language_fkey"
            columns: ["language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "cliente_users_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_users_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "cliente_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          created_at: string
          id: string
          language: string | null
          name: string
          onboarding_manual_tasks: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          name: string
          onboarding_manual_tasks?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          name?: string
          onboarding_manual_tasks?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_language_fkey"
            columns: ["language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
        ]
      }
      company_policies: {
        Row: {
          client_id: string | null
          content: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          language: string
          policy_type: string
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          content: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          language?: string
          policy_type: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          content?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          language?: string
          policy_type?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contenidos_backup: {
        Row: {
          autor_id: string | null
          cliente_id: string | null
          created_at: string | null
          estado: string | null
          fecha_publicacion: string | null
          id: string | null
          proyecto_id: string | null
          recuento_palabras: number | null
          tipo_contenido: string | null
          titulo: string | null
          ubicacion: string | null
          updated_at: string | null
          url_publicacion: string | null
        }
        Insert: {
          autor_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_publicacion?: string | null
          id?: string | null
          proyecto_id?: string | null
          recuento_palabras?: number | null
          tipo_contenido?: string | null
          titulo?: string | null
          ubicacion?: string | null
          updated_at?: string | null
          url_publicacion?: string | null
        }
        Update: {
          autor_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_publicacion?: string | null
          id?: string | null
          proyecto_id?: string | null
          recuento_palabras?: number | null
          tipo_contenido?: string | null
          titulo?: string | null
          ubicacion?: string | null
          updated_at?: string | null
          url_publicacion?: string | null
        }
        Relationships: []
      }
      content_action_history: {
        Row: {
          action: string
          content_id: string
          id: string
          ip_address: unknown
          new_value: Json | null
          notes: string | null
          performed_at: string | null
          performed_by: string | null
          previous_value: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          content_id: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          notes?: string | null
          performed_at?: string | null
          performed_by?: string | null
          previous_value?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          content_id?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          notes?: string | null
          performed_at?: string | null
          performed_by?: string | null
          previous_value?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_action_history_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_action_history_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_action_history_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_action_history_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_attachments: {
        Row: {
          content_id: string
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          content_id: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          content_id?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_attachments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_attachments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_attachments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_audio_items: {
        Row: {
          audio_mode: string
          audio_script: string | null
          audio_storage_bucket: string | null
          audio_storage_path: string | null
          audio_url: string | null
          content_item_id: string
          created_at: string
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          generated_at: string | null
          id: string
          language_code: string
          mime_type: string | null
          model: string | null
          provider: string | null
          retry_count: number
          script_word_count: number
          status: string
          target_duration_seconds: number | null
          transcript_url: string | null
          updated_at: string
          voice_contract: Json
          voice_name: string | null
          voice_profile_id: string | null
          voice_profile_key: string | null
        }
        Insert: {
          audio_mode?: string
          audio_script?: string | null
          audio_storage_bucket?: string | null
          audio_storage_path?: string | null
          audio_url?: string | null
          content_item_id: string
          created_at?: string
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          generated_at?: string | null
          id?: string
          language_code?: string
          mime_type?: string | null
          model?: string | null
          provider?: string | null
          retry_count?: number
          script_word_count?: number
          status?: string
          target_duration_seconds?: number | null
          transcript_url?: string | null
          updated_at?: string
          voice_contract?: Json
          voice_name?: string | null
          voice_profile_id?: string | null
          voice_profile_key?: string | null
        }
        Update: {
          audio_mode?: string
          audio_script?: string | null
          audio_storage_bucket?: string | null
          audio_storage_path?: string | null
          audio_url?: string | null
          content_item_id?: string
          created_at?: string
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          generated_at?: string | null
          id?: string
          language_code?: string
          mime_type?: string | null
          model?: string | null
          provider?: string | null
          retry_count?: number
          script_word_count?: number
          status?: string
          target_duration_seconds?: number | null
          transcript_url?: string | null
          updated_at?: string
          voice_contract?: Json
          voice_name?: string | null
          voice_profile_id?: string | null
          voice_profile_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_audio_items_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_audio_items_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_audio_items_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_audio_items_voice_profile_id_fkey"
            columns: ["voice_profile_id"]
            isOneToOne: false
            referencedRelation: "audio_voice_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_categories: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          language: string | null
          main_keyword_id: string | null
          name: string
          parent_id: string | null
          slug: string | null
          sort_order: number | null
          updated_at: string | null
          vertical_anchor_text: string | null
          vertical_target_url: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          main_keyword_id?: string | null
          name: string
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
          updated_at?: string | null
          vertical_anchor_text?: string | null
          vertical_target_url?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          main_keyword_id?: string | null
          name?: string
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
          updated_at?: string | null
          vertical_anchor_text?: string | null
          vertical_target_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_categories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_categories_language_fkey"
            columns: ["language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "content_categories_main_keyword_id_fkey"
            columns: ["main_keyword_id"]
            isOneToOne: false
            referencedRelation: "keyword_research_approved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      content_clusters: {
        Row: {
          brand_name: string | null
          client_id: string | null
          cluster_key: string
          cluster_name: string
          commercial_priority: string | null
          country: string | null
          created_at: string
          description: string | null
          domain: string | null
          id: string
          language: string | null
          main_topic: string | null
          metadata: Json
          pillar_content_id: string | null
          proyecto_id: string
          source_method: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_name?: string | null
          client_id?: string | null
          cluster_key: string
          cluster_name: string
          commercial_priority?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          id?: string
          language?: string | null
          main_topic?: string | null
          metadata?: Json
          pillar_content_id?: string | null
          proyecto_id: string
          source_method?: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_name?: string | null
          client_id?: string | null
          cluster_key?: string
          cluster_name?: string
          commercial_priority?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          id?: string
          language?: string | null
          main_topic?: string | null
          metadata?: Json
          pillar_content_id?: string | null
          proyecto_id?: string
          source_method?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_clusters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_clusters_pillar_content_id_fkey"
            columns: ["pillar_content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_clusters_pillar_content_id_fkey"
            columns: ["pillar_content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_clusters_pillar_content_id_fkey"
            columns: ["pillar_content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_clusters_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_clusters_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      content_comments: {
        Row: {
          category_tag: string | null
          comment: string
          comment_type: string | null
          content_id: string
          created_at: string | null
          created_by: string
          id: string
          is_correction: boolean | null
          is_resolved: boolean | null
          parent_comment_id: string | null
          resolution_summary: string | null
          selected_text: string | null
          status: string | null
          suggested_text: string | null
          updated_at: string | null
        }
        Insert: {
          category_tag?: string | null
          comment: string
          comment_type?: string | null
          content_id: string
          created_at?: string | null
          created_by: string
          id?: string
          is_correction?: boolean | null
          is_resolved?: boolean | null
          parent_comment_id?: string | null
          resolution_summary?: string | null
          selected_text?: string | null
          status?: string | null
          suggested_text?: string | null
          updated_at?: string | null
        }
        Update: {
          category_tag?: string | null
          comment?: string
          comment_type?: string | null
          content_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          is_correction?: boolean | null
          is_resolved?: boolean | null
          parent_comment_id?: string | null
          resolution_summary?: string | null
          selected_text?: string | null
          status?: string | null
          suggested_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "content_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      content_feedback: {
        Row: {
          categoria: string
          clasificacion_ia: string | null
          content_item_id: string
          created_at: string
          ejemplo_correcto: string | null
          embedding: string | null
          id: string
          observacion: string
          redactor_id: string | null
          seccion_afectada: string | null
          severidad: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          categoria: string
          clasificacion_ia?: string | null
          content_item_id: string
          created_at?: string
          ejemplo_correcto?: string | null
          embedding?: string | null
          id?: string
          observacion: string
          redactor_id?: string | null
          seccion_afectada?: string | null
          severidad: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          clasificacion_ia?: string | null
          content_item_id?: string
          created_at?: string
          ejemplo_correcto?: string | null
          embedding?: string | null
          id?: string
          observacion?: string
          redactor_id?: string | null
          seccion_afectada?: string | null
          severidad?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_redactor_id_fkey"
            columns: ["redactor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_generation_alerts: {
        Row: {
          alert_type: string
          content_item_id: string | null
          context: Json
          created_at: string
          id: string
          message: string
          resolved_at: string | null
          severity: string
          status: string
        }
        Insert: {
          alert_type: string
          content_item_id?: string | null
          context?: Json
          created_at?: string
          id?: string
          message: string
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Update: {
          alert_type?: string
          content_item_id?: string | null
          context?: Json
          created_at?: string
          id?: string
          message?: string
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_generation_alerts_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_generation_alerts_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_generation_alerts_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      content_generation_logs: {
        Row: {
          actual_cost_usd: number | null
          agent_or_skill: string | null
          asset_count: number
          billing_source: string | null
          content_item_id: string
          cost_currency: string
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          id: string
          image_count: number
          input_snapshot: Json | null
          latency_ms: number | null
          model: string | null
          operation_type: string
          output_snapshot: Json | null
          pricing_snapshot: Json | null
          provider: string | null
          run_id: string
          status: string
          step: string
          tokens_input: number | null
          tokens_output: number | null
          tokens_total: number | null
          unit_cost_usd: number | null
          unit_count: number | null
          unit_type: string | null
        }
        Insert: {
          actual_cost_usd?: number | null
          agent_or_skill?: string | null
          asset_count?: number
          billing_source?: string | null
          content_item_id: string
          cost_currency?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          image_count?: number
          input_snapshot?: Json | null
          latency_ms?: number | null
          model?: string | null
          operation_type?: string
          output_snapshot?: Json | null
          pricing_snapshot?: Json | null
          provider?: string | null
          run_id: string
          status: string
          step: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          unit_cost_usd?: number | null
          unit_count?: number | null
          unit_type?: string | null
        }
        Update: {
          actual_cost_usd?: number | null
          agent_or_skill?: string | null
          asset_count?: number
          billing_source?: string | null
          content_item_id?: string
          cost_currency?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          image_count?: number
          input_snapshot?: Json | null
          latency_ms?: number | null
          model?: string | null
          operation_type?: string
          output_snapshot?: Json | null
          pricing_snapshot?: Json | null
          provider?: string | null
          run_id?: string
          status?: string
          step?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          unit_cost_usd?: number | null
          unit_count?: number | null
          unit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_generation_logs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_generation_logs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_generation_logs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          actual_word_count: number | null
          ai_context: Json | null
          ai_extraction_status: string | null
          archived: boolean | null
          article_content: string | null
          author_id: string | null
          brief_data: Json | null
          brief_url: string | null
          category_id: string | null
          character_count: number | null
          checklist_completed_at: string | null
          checklist_completion_percentage: number | null
          checklist_document_submitted_at: string | null
          checklist_document_submitted_by: string | null
          checklist_document_url: string | null
          client_approval_status: string | null
          client_id: string
          compliance_status: string | null
          content_doc_url: string | null
          content_score: number | null
          content_type: string
          content_uploaded_at: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          custom_metadata: Json | null
          editor_id: string | null
          enrichment_completed_at: string | null
          enrichment_elements: Json | null
          enrichment_status: string | null
          enrichment_version: string | null
          expiration_date: string | null
          expiration_notification_sent: boolean | null
          fecha_aprobacion: string | null
          fecha_entrega_redactor: string | null
          final_published_url: string | null
          gbp_notes: string | null
          gbp_post_content: string | null
          gbp_scheduled_date: string | null
          gbp_status: string | null
          id: string
          ils_completed_at: string | null
          ils_decisions_count: number | null
          ils_status: string | null
          internal_linking_suggestions: string | null
          is_latest_version: boolean | null
          keyword_difficulty: number | null
          language: string | null
          last_modified_by: string | null
          last_reminder_date: string | null
          main_keyword: string
          main_keyword_id: string | null
          meta_description: string | null
          og_image_url: string | null
          parent_keyword: string | null
          parent_version_id: string | null
          processed_at: string | null
          proyecto_id: string | null
          publication_date: string | null
          published_at: string | null
          published_by: string | null
          quality_hub_report_data: Json | null
          quality_hub_usage_date: string | null
          raw_source_content: string | null
          reading_time: number | null
          rejection_justification: string | null
          reminder_sent_count: number | null
          reviewer_id: string | null
          scheduled_date: string | null
          search_volume: number | null
          secondary_keywords: string[] | null
          seo_audit_processed_at: string | null
          seo_audit_report: string | null
          seo_checklist: Json | null
          slug: string | null
          staging_url: string | null
          status: string
          status_wp: string | null
          status_wp_msg: string | null
          strategic_analysis: Json | null
          title: string
          topics_id: string | null
          traffic_potential: number | null
          updated_at: string | null
          validation_deadline: string | null
          version: number | null
          word_count: number | null
        }
        Insert: {
          actual_word_count?: number | null
          ai_context?: Json | null
          ai_extraction_status?: string | null
          archived?: boolean | null
          article_content?: string | null
          author_id?: string | null
          brief_data?: Json | null
          brief_url?: string | null
          category_id?: string | null
          character_count?: number | null
          checklist_completed_at?: string | null
          checklist_completion_percentage?: number | null
          checklist_document_submitted_at?: string | null
          checklist_document_submitted_by?: string | null
          checklist_document_url?: string | null
          client_approval_status?: string | null
          client_id: string
          compliance_status?: string | null
          content_doc_url?: string | null
          content_score?: number | null
          content_type: string
          content_uploaded_at?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_metadata?: Json | null
          editor_id?: string | null
          enrichment_completed_at?: string | null
          enrichment_elements?: Json | null
          enrichment_status?: string | null
          enrichment_version?: string | null
          expiration_date?: string | null
          expiration_notification_sent?: boolean | null
          fecha_aprobacion?: string | null
          fecha_entrega_redactor?: string | null
          final_published_url?: string | null
          gbp_notes?: string | null
          gbp_post_content?: string | null
          gbp_scheduled_date?: string | null
          gbp_status?: string | null
          id?: string
          ils_completed_at?: string | null
          ils_decisions_count?: number | null
          ils_status?: string | null
          internal_linking_suggestions?: string | null
          is_latest_version?: boolean | null
          keyword_difficulty?: number | null
          language?: string | null
          last_modified_by?: string | null
          last_reminder_date?: string | null
          main_keyword: string
          main_keyword_id?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          parent_keyword?: string | null
          parent_version_id?: string | null
          processed_at?: string | null
          proyecto_id?: string | null
          publication_date?: string | null
          published_at?: string | null
          published_by?: string | null
          quality_hub_report_data?: Json | null
          quality_hub_usage_date?: string | null
          raw_source_content?: string | null
          reading_time?: number | null
          rejection_justification?: string | null
          reminder_sent_count?: number | null
          reviewer_id?: string | null
          scheduled_date?: string | null
          search_volume?: number | null
          secondary_keywords?: string[] | null
          seo_audit_processed_at?: string | null
          seo_audit_report?: string | null
          seo_checklist?: Json | null
          slug?: string | null
          staging_url?: string | null
          status?: string
          status_wp?: string | null
          status_wp_msg?: string | null
          strategic_analysis?: Json | null
          title: string
          topics_id?: string | null
          traffic_potential?: number | null
          updated_at?: string | null
          validation_deadline?: string | null
          version?: number | null
          word_count?: number | null
        }
        Update: {
          actual_word_count?: number | null
          ai_context?: Json | null
          ai_extraction_status?: string | null
          archived?: boolean | null
          article_content?: string | null
          author_id?: string | null
          brief_data?: Json | null
          brief_url?: string | null
          category_id?: string | null
          character_count?: number | null
          checklist_completed_at?: string | null
          checklist_completion_percentage?: number | null
          checklist_document_submitted_at?: string | null
          checklist_document_submitted_by?: string | null
          checklist_document_url?: string | null
          client_approval_status?: string | null
          client_id?: string
          compliance_status?: string | null
          content_doc_url?: string | null
          content_score?: number | null
          content_type?: string
          content_uploaded_at?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_metadata?: Json | null
          editor_id?: string | null
          enrichment_completed_at?: string | null
          enrichment_elements?: Json | null
          enrichment_status?: string | null
          enrichment_version?: string | null
          expiration_date?: string | null
          expiration_notification_sent?: boolean | null
          fecha_aprobacion?: string | null
          fecha_entrega_redactor?: string | null
          final_published_url?: string | null
          gbp_notes?: string | null
          gbp_post_content?: string | null
          gbp_scheduled_date?: string | null
          gbp_status?: string | null
          id?: string
          ils_completed_at?: string | null
          ils_decisions_count?: number | null
          ils_status?: string | null
          internal_linking_suggestions?: string | null
          is_latest_version?: boolean | null
          keyword_difficulty?: number | null
          language?: string | null
          last_modified_by?: string | null
          last_reminder_date?: string | null
          main_keyword?: string
          main_keyword_id?: string | null
          meta_description?: string | null
          og_image_url?: string | null
          parent_keyword?: string | null
          parent_version_id?: string | null
          processed_at?: string | null
          proyecto_id?: string | null
          publication_date?: string | null
          published_at?: string | null
          published_by?: string | null
          quality_hub_report_data?: Json | null
          quality_hub_usage_date?: string | null
          raw_source_content?: string | null
          reading_time?: number | null
          rejection_justification?: string | null
          reminder_sent_count?: number | null
          reviewer_id?: string | null
          scheduled_date?: string | null
          search_volume?: number | null
          secondary_keywords?: string[] | null
          seo_audit_processed_at?: string | null
          seo_audit_report?: string | null
          seo_checklist?: Json | null
          slug?: string | null
          staging_url?: string | null
          status?: string
          status_wp?: string | null
          status_wp_msg?: string | null
          strategic_analysis?: Json | null
          title?: string
          topics_id?: string | null
          traffic_potential?: number | null
          updated_at?: string | null
          validation_deadline?: string | null
          version?: number | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_checklist_document_submitted_by_fkey"
            columns: ["checklist_document_submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_language_fkey"
            columns: ["language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "content_items_last_modified_by_fkey"
            columns: ["last_modified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_main_keyword_id_fkey"
            columns: ["main_keyword_id"]
            isOneToOne: false
            referencedRelation: "keyword_research"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "content_items_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_topics_id_fkey"
            columns: ["topics_id"]
            isOneToOne: false
            referencedRelation: "topic_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      content_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          content_id: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          status: string | null
          task_type: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          content_id: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          task_type: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          content_id?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          task_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      content_validation_notifications: {
        Row: {
          content_id: string
          created_at: string | null
          id: string
          notification_type: string
          sent_at: string | null
          sent_to: string
          slack_message_ts: string | null
          status: string | null
        }
        Insert: {
          content_id: string
          created_at?: string | null
          id?: string
          notification_type: string
          sent_at?: string | null
          sent_to: string
          slack_message_ts?: string | null
          status?: string | null
        }
        Update: {
          content_id?: string
          created_at?: string | null
          id?: string
          notification_type?: string
          sent_at?: string | null
          sent_to?: string
          slack_message_ts?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_validation_notifications_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_validation_notifications_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_validation_notifications_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_validation_notifications_sent_to_fkey"
            columns: ["sent_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_canibalizacion: {
        Row: {
          activo_id: string | null
          cannibal_url_path: string | null
          cannibal_url_rank: number | null
          id: string
          impacto_nivel: string | null
          kw_conflicto: string | null
          recomendacion_url: string | null
          target_url_rank: number | null
        }
        Insert: {
          activo_id?: string | null
          cannibal_url_path?: string | null
          cannibal_url_rank?: number | null
          id?: string
          impacto_nivel?: string | null
          kw_conflicto?: string | null
          recomendacion_url?: string | null
          target_url_rank?: number | null
        }
        Update: {
          activo_id?: string | null
          cannibal_url_path?: string | null
          cannibal_url_rank?: number | null
          id?: string
          impacto_nivel?: string | null
          kw_conflicto?: string | null
          recomendacion_url?: string | null
          target_url_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_canibalizacion_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_canibalizacion_v2: {
        Row: {
          accion_recomendada_label: string | null
          activo_id: string
          cannibal_url_path: string | null
          cannibal_url_rank: number | null
          created_at: string | null
          diagnostico_detalle: string | null
          diagnostico_texto: string | null
          id: string
          impacto_nivel: string | null
          is_resolved: boolean | null
          keyword_conflicto: string | null
          kw_en_conflicto: string | null
          nivel_impacto_tag: string | null
          protocolo_lista_pasos: Json | null
          protocolo_resolucion: Json | null
          target_url_path: string | null
          target_url_rank: number | null
        }
        Insert: {
          accion_recomendada_label?: string | null
          activo_id: string
          cannibal_url_path?: string | null
          cannibal_url_rank?: number | null
          created_at?: string | null
          diagnostico_detalle?: string | null
          diagnostico_texto?: string | null
          id?: string
          impacto_nivel?: string | null
          is_resolved?: boolean | null
          keyword_conflicto?: string | null
          kw_en_conflicto?: string | null
          nivel_impacto_tag?: string | null
          protocolo_lista_pasos?: Json | null
          protocolo_resolucion?: Json | null
          target_url_path?: string | null
          target_url_rank?: number | null
        }
        Update: {
          accion_recomendada_label?: string | null
          activo_id?: string
          cannibal_url_path?: string | null
          cannibal_url_rank?: number | null
          created_at?: string | null
          diagnostico_detalle?: string | null
          diagnostico_texto?: string | null
          id?: string
          impacto_nivel?: string | null
          is_resolved?: boolean | null
          keyword_conflicto?: string | null
          kw_en_conflicto?: string | null
          nivel_impacto_tag?: string | null
          protocolo_lista_pasos?: Json | null
          protocolo_resolucion?: Json | null
          target_url_path?: string | null
          target_url_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_canibalizacion_activo"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_enlaces_lista: {
        Row: {
          activo_id: string | null
          anchor_text_objetivo: string | null
          created_at: string | null
          id: string
          orden: number | null
          origen_titulo: string | null
          origen_url_path: string | null
          relevancia_tag: string | null
          tipo_enlace: string | null
        }
        Insert: {
          activo_id?: string | null
          anchor_text_objetivo?: string | null
          created_at?: string | null
          id?: string
          orden?: number | null
          origen_titulo?: string | null
          origen_url_path?: string | null
          relevancia_tag?: string | null
          tipo_enlace?: string | null
        }
        Update: {
          activo_id?: string | null
          anchor_text_objetivo?: string | null
          created_at?: string | null
          id?: string
          orden?: number | null
          origen_titulo?: string | null
          origen_url_path?: string | null
          relevancia_tag?: string | null
          tipo_enlace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_enlaces_lista_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_enlaces_resumen: {
        Row: {
          activo_id: string | null
          id: string
          link_juice_status: string | null
          total_backlinks_externos: number | null
          total_enlaces_internos: number | null
          updated_at: string | null
        }
        Insert: {
          activo_id?: string | null
          id?: string
          link_juice_status?: string | null
          total_backlinks_externos?: number | null
          total_enlaces_internos?: number | null
          updated_at?: string | null
        }
        Update: {
          activo_id?: string | null
          id?: string
          link_juice_status?: string | null
          total_backlinks_externos?: number | null
          total_enlaces_internos?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_enlaces_resumen_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_enlaces_v2: {
        Row: {
          activo_id: string | null
          anchor_text_sugerido: string | null
          created_at: string | null
          id: string
          orden: number | null
          origen_titulo: string | null
          origen_url: string | null
          relevancia_label: string | null
        }
        Insert: {
          activo_id?: string | null
          anchor_text_sugerido?: string | null
          created_at?: string | null
          id?: string
          orden?: number | null
          origen_titulo?: string | null
          origen_url?: string | null
          relevancia_label?: string | null
        }
        Update: {
          activo_id?: string | null
          anchor_text_sugerido?: string | null
          created_at?: string | null
          id?: string
          orden?: number | null
          origen_titulo?: string | null
          origen_url?: string | null
          relevancia_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_enlaces_v2_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_onpage_detalles: {
        Row: {
          activo_id: string | null
          ai_problema_detectado: string | null
          ai_texto_original: string | null
          densidad_json: Json | null
          encabezados_json: Json | null
          id: string
        }
        Insert: {
          activo_id?: string | null
          ai_problema_detectado?: string | null
          ai_texto_original?: string | null
          densidad_json?: Json | null
          encabezados_json?: Json | null
          id?: string
        }
        Update: {
          activo_id?: string | null
          ai_problema_detectado?: string | null
          ai_texto_original?: string | null
          densidad_json?: Json | null
          encabezados_json?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_onpage_detalles_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_onpage_detalles_v2: {
        Row: {
          activo_id: string | null
          contenido: string | null
          etiqueta: string | null
          id: string
          status_tag: string | null
          tipo_dato: string | null
          valor_numerico: number | null
        }
        Insert: {
          activo_id?: string | null
          contenido?: string | null
          etiqueta?: string | null
          id?: string
          status_tag?: string | null
          tipo_dato?: string | null
          valor_numerico?: number | null
        }
        Update: {
          activo_id?: string | null
          contenido?: string | null
          etiqueta?: string | null
          id?: string
          status_tag?: string | null
          tipo_dato?: string | null
          valor_numerico?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_onpage_detalles_v2_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_onpage_gap: {
        Row: {
          activo_id: string | null
          diferencial_status: string | null
          diferencial_valor: string | null
          id: string
          metrica_nombre: string | null
          orden: number | null
          valor_competencia: string | null
          valor_marca: string | null
        }
        Insert: {
          activo_id?: string | null
          diferencial_status?: string | null
          diferencial_valor?: string | null
          id?: string
          metrica_nombre?: string | null
          orden?: number | null
          valor_competencia?: string | null
          valor_marca?: string | null
        }
        Update: {
          activo_id?: string | null
          diferencial_status?: string | null
          diferencial_valor?: string | null
          id?: string
          metrica_nombre?: string | null
          orden?: number | null
          valor_competencia?: string | null
          valor_marca?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_onpage_gap_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_onpage_gap_v2: {
        Row: {
          activo_id: string | null
          diferencial_valor: string | null
          id: string
          metrica_nombre: string | null
          status_color: string | null
          valor_competencia: string | null
          valor_marca: string | null
        }
        Insert: {
          activo_id?: string | null
          diferencial_valor?: string | null
          id?: string
          metrica_nombre?: string | null
          status_color?: string | null
          valor_competencia?: string | null
          valor_marca?: string | null
        }
        Update: {
          activo_id?: string | null
          diferencial_valor?: string | null
          id?: string
          metrica_nombre?: string | null
          status_color?: string | null
          valor_competencia?: string | null
          valor_marca?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_onpage_gap_v2_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_onpage_snippet: {
        Row: {
          activo_id: string | null
          alerta_descripcion: string | null
          alerta_status: string | null
          alerta_titulo: string | null
          google_description: string | null
          google_display_url: string | null
          google_favicon_url: string | null
          google_title: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          activo_id?: string | null
          alerta_descripcion?: string | null
          alerta_status?: string | null
          alerta_titulo?: string | null
          google_description?: string | null
          google_display_url?: string | null
          google_favicon_url?: string | null
          google_title?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          activo_id?: string | null
          alerta_descripcion?: string | null
          alerta_status?: string | null
          alerta_titulo?: string | null
          google_description?: string | null
          google_display_url?: string | null
          google_favicon_url?: string | null
          google_title?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_onpage_snippet_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_onpage_v2: {
        Row: {
          activo_id: string | null
          ai_problema_detectado: string | null
          ai_sugerencia_reescritura: string | null
          ai_texto_original: string | null
          alerta_snippet_desc: string | null
          alerta_snippet_titulo: string | null
          google_description: string | null
          google_title: string | null
          id: string
        }
        Insert: {
          activo_id?: string | null
          ai_problema_detectado?: string | null
          ai_sugerencia_reescritura?: string | null
          ai_texto_original?: string | null
          alerta_snippet_desc?: string | null
          alerta_snippet_titulo?: string | null
          google_description?: string | null
          google_title?: string | null
          id?: string
        }
        Update: {
          activo_id?: string | null
          ai_problema_detectado?: string | null
          ai_sugerencia_reescritura?: string | null
          ai_texto_original?: string | null
          alerta_snippet_desc?: string | null
          alerta_snippet_titulo?: string | null
          google_description?: string | null
          google_title?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_onpage_v2_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_plan_categorias: {
        Row: {
          activo_id: string | null
          color_clase: string | null
          icono_slug: string | null
          id: string
          nombre_categoria: string
          orden: number | null
        }
        Insert: {
          activo_id?: string | null
          color_clase?: string | null
          icono_slug?: string | null
          id?: string
          nombre_categoria: string
          orden?: number | null
        }
        Update: {
          activo_id?: string | null
          color_clase?: string | null
          icono_slug?: string | null
          id?: string
          nombre_categoria?: string
          orden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_plan_categorias_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_plan_categorias_v2: {
        Row: {
          activo_id: string | null
          icono_slug: string | null
          id: string
          nombre_categoria: string | null
          orden: number | null
        }
        Insert: {
          activo_id?: string | null
          icono_slug?: string | null
          id?: string
          nombre_categoria?: string | null
          orden?: number | null
        }
        Update: {
          activo_id?: string | null
          icono_slug?: string | null
          id?: string
          nombre_categoria?: string | null
          orden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_plan_categorias_v2_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_plan_tareas: {
        Row: {
          categoria_id: string | null
          descripcion_tarea: string
          esta_completada: boolean | null
          id: string
          orden: number | null
        }
        Insert: {
          categoria_id?: string | null
          descripcion_tarea: string
          esta_completada?: boolean | null
          id?: string
          orden?: number | null
        }
        Update: {
          categoria_id?: string | null
          descripcion_tarea?: string
          esta_completada?: boolean | null
          id?: string
          orden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_plan_tareas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activo_plan_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_plan_tareas_v2: {
        Row: {
          categoria_id: string | null
          descripcion_tarea: string | null
          esta_completada: boolean | null
          id: string
          orden: number | null
        }
        Insert: {
          categoria_id?: string | null
          descripcion_tarea?: string | null
          esta_completada?: boolean | null
          id?: string
          orden?: number | null
        }
        Update: {
          categoria_id?: string | null
          descripcion_tarea?: string | null
          esta_completada?: boolean | null
          id?: string
          orden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_plan_tareas_v2_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activo_plan_categorias_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_ranking_historial_v2: {
        Row: {
          activo_id: string
          fecha: string
          id: string
          posicion: number
        }
        Insert: {
          activo_id: string
          fecha: string
          id?: string
          posicion: number
        }
        Update: {
          activo_id?: string
          fecha?: string
          id?: string
          posicion?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_historial_activo"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_ranking_historico: {
        Row: {
          activo_id: string | null
          fecha: string
          id: string
          keyword_nombre: string | null
          posicion: number
        }
        Insert: {
          activo_id?: string | null
          fecha: string
          id?: string
          keyword_nombre?: string | null
          posicion: number
        }
        Update: {
          activo_id?: string | null
          fecha?: string
          id?: string
          keyword_nombre?: string | null
          posicion?: number
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_ranking_historico_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_rendimiento_stats: {
        Row: {
          activo_id: string | null
          ctr_recomendacion_txt: string | null
          ctr_status_tag: string | null
          ctr_valor: number | null
          id: string
          posicion_actual: number | null
          posicion_objetivo_txt: string | null
          posicion_tendencia_txt: string | null
          trafico_aporte_porcentaje: number | null
          trafico_mensual: number | null
          trafico_status_tag: string | null
          updated_at: string | null
        }
        Insert: {
          activo_id?: string | null
          ctr_recomendacion_txt?: string | null
          ctr_status_tag?: string | null
          ctr_valor?: number | null
          id?: string
          posicion_actual?: number | null
          posicion_objetivo_txt?: string | null
          posicion_tendencia_txt?: string | null
          trafico_aporte_porcentaje?: number | null
          trafico_mensual?: number | null
          trafico_status_tag?: string | null
          updated_at?: string | null
        }
        Update: {
          activo_id?: string | null
          ctr_recomendacion_txt?: string | null
          ctr_status_tag?: string | null
          ctr_valor?: number | null
          id?: string
          posicion_actual?: number | null
          posicion_objetivo_txt?: string | null
          posicion_tendencia_txt?: string | null
          trafico_aporte_porcentaje?: number | null
          trafico_mensual?: number | null
          trafico_status_tag?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activo_rendimiento_stats_activo_id_fkey"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activo_rendimiento_v2: {
        Row: {
          activo_id: string
          ctr_recomendacion: string | null
          ctr_status: string | null
          ctr_valor: number | null
          id: string
          objetivo_trimestral: string | null
          posicion_actual: number | null
          tendencia_posicion: string | null
          trafico_aporte_porcentaje: number | null
          trafico_mensual: number | null
          trafico_status: string | null
          updated_at: string | null
        }
        Insert: {
          activo_id: string
          ctr_recomendacion?: string | null
          ctr_status?: string | null
          ctr_valor?: number | null
          id?: string
          objetivo_trimestral?: string | null
          posicion_actual?: number | null
          tendencia_posicion?: string | null
          trafico_aporte_porcentaje?: number | null
          trafico_mensual?: number | null
          trafico_status?: string | null
          updated_at?: string | null
        }
        Update: {
          activo_id?: string
          ctr_recomendacion?: string | null
          ctr_status?: string | null
          ctr_valor?: number | null
          id?: string
          objetivo_trimestral?: string | null
          posicion_actual?: number | null
          tendencia_posicion?: string | null
          trafico_aporte_porcentaje?: number | null
          trafico_mensual?: number | null
          trafico_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_rendimiento_activo"
            columns: ["activo_id"]
            isOneToOne: false
            referencedRelation: "dashboard_activos_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_activos: {
        Row: {
          ciclo_fin: string | null
          ciclo_inicio: string | null
          ciclo_nombre: string | null
          created_at: string | null
          dias_restantes: number | null
          focus_kw: string | null
          id: string
          oportunidad_text: string | null
          optimization_score: number | null
          orden: number | null
          pais_iso: string | null
          proyecto_id: string | null
          status_tipo: string | null
          titulo_pagina: string
          updated_at: string | null
          url_path: string
        }
        Insert: {
          ciclo_fin?: string | null
          ciclo_inicio?: string | null
          ciclo_nombre?: string | null
          created_at?: string | null
          dias_restantes?: number | null
          focus_kw?: string | null
          id?: string
          oportunidad_text?: string | null
          optimization_score?: number | null
          orden?: number | null
          pais_iso?: string | null
          proyecto_id?: string | null
          status_tipo?: string | null
          titulo_pagina: string
          updated_at?: string | null
          url_path: string
        }
        Update: {
          ciclo_fin?: string | null
          ciclo_inicio?: string | null
          ciclo_nombre?: string | null
          created_at?: string | null
          dias_restantes?: number | null
          focus_kw?: string | null
          id?: string
          oportunidad_text?: string | null
          optimization_score?: number | null
          orden?: number | null
          pais_iso?: string | null
          proyecto_id?: string | null
          status_tipo?: string | null
          titulo_pagina?: string
          updated_at?: string | null
          url_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_activos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_activos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_activos_v2: {
        Row: {
          ciclo_fin: string | null
          ciclo_inicio: string | null
          ciclo_nombre: string | null
          created_at: string | null
          dias_restantes: number | null
          focus_kw: string | null
          id: string
          nombre_asset: string | null
          oportunidad_texto: string | null
          pais_iso: string | null
          proyecto_id: string
          score_optimizacion: number | null
          status_tag: string | null
          url_path: string
        }
        Insert: {
          ciclo_fin?: string | null
          ciclo_inicio?: string | null
          ciclo_nombre?: string | null
          created_at?: string | null
          dias_restantes?: number | null
          focus_kw?: string | null
          id?: string
          nombre_asset?: string | null
          oportunidad_texto?: string | null
          pais_iso?: string | null
          proyecto_id: string
          score_optimizacion?: number | null
          status_tag?: string | null
          url_path: string
        }
        Update: {
          ciclo_fin?: string | null
          ciclo_inicio?: string | null
          ciclo_nombre?: string | null
          created_at?: string | null
          dias_restantes?: number | null
          focus_kw?: string | null
          id?: string
          nombre_asset?: string | null
          oportunidad_texto?: string | null
          pais_iso?: string | null
          proyecto_id?: string
          score_optimizacion?: number | null
          status_tag?: string | null
          url_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_activos_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activos_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_arquitectura_nodos: {
        Row: {
          created_at: string | null
          id: string
          nivel: number | null
          nombre_nodo: string
          orden: number | null
          parent_id: string | null
          proyecto_id: string
          tipo_nodo: string | null
          url_relacionada: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nivel?: number | null
          nombre_nodo: string
          orden?: number | null
          parent_id?: string | null
          proyecto_id: string
          tipo_nodo?: string | null
          url_relacionada?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nivel?: number | null
          nombre_nodo?: string
          orden?: number | null
          parent_id?: string | null
          proyecto_id?: string
          tipo_nodo?: string | null
          url_relacionada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_nodos_parent"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "dashboard_arquitectura_nodos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_nodos_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_nodos_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_faq_items: {
        Row: {
          created_at: string | null
          detalles_bullets: string[] | null
          id: string
          idea_principal_box: string | null
          is_active: boolean | null
          orden: number | null
          pregunta: string
          proyecto_id: string | null
          punto_clave_footer: string | null
        }
        Insert: {
          created_at?: string | null
          detalles_bullets?: string[] | null
          id?: string
          idea_principal_box?: string | null
          is_active?: boolean | null
          orden?: number | null
          pregunta: string
          proyecto_id?: string | null
          punto_clave_footer?: string | null
        }
        Update: {
          created_at?: string | null
          detalles_bullets?: string[] | null
          id?: string
          idea_principal_box?: string | null
          is_active?: boolean | null
          orden?: number | null
          pregunta?: string
          proyecto_id?: string | null
          punto_clave_footer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_faq_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_faq_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_flujo_enlazado: {
        Row: {
          anchor_text_sugerido: string | null
          color_tema: string | null
          created_at: string | null
          id: string
          nivel: number | null
          nombre_nodo: string
          orden: number | null
          parent_id: string | null
          proyecto_id: string
          url_destino: string | null
        }
        Insert: {
          anchor_text_sugerido?: string | null
          color_tema?: string | null
          created_at?: string | null
          id?: string
          nivel?: number | null
          nombre_nodo: string
          orden?: number | null
          parent_id?: string | null
          proyecto_id: string
          url_destino?: string | null
        }
        Update: {
          anchor_text_sugerido?: string | null
          color_tema?: string | null
          created_at?: string | null
          id?: string
          nivel?: number | null
          nombre_nodo?: string
          orden?: number | null
          parent_id?: string | null
          proyecto_id?: string
          url_destino?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_flujo_parent"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "dashboard_flujo_enlazado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_flujo_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_flujo_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_keyword_cores_detalles: {
        Row: {
          color_tema: string | null
          contexto_tags: string[] | null
          created_at: string | null
          descripcion_estrategica: string | null
          id: string
          indice_estabilidad_porcentaje: number | null
          indice_estabilidad_texto: string | null
          intent_tipo: string | null
          kd_dificultad: number | null
          keyword_name: string
          mercado_objetivo_iso: string | null
          mercado_objetivo_label: string | null
          orden: number | null
          proyecto_id: string
          rank_actual: number | null
          rank_objetivo: number | null
          serp_url: string | null
          trafico_global_share: string | null
          volumen_busqueda: number | null
        }
        Insert: {
          color_tema?: string | null
          contexto_tags?: string[] | null
          created_at?: string | null
          descripcion_estrategica?: string | null
          id?: string
          indice_estabilidad_porcentaje?: number | null
          indice_estabilidad_texto?: string | null
          intent_tipo?: string | null
          kd_dificultad?: number | null
          keyword_name: string
          mercado_objetivo_iso?: string | null
          mercado_objetivo_label?: string | null
          orden?: number | null
          proyecto_id: string
          rank_actual?: number | null
          rank_objetivo?: number | null
          serp_url?: string | null
          trafico_global_share?: string | null
          volumen_busqueda?: number | null
        }
        Update: {
          color_tema?: string | null
          contexto_tags?: string[] | null
          created_at?: string | null
          descripcion_estrategica?: string | null
          id?: string
          indice_estabilidad_porcentaje?: number | null
          indice_estabilidad_texto?: string | null
          intent_tipo?: string | null
          kd_dificultad?: number | null
          keyword_name?: string
          mercado_objetivo_iso?: string | null
          mercado_objetivo_label?: string | null
          orden?: number | null
          proyecto_id?: string
          rank_actual?: number | null
          rank_objetivo?: number | null
          serp_url?: string | null
          trafico_global_share?: string | null
          volumen_busqueda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_kw_cores_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kw_cores_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_metas_numericas: {
        Row: {
          created_at: string | null
          id: string
          metrica_nombre: string
          orden: number | null
          proyecto_id: string
          valor_descripcion: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metrica_nombre: string
          orden?: number | null
          proyecto_id: string
          valor_descripcion?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metrica_nombre?: string
          orden?: number | null
          proyecto_id?: string
          valor_descripcion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_metas_numericas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_metas_numericas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_objetivos_items: {
        Row: {
          color_clase: string | null
          created_at: string | null
          descripcion_texto: string | null
          etiqueta_categoria: string | null
          id: string
          kpi_subtexto: string | null
          kpi_titulo_label: string | null
          kpi_valor_destacado: string | null
          metodo_medicion_texto: string | null
          nota_informativa: string | null
          orden: number | null
          proyecto_id: string | null
          titulo_cuadro: string | null
          valor_actual: number | null
          valor_target: number | null
        }
        Insert: {
          color_clase?: string | null
          created_at?: string | null
          descripcion_texto?: string | null
          etiqueta_categoria?: string | null
          id?: string
          kpi_subtexto?: string | null
          kpi_titulo_label?: string | null
          kpi_valor_destacado?: string | null
          metodo_medicion_texto?: string | null
          nota_informativa?: string | null
          orden?: number | null
          proyecto_id?: string | null
          titulo_cuadro?: string | null
          valor_actual?: number | null
          valor_target?: number | null
        }
        Update: {
          color_clase?: string | null
          created_at?: string | null
          descripcion_texto?: string | null
          etiqueta_categoria?: string | null
          id?: string
          kpi_subtexto?: string | null
          kpi_titulo_label?: string | null
          kpi_valor_destacado?: string | null
          metodo_medicion_texto?: string | null
          nota_informativa?: string | null
          orden?: number | null
          proyecto_id?: string | null
          titulo_cuadro?: string | null
          valor_actual?: number | null
          valor_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_objetivos_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_objetivos_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_politicas_operativas_v2: {
        Row: {
          color_class: string | null
          contenido_detalle: string | null
          created_at: string | null
          icono_slug: string | null
          id: string
          orden: number | null
          politica_id: string
          proyecto_id: string
          titulo_politica: string
          updated_at: string | null
        }
        Insert: {
          color_class?: string | null
          contenido_detalle?: string | null
          created_at?: string | null
          icono_slug?: string | null
          id?: string
          orden?: number | null
          politica_id: string
          proyecto_id: string
          titulo_politica: string
          updated_at?: string | null
        }
        Update: {
          color_class?: string | null
          contenido_detalle?: string | null
          created_at?: string | null
          icono_slug?: string | null
          id?: string
          orden?: number | null
          politica_id?: string
          proyecto_id?: string
          titulo_politica?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_politicas_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_politicas_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_proyecto_objetivos: {
        Row: {
          color_clase: string | null
          created_at: string | null
          icon_slug: string | null
          id: string
          kpi_label: string | null
          kpi_valor_destacado: string | null
          metodo_detalle: string | null
          metodo_titulo: string | null
          nota_detalle: string | null
          nota_titulo: string | null
          orden: number | null
          proyecto_id: string | null
          tag_categoria: string | null
          texto_descripcion: string | null
          titulo_estrategia: string | null
        }
        Insert: {
          color_clase?: string | null
          created_at?: string | null
          icon_slug?: string | null
          id?: string
          kpi_label?: string | null
          kpi_valor_destacado?: string | null
          metodo_detalle?: string | null
          metodo_titulo?: string | null
          nota_detalle?: string | null
          nota_titulo?: string | null
          orden?: number | null
          proyecto_id?: string | null
          tag_categoria?: string | null
          texto_descripcion?: string | null
          titulo_estrategia?: string | null
        }
        Update: {
          color_clase?: string | null
          created_at?: string | null
          icon_slug?: string | null
          id?: string
          kpi_label?: string | null
          kpi_valor_destacado?: string | null
          metodo_detalle?: string | null
          metodo_titulo?: string | null
          nota_detalle?: string | null
          nota_titulo?: string | null
          orden?: number | null
          proyecto_id?: string | null
          tag_categoria?: string | null
          texto_descripcion?: string | null
          titulo_estrategia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_proyecto_objetivos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_proyecto_objetivos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_quick_wins: {
        Row: {
          created_at: string | null
          id: string
          kd_dificultad: number | null
          keyword_principal: string | null
          oportunidad_descripcion: string | null
          orden: number | null
          pais_codigo_iso: string | null
          pais_nombre: string | null
          posicion_actual: number | null
          posicion_meta: number | null
          potencial_visitas: string | null
          proyecto_id: string | null
          serp_url: string | null
          status_tag: string | null
          variaciones: string[] | null
          volumen_busqueda: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kd_dificultad?: number | null
          keyword_principal?: string | null
          oportunidad_descripcion?: string | null
          orden?: number | null
          pais_codigo_iso?: string | null
          pais_nombre?: string | null
          posicion_actual?: number | null
          posicion_meta?: number | null
          potencial_visitas?: string | null
          proyecto_id?: string | null
          serp_url?: string | null
          status_tag?: string | null
          variaciones?: string[] | null
          volumen_busqueda?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kd_dificultad?: number | null
          keyword_principal?: string | null
          oportunidad_descripcion?: string | null
          orden?: number | null
          pais_codigo_iso?: string | null
          pais_nombre?: string | null
          posicion_actual?: number | null
          posicion_meta?: number | null
          potencial_visitas?: string | null
          proyecto_id?: string | null
          serp_url?: string | null
          status_tag?: string | null
          variaciones?: string[] | null
          volumen_busqueda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_quick_wins_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_quick_wins_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_resumen_metas: {
        Row: {
          created_at: string | null
          id: string
          metrica_nombre: string | null
          orden: number | null
          proyecto_id: string | null
          valor_descripcion: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metrica_nombre?: string | null
          orden?: number | null
          proyecto_id?: string | null
          valor_descripcion?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metrica_nombre?: string | null
          orden?: number | null
          proyecto_id?: string | null
          valor_descripcion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_resumen_metas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_resumen_metas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_seccion_objetivos_v2: {
        Row: {
          bloque_descripcion_texto: string | null
          bloque_kpi_label: string | null
          bloque_kpi_valor: string | null
          bloque_medicion_label: string | null
          bloque_medicion_texto: string | null
          bloque_nota_contenido: string | null
          bloque_nota_titulo: string | null
          categoria_label: string | null
          color_tema: string | null
          created_at: string | null
          icon_name: string | null
          id: string
          orden: number | null
          proyecto_id: string
          titulo_estrategia: string | null
          updated_at: string | null
        }
        Insert: {
          bloque_descripcion_texto?: string | null
          bloque_kpi_label?: string | null
          bloque_kpi_valor?: string | null
          bloque_medicion_label?: string | null
          bloque_medicion_texto?: string | null
          bloque_nota_contenido?: string | null
          bloque_nota_titulo?: string | null
          categoria_label?: string | null
          color_tema?: string | null
          created_at?: string | null
          icon_name?: string | null
          id?: string
          orden?: number | null
          proyecto_id: string
          titulo_estrategia?: string | null
          updated_at?: string | null
        }
        Update: {
          bloque_descripcion_texto?: string | null
          bloque_kpi_label?: string | null
          bloque_kpi_valor?: string | null
          bloque_medicion_label?: string | null
          bloque_medicion_texto?: string | null
          bloque_nota_contenido?: string | null
          bloque_nota_titulo?: string | null
          categoria_label?: string | null
          color_tema?: string | null
          created_at?: string | null
          icon_name?: string | null
          id?: string
          orden?: number | null
          proyecto_id?: string
          titulo_estrategia?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_objetivos_v2_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_objetivos_v2_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_secciones_info: {
        Row: {
          ayuda_descripcion: string | null
          ayuda_titulo: string | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          proyecto_id: string
          seccion_slug: string | null
        }
        Insert: {
          ayuda_descripcion?: string | null
          ayuda_titulo?: string | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          proyecto_id: string
          seccion_slug?: string | null
        }
        Update: {
          ayuda_descripcion?: string | null
          ayuda_titulo?: string | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          proyecto_id?: string
          seccion_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_info_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_info_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      dashboard_trimestre_progreso: {
        Row: {
          created_at: string | null
          dias_restantes: number
          dias_totales: number
          dias_transcurridos: number
          porcentaje_progreso: number
          proyecto_id: string
          trimestre_label: string
        }
        Insert: {
          created_at?: string | null
          dias_restantes: number
          dias_totales: number
          dias_transcurridos: number
          porcentaje_progreso: number
          proyecto_id: string
          trimestre_label: string
        }
        Update: {
          created_at?: string | null
          dias_restantes?: number
          dias_totales?: number
          dias_transcurridos?: number
          porcentaje_progreso?: number
          proyecto_id?: string
          trimestre_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_trimestre_progreso_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: true
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_trimestre_progreso_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: true
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      design_ux_items: {
        Row: {
          component_name: string
          created_at: string | null
          end_time: string | null
          figma_url: string | null
          hours_bigscreen: number | null
          hours_desktop: number | null
          hours_mobile: number | null
          hours_tablet: number | null
          id: string
          report_id: string
          start_time: string | null
          total_item_hours: number | null
          updated_at: string | null
        }
        Insert: {
          component_name: string
          created_at?: string | null
          end_time?: string | null
          figma_url?: string | null
          hours_bigscreen?: number | null
          hours_desktop?: number | null
          hours_mobile?: number | null
          hours_tablet?: number | null
          id?: string
          report_id: string
          start_time?: string | null
          total_item_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          component_name?: string
          created_at?: string | null
          end_time?: string | null
          figma_url?: string | null
          hours_bigscreen?: number | null
          hours_desktop?: number | null
          hours_mobile?: number | null
          hours_tablet?: number | null
          id?: string
          report_id?: string
          start_time?: string | null
          total_item_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_design_ux_items_report"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "design_ux_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      design_ux_reports: {
        Row: {
          created_at: string | null
          designer_id: string | null
          figma_link: string | null
          id: string
          notes: string | null
          proyecto_id: string
          report_month: string
          status: string | null
          total_month_hours: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          designer_id?: string | null
          figma_link?: string | null
          id?: string
          notes?: string | null
          proyecto_id: string
          report_month: string
          status?: string | null
          total_month_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          designer_id?: string | null
          figma_link?: string | null
          id?: string
          notes?: string | null
          proyecto_id?: string
          report_month?: string
          status?: string | null
          total_month_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_design_ux_designer"
            columns: ["designer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_design_ux_project"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_design_ux_project"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      design_ux_time_logs: {
        Row: {
          created_at: string | null
          elapsed_hours: number
          end_time: string
          id: string
          log_date: string
          report_id: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          elapsed_hours: number
          end_time: string
          id?: string
          log_date: string
          report_id: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          elapsed_hours?: number
          end_time?: string
          id?: string
          log_date?: string
          report_id?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_ux_time_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "design_ux_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_base_conocimiento: {
        Row: {
          activo: boolean | null
          auto_actualizar: boolean | null
          categoria: string | null
          created_at: string | null
          descripcion: string | null
          drive_file_id: string
          frecuencia_actualizacion: string | null
          id: string
          idioma: string
          marca: string
          prioridad: number | null
          project_id: string | null
          tags: string[] | null
          tipo_documento: string
          titulo: string
          ultima_ingesta: string | null
          ultima_modificacion_drive: string | null
          updated_at: string | null
          version_actual: number | null
        }
        Insert: {
          activo?: boolean | null
          auto_actualizar?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descripcion?: string | null
          drive_file_id: string
          frecuencia_actualizacion?: string | null
          id?: string
          idioma: string
          marca: string
          prioridad?: number | null
          project_id?: string | null
          tags?: string[] | null
          tipo_documento: string
          titulo: string
          ultima_ingesta?: string | null
          ultima_modificacion_drive?: string | null
          updated_at?: string | null
          version_actual?: number | null
        }
        Update: {
          activo?: boolean | null
          auto_actualizar?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descripcion?: string | null
          drive_file_id?: string
          frecuencia_actualizacion?: string | null
          id?: string
          idioma?: string
          marca?: string
          prioridad?: number | null
          project_id?: string | null
          tags?: string[] | null
          tipo_documento?: string
          titulo?: string
          ultima_ingesta?: string | null
          ultima_modificacion_drive?: string | null
          updated_at?: string | null
          version_actual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_documentos_conocimiento_project_id"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string
          created_at: string
          embedding: string
          id: string
          idioma: string
          marca: string
          metadata: Json
          project_id: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string
          embedding: string
          id?: string
          idioma: string
          marca: string
          metadata?: Json
          project_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          idioma?: string
          marca?: string
          metadata?: Json
          project_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      documents_backup: {
        Row: {
          content: string | null
          embedding: string | null
          id: string | null
          idioma: string | null
          marca: string | null
          metadata: Json | null
          project_id: string | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id?: string | null
          idioma?: string | null
          marca?: string | null
          metadata?: Json | null
          project_id?: string | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: string | null
          idioma?: string | null
          marca?: string | null
          metadata?: Json | null
          project_id?: string | null
        }
        Relationships: []
      }
      educa_leads_intelligence: {
        Row: {
          ano_graduacion: string | null
          apellido: string | null
          colegio_preparatoria: string | null
          created_at: string | null
          email: string
          historial_navegacion: string | null
          navegador_info: string | null
          nivel_ingles: string | null
          nombre: string | null
          resumen_ia: string | null
          rol: string | null
          status: string | null
          telefono: string | null
          updated_at: string | null
          url_fuente: string | null
          uuid: string | null
        }
        Insert: {
          ano_graduacion?: string | null
          apellido?: string | null
          colegio_preparatoria?: string | null
          created_at?: string | null
          email: string
          historial_navegacion?: string | null
          navegador_info?: string | null
          nivel_ingles?: string | null
          nombre?: string | null
          resumen_ia?: string | null
          rol?: string | null
          status?: string | null
          telefono?: string | null
          updated_at?: string | null
          url_fuente?: string | null
          uuid?: string | null
        }
        Update: {
          ano_graduacion?: string | null
          apellido?: string | null
          colegio_preparatoria?: string | null
          created_at?: string | null
          email?: string
          historial_navegacion?: string | null
          navegador_info?: string | null
          nivel_ingles?: string | null
          nombre?: string | null
          resumen_ia?: string | null
          rol?: string | null
          status?: string | null
          telefono?: string | null
          updated_at?: string | null
          url_fuente?: string | null
          uuid?: string | null
        }
        Relationships: []
      }
      enrichment_pipeline_runs: {
        Row: {
          completed_at: string | null
          content_item_id: string
          created_at: string | null
          current_stage: string | null
          duration_ms: number | null
          elements_added: Json | null
          engine_version: string | null
          error_message: string | null
          id: string
          proyecto_id: string
          status: string
          triggered_at: string | null
          word_count_after: number | null
          word_count_before: number | null
        }
        Insert: {
          completed_at?: string | null
          content_item_id: string
          created_at?: string | null
          current_stage?: string | null
          duration_ms?: number | null
          elements_added?: Json | null
          engine_version?: string | null
          error_message?: string | null
          id?: string
          proyecto_id: string
          status?: string
          triggered_at?: string | null
          word_count_after?: number | null
          word_count_before?: number | null
        }
        Update: {
          completed_at?: string | null
          content_item_id?: string
          created_at?: string | null
          current_stage?: string | null
          duration_ms?: number | null
          elements_added?: Json | null
          engine_version?: string | null
          error_message?: string | null
          id?: string
          proyecto_id?: string
          status?: string
          triggered_at?: string | null
          word_count_after?: number | null
          word_count_before?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_pipeline_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_pipeline_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_pipeline_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      external_brands: {
        Row: {
          brand_name: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          brand_name: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          brand_name?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_brands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_invoice_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: number
          invoice_id: string
          payload: Json
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: number
          invoice_id: string
          payload?: Json
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: number
          invoice_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_invoice_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "freelancer_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_invoice_settings: {
        Row: {
          admin_user_id: string | null
          created_at: string
          currency: string
          is_active: boolean
          monthly_amount: number
          notes: string | null
          notification_email: string | null
          notification_slack_id: string | null
          payment_account: Json
          payment_method: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          currency?: string
          is_active?: boolean
          monthly_amount?: number
          notes?: string | null
          notification_email?: string | null
          notification_slack_id?: string | null
          payment_account?: Json
          payment_method?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          currency?: string
          is_active?: boolean
          monthly_amount?: number
          notes?: string | null
          notification_email?: string | null
          notification_slack_id?: string | null
          payment_account?: Json
          payment_method?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_invoice_settings_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_invoice_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_invoices: {
        Row: {
          admin_approved_at: string | null
          admin_notes: string | null
          admin_token: string
          admin_user_id: string | null
          bonus_amount: number
          created_at: string
          created_by: string | null
          currency: string
          deduction_amount: number
          document_url: string | null
          escalation_level: number
          follow_up_count: number
          google_doc_id: string | null
          id: string
          last_admin_notified_at: string | null
          last_followup_at: string | null
          last_writer_notified_at: string | null
          metadata: Json
          monthly_amount: number
          next_followup_at: string | null
          paid_at: string | null
          payment_reference: string | null
          period_end: string
          period_month: number
          period_start: string
          period_year: number
          rate_type: string
          sent_at: string | null
          status: Database["public"]["Enums"]["freelancer_invoice_status"]
          total_amount: number | null
          updated_at: string
          user_id: string
          writer_acknowledged_at: string | null
          writer_rejected_at: string | null
          writer_rejection_reason: string | null
          writer_response: string | null
          writer_token: string
        }
        Insert: {
          admin_approved_at?: string | null
          admin_notes?: string | null
          admin_token?: string
          admin_user_id?: string | null
          bonus_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deduction_amount?: number
          document_url?: string | null
          escalation_level?: number
          follow_up_count?: number
          google_doc_id?: string | null
          id?: string
          last_admin_notified_at?: string | null
          last_followup_at?: string | null
          last_writer_notified_at?: string | null
          metadata?: Json
          monthly_amount: number
          next_followup_at?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          period_end: string
          period_month: number
          period_start: string
          period_year: number
          rate_type?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["freelancer_invoice_status"]
          total_amount?: number | null
          updated_at?: string
          user_id: string
          writer_acknowledged_at?: string | null
          writer_rejected_at?: string | null
          writer_rejection_reason?: string | null
          writer_response?: string | null
          writer_token?: string
        }
        Update: {
          admin_approved_at?: string | null
          admin_notes?: string | null
          admin_token?: string
          admin_user_id?: string | null
          bonus_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deduction_amount?: number
          document_url?: string | null
          escalation_level?: number
          follow_up_count?: number
          google_doc_id?: string | null
          id?: string
          last_admin_notified_at?: string | null
          last_followup_at?: string | null
          last_writer_notified_at?: string | null
          metadata?: Json
          monthly_amount?: number
          next_followup_at?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          period_end?: string
          period_month?: number
          period_start?: string
          period_year?: number
          rate_type?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["freelancer_invoice_status"]
          total_amount?: number | null
          updated_at?: string
          user_id?: string
          writer_acknowledged_at?: string | null
          writer_rejected_at?: string | null
          writer_rejection_reason?: string | null
          writer_response?: string | null
          writer_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_invoices_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_payable_items: {
        Row: {
          content_item_id: string | null
          created_at: string | null
          currency: string | null
          design_report_id: string | null
          hourly_rate: number | null
          hours_count: number | null
          id: string
          production_date: string | null
          rate_per_word: number
          service_type: string | null
          status: string | null
          total_amount: number
          user_id: string
          word_count: number
        }
        Insert: {
          content_item_id?: string | null
          created_at?: string | null
          currency?: string | null
          design_report_id?: string | null
          hourly_rate?: number | null
          hours_count?: number | null
          id?: string
          production_date?: string | null
          rate_per_word?: number
          service_type?: string | null
          status?: string | null
          total_amount?: number
          user_id: string
          word_count?: number
        }
        Update: {
          content_item_id?: string | null
          created_at?: string | null
          currency?: string | null
          design_report_id?: string | null
          hourly_rate?: number | null
          hours_count?: number | null
          id?: string
          production_date?: string | null
          rate_per_word?: number
          service_type?: string | null
          status?: string | null
          total_amount?: number
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_payable_items_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: true
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_payable_items_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: true
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_payable_items_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: true
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_payable_items_design_report_id_fkey"
            columns: ["design_report_id"]
            isOneToOne: true
            referencedRelation: "design_ux_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freelancer_payable_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_payments: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: string | null
          total_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string | null
          total_amount: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string | null
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_rates: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          rate_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          rate_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          rate_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_rates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ils_pipeline_runs: {
        Row: {
          brand_name: string | null
          candidates_count: number | null
          completed_at: string | null
          content_item_id: string
          created_at: string | null
          current_stage: string | null
          decisions_count: number | null
          duration_ms: number | null
          editorial_summary: string | null
          engine_version: string | null
          error_message: string | null
          final_published_url: string | null
          id: string
          metadata: Json | null
          proyecto_id: string
          retry_count: number | null
          status: string
          triggered_at: string | null
          universe_size: number | null
          updated_at: string | null
        }
        Insert: {
          brand_name?: string | null
          candidates_count?: number | null
          completed_at?: string | null
          content_item_id: string
          created_at?: string | null
          current_stage?: string | null
          decisions_count?: number | null
          duration_ms?: number | null
          editorial_summary?: string | null
          engine_version?: string | null
          error_message?: string | null
          final_published_url?: string | null
          id?: string
          metadata?: Json | null
          proyecto_id: string
          retry_count?: number | null
          status?: string
          triggered_at?: string | null
          universe_size?: number | null
          updated_at?: string | null
        }
        Update: {
          brand_name?: string | null
          candidates_count?: number | null
          completed_at?: string | null
          content_item_id?: string
          created_at?: string | null
          current_stage?: string | null
          decisions_count?: number | null
          duration_ms?: number | null
          editorial_summary?: string | null
          engine_version?: string | null
          error_message?: string | null
          final_published_url?: string | null
          id?: string
          metadata?: Json | null
          proyecto_id?: string
          retry_count?: number | null
          status?: string
          triggered_at?: string | null
          universe_size?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ils_pipeline_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ils_pipeline_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ils_pipeline_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          integration_name: string
          is_active: boolean
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          integration_name: string
          is_active?: boolean
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          integration_name?: string
          is_active?: boolean
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      internal_link_candidates: {
        Row: {
          anchor_suggestion: string | null
          anchor_variants: Json
          client_id: string | null
          confidence_score: number | null
          created_at: string
          id: string
          journey_logic: string | null
          metadata: Json
          placement_suggestion: string | null
          priority_score: number | null
          proyecto_id: string
          relationship_type: string
          source_cluster_id: string | null
          source_cluster_key: string | null
          source_content_id: string
          source_journey_stage: string | null
          status: string
          target_cluster_id: string | null
          target_cluster_key: string | null
          target_content_id: string
          target_journey_stage: string | null
          updated_at: string
        }
        Insert: {
          anchor_suggestion?: string | null
          anchor_variants?: Json
          client_id?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          journey_logic?: string | null
          metadata?: Json
          placement_suggestion?: string | null
          priority_score?: number | null
          proyecto_id: string
          relationship_type: string
          source_cluster_id?: string | null
          source_cluster_key?: string | null
          source_content_id: string
          source_journey_stage?: string | null
          status?: string
          target_cluster_id?: string | null
          target_cluster_key?: string | null
          target_content_id: string
          target_journey_stage?: string | null
          updated_at?: string
        }
        Update: {
          anchor_suggestion?: string | null
          anchor_variants?: Json
          client_id?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          journey_logic?: string | null
          metadata?: Json
          placement_suggestion?: string | null
          priority_score?: number | null
          proyecto_id?: string
          relationship_type?: string
          source_cluster_id?: string | null
          source_cluster_key?: string | null
          source_content_id?: string
          source_journey_stage?: string | null
          status?: string
          target_cluster_id?: string | null
          target_cluster_key?: string | null
          target_content_id?: string
          target_journey_stage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_link_candidates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "internal_link_candidates_source_cluster_id_fkey"
            columns: ["source_cluster_id"]
            isOneToOne: false
            referencedRelation: "content_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_source_content_id_fkey"
            columns: ["source_content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_source_content_id_fkey"
            columns: ["source_content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_source_content_id_fkey"
            columns: ["source_content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_target_cluster_id_fkey"
            columns: ["target_cluster_id"]
            isOneToOne: false
            referencedRelation: "content_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_target_content_id_fkey"
            columns: ["target_content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_target_content_id_fkey"
            columns: ["target_content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_candidates_target_content_id_fkey"
            columns: ["target_content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_link_decisions: {
        Row: {
          candidate_id: string | null
          client_id: string | null
          created_at: string
          decided_by: string
          decision_status: string
          id: string
          inserted_at: string | null
          metadata: Json
          proyecto_id: string
          relationship_type: string
          selected_anchor_text: string
          selected_placement: string | null
          selection_reason: string | null
          source_content_id: string
          target_content_id: string
          updated_at: string
        }
        Insert: {
          candidate_id?: string | null
          client_id?: string | null
          created_at?: string
          decided_by?: string
          decision_status?: string
          id?: string
          inserted_at?: string | null
          metadata?: Json
          proyecto_id: string
          relationship_type: string
          selected_anchor_text: string
          selected_placement?: string | null
          selection_reason?: string | null
          source_content_id: string
          target_content_id: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string | null
          client_id?: string | null
          created_at?: string
          decided_by?: string
          decision_status?: string
          id?: string
          inserted_at?: string | null
          metadata?: Json
          proyecto_id?: string
          relationship_type?: string
          selected_anchor_text?: string
          selected_placement?: string | null
          selection_reason?: string | null
          source_content_id?: string
          target_content_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_link_decisions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "internal_link_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_decisions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_decisions_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_decisions_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "internal_link_decisions_source_content_id_fkey"
            columns: ["source_content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_decisions_source_content_id_fkey"
            columns: ["source_content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_decisions_source_content_id_fkey"
            columns: ["source_content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_decisions_target_content_id_fkey"
            columns: ["target_content_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_decisions_target_content_id_fkey"
            columns: ["target_content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_link_decisions_target_content_id_fkey"
            columns: ["target_content_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_research: {
        Row: {
          archived: boolean | null
          client_id: string | null
          cluster_contenido: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          difficulty: number | null
          external_id: string | null
          id: string
          imported_at: string | null
          justification: string | null
          keyword: string
          parent_keyword: string | null
          prioridad: string | null
          proposed_title: string | null
          proyecto_id: string | null
          search_intent: string | null
          secondary_keywords: Json | null
          source: string | null
          status: Database["public"]["Enums"]["keyword_status"] | null
          topics_id: string | null
          traffic_potential: number | null
          updated_at: string | null
          volume: number | null
        }
        Insert: {
          archived?: boolean | null
          client_id?: string | null
          cluster_contenido?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: number | null
          external_id?: string | null
          id?: string
          imported_at?: string | null
          justification?: string | null
          keyword: string
          parent_keyword?: string | null
          prioridad?: string | null
          proposed_title?: string | null
          proyecto_id?: string | null
          search_intent?: string | null
          secondary_keywords?: Json | null
          source?: string | null
          status?: Database["public"]["Enums"]["keyword_status"] | null
          topics_id?: string | null
          traffic_potential?: number | null
          updated_at?: string | null
          volume?: number | null
        }
        Update: {
          archived?: boolean | null
          client_id?: string | null
          cluster_contenido?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: number | null
          external_id?: string | null
          id?: string
          imported_at?: string | null
          justification?: string | null
          keyword?: string
          parent_keyword?: string | null
          prioridad?: string | null
          proposed_title?: string | null
          proyecto_id?: string | null
          search_intent?: string | null
          secondary_keywords?: Json | null
          source?: string | null
          status?: Database["public"]["Enums"]["keyword_status"] | null
          topics_id?: string | null
          traffic_potential?: number | null
          updated_at?: string | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keyword_research_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_research_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_research_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_research_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "keyword_research_topics_id_fkey"
            columns: ["topics_id"]
            isOneToOne: false
            referencedRelation: "topic_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_research_approved: {
        Row: {
          approved_at: string | null
          archived: boolean | null
          client_id: string | null
          cluster_contenido: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          difficulty: number | null
          external_id: string | null
          id: string
          imported_at: string | null
          justification: string | null
          keyword: string
          parent_keyword: string | null
          prioridad: string | null
          proposed_title: string | null
          proyecto_id: string | null
          search_intent: string | null
          secondary_keywords: Json | null
          source: string | null
          topics_id: string | null
          traffic_potential: number | null
          updated_at: string | null
          volume: number | null
        }
        Insert: {
          approved_at?: string | null
          archived?: boolean | null
          client_id?: string | null
          cluster_contenido?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: number | null
          external_id?: string | null
          id: string
          imported_at?: string | null
          justification?: string | null
          keyword: string
          parent_keyword?: string | null
          prioridad?: string | null
          proposed_title?: string | null
          proyecto_id?: string | null
          search_intent?: string | null
          secondary_keywords?: Json | null
          source?: string | null
          topics_id?: string | null
          traffic_potential?: number | null
          updated_at?: string | null
          volume?: number | null
        }
        Update: {
          approved_at?: string | null
          archived?: boolean | null
          client_id?: string | null
          cluster_contenido?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: number | null
          external_id?: string | null
          id?: string
          imported_at?: string | null
          justification?: string | null
          keyword?: string
          parent_keyword?: string | null
          prioridad?: string | null
          proposed_title?: string | null
          proyecto_id?: string | null
          search_intent?: string | null
          secondary_keywords?: Json | null
          source?: string | null
          topics_id?: string | null
          traffic_potential?: number | null
          updated_at?: string | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keyword_research_approved_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_research_approved_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_research_approved_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_research_approved_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "keyword_research_approved_topics_id_fkey"
            columns: ["topics_id"]
            isOneToOne: false
            referencedRelation: "topic_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_reserve_daily_snapshots: {
        Row: {
          created_at: string
          deficit: boolean
          evaluated_at: string
          id: string
          keyword_count: number
          proyecto_id: string
        }
        Insert: {
          created_at?: string
          deficit: boolean
          evaluated_at?: string
          id?: string
          keyword_count: number
          proyecto_id: string
        }
        Update: {
          created_at?: string
          deficit?: boolean
          evaluated_at?: string
          id?: string
          keyword_count?: number
          proyecto_id?: string
        }
        Relationships: []
      }
      keyword_reserve_monitored_projects: {
        Row: {
          created_at: string
          enabled: boolean
          escalation_enabled: boolean
          min_keywords: number
          proyecto_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          escalation_enabled?: boolean
          min_keywords?: number
          proyecto_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          escalation_enabled?: boolean
          min_keywords?: number
          proyecto_id?: string
        }
        Relationships: []
      }
      keyword_reserve_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      keywords_performance: {
        Row: {
          cliente_id: string
          created_at: string | null
          current_organic_traffic: number
          current_position: number
          fecha_registro: string
          id: string
          kd: number
          keyword: string
          organic_traffic_change: number
          periodo_desde: string
          periodo_hasta: string
          previous_organic_traffic: number
          previous_position: number
          proyecto_id: string
          updated_at: string | null
          volume: number
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          current_organic_traffic?: number
          current_position?: number
          fecha_registro?: string
          id?: string
          kd?: number
          keyword: string
          organic_traffic_change?: number
          periodo_desde: string
          periodo_hasta: string
          previous_organic_traffic?: number
          previous_position?: number
          proyecto_id: string
          updated_at?: string | null
          volume?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          current_organic_traffic?: number
          current_position?: number
          fecha_registro?: string
          id?: string
          kd?: number
          keyword?: string
          organic_traffic_change?: number
          periodo_desde?: string
          periodo_hasta?: string
          previous_organic_traffic?: number
          previous_position?: number
          proyecto_id?: string
          updated_at?: string | null
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "keywords_performance_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keywords_performance_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keywords_performance_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      languages: {
        Row: {
          code: string
          name: string | null
        }
        Insert: {
          code: string
          name?: string | null
        }
        Update: {
          code?: string
          name?: string | null
        }
        Relationships: []
      }
      layout_breakpoints: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      layout_report_comments: {
        Row: {
          comment: string
          created_at: string | null
          id: string
          report_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          id?: string
          report_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: string
          report_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "layout_report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "layout_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_report_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_reports: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          maquetador_id: string | null
          notes: string | null
          proyecto_id: string | null
          report_month: string
          status: string | null
          total_hours: number | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          maquetador_id?: string | null
          notes?: string | null
          proyecto_id?: string | null
          report_month: string
          status?: string | null
          total_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          maquetador_id?: string | null
          notes?: string | null
          proyecto_id?: string | null
          report_month?: string
          status?: string | null
          total_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "layout_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_reports_maquetador_id_fkey"
            columns: ["maquetador_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_reports_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_reports_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      leads_orbit: {
        Row: {
          created_at: string
          email: string | null
          id: number
          message: string | null
          name: string | null
          phone: string | null
          user_type: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: never
          message?: string | null
          name?: string | null
          phone?: string | null
          user_type?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: never
          message?: string | null
          name?: string | null
          phone?: string | null
          user_type?: string | null
        }
        Relationships: []
      }
      maquetadores: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      meeting_reports: {
        Row: {
          client_id: string | null
          created_at: string
          google_docs_url: string | null
          id: string
          meeting_date: string
          notes: string | null
          proyecto_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          google_docs_url?: string | null
          id?: string
          meeting_date: string
          notes?: string | null
          proyecto_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          google_docs_url?: string | null
          id?: string
          meeting_date?: string
          notes?: string | null
          proyecto_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_reports_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_reports_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "meeting_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_ai_agent: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      notifications_outbox: {
        Row: {
          attempts: number
          channel_id: string | null
          created_at: string
          dedupe_key: string | null
          error: string | null
          error_message: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          metadata: Json | null
          next_try_at: string | null
          payload: Json
          priority: number
          processed_at: string | null
          provider_message_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          source: string
          status: string
          target_id: string | null
          target_type: string
          type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          channel_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          error_message?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json | null
          next_try_at?: string | null
          payload: Json
          priority?: number
          processed_at?: string | null
          provider_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          source: string
          status?: string
          target_id?: string | null
          target_type: string
          type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          channel_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          error_message?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json | null
          next_try_at?: string | null
          payload?: Json
          priority?: number
          processed_at?: string | null
          provider_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          source?: string
          status?: string
          target_id?: string | null
          target_type?: string
          type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      orbit_meeting_attendees: {
        Row: {
          attendee_role: string
          meeting_id: string
          response: string
          user_id: string
        }
        Insert: {
          attendee_role?: string
          meeting_id: string
          response?: string
          user_id: string
        }
        Update: {
          attendee_role?: string
          meeting_id?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "orbit_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_meeting_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_meetings: {
        Row: {
          agenda: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          external_video_url: string | null
          google_calendar_event_id: string | null
          id: string
          location_notes: string | null
          meeting_kind: string
          proyecto_id: string
          source: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          external_video_url?: string | null
          google_calendar_event_id?: string | null
          id?: string
          location_notes?: string | null
          meeting_kind?: string
          proyecto_id: string
          source?: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          external_video_url?: string | null
          google_calendar_event_id?: string | null
          id?: string
          location_notes?: string | null
          meeting_kind?: string
          proyecto_id?: string
          source?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_meetings_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orbit_meetings_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          price: number
          product_id: string | null
          quantity: number
        }
        Insert: {
          id?: string
          order_id: string
          price: number
          product_id?: string | null
          quantity: number
        }
        Update: {
          id?: string
          order_id?: string
          price?: number
          product_id?: string | null
          quantity?: number
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
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          id: string
          status: string
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      organic_search_metrics: {
        Row: {
          archived: boolean | null
          cliente_id: string
          created_at: string | null
          fecha_registro: string
          geo_dist_json: Json | null
          id: string
          keyword_intent_json: Json | null
          keyword_value_cpc_json: Json | null
          keywords_organicas: number | null
          market_domain_json: Json | null
          periodo_desde: string
          periodo_hasta: string
          proyecto_id: string
          referring_domains_json: Json | null
          resumen_ejecutivo: Json | null
          shared_analysis_id: string | null
          top_pages_json: Json | null
          top3_keywords: number | null
          traffic_value_json: Json | null
          trafico_organico: number | null
          updated_at: string | null
          valor_trafico: number | null
        }
        Insert: {
          archived?: boolean | null
          cliente_id: string
          created_at?: string | null
          fecha_registro?: string
          geo_dist_json?: Json | null
          id?: string
          keyword_intent_json?: Json | null
          keyword_value_cpc_json?: Json | null
          keywords_organicas?: number | null
          market_domain_json?: Json | null
          periodo_desde: string
          periodo_hasta: string
          proyecto_id: string
          referring_domains_json?: Json | null
          resumen_ejecutivo?: Json | null
          shared_analysis_id?: string | null
          top_pages_json?: Json | null
          top3_keywords?: number | null
          traffic_value_json?: Json | null
          trafico_organico?: number | null
          updated_at?: string | null
          valor_trafico?: number | null
        }
        Update: {
          archived?: boolean | null
          cliente_id?: string
          created_at?: string | null
          fecha_registro?: string
          geo_dist_json?: Json | null
          id?: string
          keyword_intent_json?: Json | null
          keyword_value_cpc_json?: Json | null
          keywords_organicas?: number | null
          market_domain_json?: Json | null
          periodo_desde?: string
          periodo_hasta?: string
          proyecto_id?: string
          referring_domains_json?: Json | null
          resumen_ejecutivo?: Json | null
          shared_analysis_id?: string | null
          top_pages_json?: Json | null
          top3_keywords?: number | null
          traffic_value_json?: Json | null
          trafico_organico?: number | null
          updated_at?: string | null
          valor_trafico?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organic_search_metrics_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organic_search_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organic_search_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      page_breakpoint_hours: {
        Row: {
          breakpoint_id: string
          consumed_hours: number
          created_at: string | null
          id: string
          page_id: string
          updated_at: string | null
        }
        Insert: {
          breakpoint_id: string
          consumed_hours: number
          created_at?: string | null
          id?: string
          page_id: string
          updated_at?: string | null
        }
        Update: {
          breakpoint_id?: string
          consumed_hours?: number
          created_at?: string | null
          id?: string
          page_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_breakpoint_hours_breakpoint_id_fkey"
            columns: ["breakpoint_id"]
            isOneToOne: false
            referencedRelation: "layout_breakpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_breakpoint_hours_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "report_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages_articles: {
        Row: {
          archived: boolean | null
          assigned_to: string | null
          author: string | null
          citaciones_locales: string | null
          client_id: string
          content_extract: string | null
          created_at: string
          id: number
          keywords_objetivo: string | null
          language: string | null
          proyecto_id: string | null
          publication_date: string
          title: string
          type: string
          url: string | null
          word_count: number | null
        }
        Insert: {
          archived?: boolean | null
          assigned_to?: string | null
          author?: string | null
          citaciones_locales?: string | null
          client_id: string
          content_extract?: string | null
          created_at?: string
          id?: number
          keywords_objetivo?: string | null
          language?: string | null
          proyecto_id?: string | null
          publication_date?: string
          title?: string
          type?: string
          url?: string | null
          word_count?: number | null
        }
        Update: {
          archived?: boolean | null
          assigned_to?: string | null
          author?: string | null
          citaciones_locales?: string | null
          client_id?: string
          content_extract?: string | null
          created_at?: string
          id?: number
          keywords_objetivo?: string | null
          language?: string | null
          proyecto_id?: string | null
          publication_date?: string
          title?: string
          type?: string
          url?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_articles_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_articles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_articles_language_fkey"
            columns: ["language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pages_articles_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_articles_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          stock: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          stock?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          stock?: number
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
          avatar_url: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      project_checklist_items: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          id: string
          observations: string | null
          priority: string | null
          proyecto_id: string
          status: string | null
          task_id: string | null
          template_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          id?: string
          observations?: string | null
          priority?: string | null
          proyecto_id: string
          status?: string | null
          task_id?: string | null
          template_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          id?: string
          observations?: string | null
          priority?: string | null
          proyecto_id?: string
          status?: string | null
          task_id?: string | null
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_checklist_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checklist_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checklist_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "project_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "seo_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_keyword_alerts: {
        Row: {
          alert_level: number
          consecutive_days_below: number
          created_at: string | null
          deficit_started_at: string | null
          is_active: boolean
          last_alert_at: string | null
          last_alert_level_sent: number
          last_keyword_count: number | null
          lider_id: string | null
          notes: string | null
          proyecto_id: string
          resolved_at: string | null
          slack_channel_id: string | null
          slack_notified_at: string | null
          snooze_until: string | null
          updated_at: string | null
        }
        Insert: {
          alert_level?: number
          consecutive_days_below?: number
          created_at?: string | null
          deficit_started_at?: string | null
          is_active?: boolean
          last_alert_at?: string | null
          last_alert_level_sent?: number
          last_keyword_count?: number | null
          lider_id?: string | null
          notes?: string | null
          proyecto_id: string
          resolved_at?: string | null
          slack_channel_id?: string | null
          slack_notified_at?: string | null
          snooze_until?: string | null
          updated_at?: string | null
        }
        Update: {
          alert_level?: number
          consecutive_days_below?: number
          created_at?: string | null
          deficit_started_at?: string | null
          is_active?: boolean
          last_alert_at?: string | null
          last_alert_level_sent?: number
          last_keyword_count?: number | null
          lider_id?: string | null
          notes?: string | null
          proyecto_id?: string
          resolved_at?: string | null
          slack_channel_id?: string | null
          slack_notified_at?: string | null
          snooze_until?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_keyword_alerts_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: true
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_keyword_alerts_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: true
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      project_meeting_recipients: {
        Row: {
          consent_at: string | null
          consent_source: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          language: string | null
          meeting_type: string | null
          proyecto_id: string
          recipient_name: string | null
          recipient_role: string | null
          updated_at: string | null
          whatsapp_phone_e164: string
        }
        Insert: {
          consent_at?: string | null
          consent_source?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          meeting_type?: string | null
          proyecto_id: string
          recipient_name?: string | null
          recipient_role?: string | null
          updated_at?: string | null
          whatsapp_phone_e164: string
        }
        Update: {
          consent_at?: string | null
          consent_source?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          meeting_type?: string | null
          proyecto_id?: string
          recipient_name?: string | null
          recipient_role?: string | null
          updated_at?: string | null
          whatsapp_phone_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_meeting_recipients_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_meeting_recipients_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      project_meetings: {
        Row: {
          client_id: string
          created_at: string | null
          description: string | null
          google_calendar_event_id: string | null
          id: string
          leader_id: string | null
          meet_url: string | null
          meeting_date: string
          meeting_time: string | null
          meeting_type: string | null
          participants: Json | null
          proyecto_id: string
          reminder_sent_at: string | null
          reminder_status: string | null
          status: string | null
          title: string
          updated_at: string | null
          whatsapp_group_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          description?: string | null
          google_calendar_event_id?: string | null
          id?: string
          leader_id?: string | null
          meet_url?: string | null
          meeting_date: string
          meeting_time?: string | null
          meeting_type?: string | null
          participants?: Json | null
          proyecto_id: string
          reminder_sent_at?: string | null
          reminder_status?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          whatsapp_group_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          description?: string | null
          google_calendar_event_id?: string | null
          id?: string
          leader_id?: string | null
          meet_url?: string | null
          meeting_date?: string
          meeting_time?: string | null
          meeting_type?: string | null
          participants?: Json | null
          proyecto_id?: string
          reminder_sent_at?: string | null
          reminder_status?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          whatsapp_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_meetings_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_meetings_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_meetings_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "project_meetings_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notification_settings: {
        Row: {
          assigned_user_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          notification_type: string
          proyecto_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_user_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notification_type: string
          proyecto_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_user_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notification_type?: string
          proyecto_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pns_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pns_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "fk_pns_user"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_resources: {
        Row: {
          created_at: string | null
          description_en: string | null
          description_es: string | null
          description_pt: string | null
          display_order: number | null
          icon_color: string
          icon_name: string
          id: string
          is_active: boolean | null
          is_react_component: boolean | null
          proyecto_id: string | null
          resource_type: string
          route_path: string | null
          title_en: string | null
          title_es: string | null
          title_pt: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          display_order?: number | null
          icon_color?: string
          icon_name?: string
          id?: string
          is_active?: boolean | null
          is_react_component?: boolean | null
          proyecto_id?: string | null
          resource_type: string
          route_path?: string | null
          title_en?: string | null
          title_es?: string | null
          title_pt?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description_en?: string | null
          description_es?: string | null
          description_pt?: string | null
          display_order?: number | null
          icon_color?: string
          icon_name?: string
          id?: string
          is_active?: boolean | null
          is_react_component?: boolean | null
          proyecto_id?: string | null
          resource_type?: string
          route_path?: string | null
          title_en?: string | null
          title_es?: string | null
          title_pt?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_resources_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_resources_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      project_services: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          proyecto_id: string
          services: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          proyecto_id: string
          services?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          proyecto_id?: string
          services?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_services_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: true
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_services_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: true
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      project_summaries: {
        Row: {
          content_en: string | null
          content_es: string | null
          content_pt: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          proyecto_id: string | null
          summary_type: string
          title_en: string | null
          title_es: string | null
          title_pt: string | null
          updated_at: string | null
        }
        Insert: {
          content_en?: string | null
          content_es?: string | null
          content_pt?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          proyecto_id?: string | null
          summary_type: string
          title_en?: string | null
          title_es?: string | null
          title_pt?: string | null
          updated_at?: string | null
        }
        Update: {
          content_en?: string | null
          content_es?: string | null
          content_pt?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          proyecto_id?: string | null
          summary_type?: string
          title_en?: string | null
          title_es?: string | null
          title_pt?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_summaries_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_summaries_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      projects_notifications: {
        Row: {
          admin_id: string | null
          client_id: string
          client_name: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_read: boolean | null
          message: string | null
          notifications_config: Json | null
          priority: string | null
          proyecto_id: string
          related_link: string | null
          team_member_id: string | null
          title: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_id?: string | null
          client_id: string
          client_name?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_read?: boolean | null
          message?: string | null
          notifications_config?: Json | null
          priority?: string | null
          proyecto_id: string
          related_link?: string | null
          team_member_id?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_id?: string | null
          client_id?: string
          client_name?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_read?: boolean | null
          message?: string | null
          notifications_config?: Json | null
          priority?: string | null
          proyecto_id?: string
          related_link?: string | null
          team_member_id?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_notifications_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_notifications_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_notifications_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "projects_notifications_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prospectos: {
        Row: {
          created_at: string | null
          estatus: string | null
          fecha_ingreso: string
          id: number
          locacion: string | null
          manager_asignado: string | null
          nombre_creador: string
          numero_identificacion: string
          updated_at: string | null
          usuario_tiktok: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string | null
          estatus?: string | null
          fecha_ingreso?: string
          id?: number
          locacion?: string | null
          manager_asignado?: string | null
          nombre_creador: string
          numero_identificacion: string
          updated_at?: string | null
          usuario_tiktok: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string | null
          estatus?: string | null
          fecha_ingreso?: string
          id?: number
          locacion?: string | null
          manager_asignado?: string | null
          nombre_creador?: string
          numero_identificacion?: string
          updated_at?: string | null
          usuario_tiktok?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      proyecto_trimestre_resumen: {
        Row: {
          dias_restantes: number | null
          dias_totales: number | null
          dias_transcurridos: number | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          porcentaje_progreso: number | null
          proyecto_id: string | null
          trimestre_nombre: string | null
          updated_at: string | null
        }
        Insert: {
          dias_restantes?: number | null
          dias_totales?: number | null
          dias_transcurridos?: number | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          porcentaje_progreso?: number | null
          proyecto_id?: string | null
          trimestre_nombre?: string | null
          updated_at?: string | null
        }
        Update: {
          dias_restantes?: number | null
          dias_totales?: number | null
          dias_transcurridos?: number | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          porcentaje_progreso?: number | null
          proyecto_id?: string | null
          trimestre_nombre?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_trimestre_resumen_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_trimestre_resumen_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      proyectos_seo: {
        Row: {
          accesibilidad: number | null
          accesibilidadmovil: number | null
          agencia_provee_disenador: boolean | null
          agencia_provee_equipo_tecnico: boolean | null
          agencia_provee_maquetador: boolean | null
          analista_id: string | null
          articulos_publicados: number | null
          automation_ia_id: string | null
          backlinksahrefs: number | null
          buenaspracticas: number | null
          buenaspracticasmovil: number | null
          cfmajestic: number | null
          clicsgsc: number | null
          client_id: string
          contenido_id: string | null
          coordinador_id: string | null
          corewebvitals: string | null
          created_at: string | null
          ctrgsc: number | null
          director_id: string | null
          disenadorweb_id: string | null
          domainrefahrefs: number | null
          dominioprincipal: string
          drahrefs: number | null
          duracion_fase: string | null
          emailcontacto: string | null
          estrategaoffpage_id: string | null
          external_technical_team: Json | null
          fase_proyecto: string | null
          fecha_suspension: string | null
          fechaetapainicio: string | null
          fechavencimiento: string | null
          ga4_property_id: string | null
          general_id: string | null
          hoja_ruta_consolidacion: string | null
          hoja_ruta_expansion: string | null
          hoja_ruta_fundacion: string | null
          id: string
          idioma_objetivo: string
          impresionesgsc: number | null
          indexabilidad: number | null
          invitados: Json | null
          kam_id: string | null
          keyword_reserve_target: number | null
          lider_id: string | null
          logotipo: Json | null
          maquetador_id: string | null
          metadr: number | null
          metakeywords: number | null
          metatrafico: number | null
          metatraficoporcentaje: number | null
          motivo_suspension: string | null
          nombrecontacto: string | null
          nombremarca: string
          organickeywordsahrefs: number | null
          organictrafficahrefs: number | null
          pagespeeddesktop: number | null
          pagespeedmovil: number | null
          paginas_indexadas: number | null
          paisobjetivo: string | null
          posicionpromediogsc: number | null
          presupuesto_backlinks: number | null
          presupuesto_contenido: number | null
          progreso_proyecto: string | null
          redactor_id: string | null
          rendimiento: number | null
          rendimientomovil: number | null
          reunion_automation_dia: string | null
          reunion_automation_hora: string | null
          reunion_estrategica_dia: string | null
          reunion_estrategica_hora: string | null
          reunion_operativa_dia: string | null
          reunion_operativa_hora: string | null
          reunion_temas_automation: string | null
          reunion_temas_estrategica: string | null
          reunion_temas_operativa: string | null
          reuniones: Json | null
          seo_contenido_personalized_id: string | null
          seo_tecnico_personalized_id: string | null
          seoestrategista_id: string | null
          seoscore: number | null
          seoscoremovil: number | null
          seotecnico_id: string | null
          skip_content_validation: boolean | null
          slack_channel_id: string | null
          sprints: string | null
          status_registro: string | null
          suspendido: boolean | null
          tfmajestic: number | null
          tiposnapshot: string | null
          topicaltrustflow: string | null
          trustratio: number | null
          urahrefs: number | null
          valida_backlinks: boolean | null
          valida_contenido: boolean | null
          whatsapp_contacto: string | null
          whatsapp_group_id: string | null
        }
        Insert: {
          accesibilidad?: number | null
          accesibilidadmovil?: number | null
          agencia_provee_disenador?: boolean | null
          agencia_provee_equipo_tecnico?: boolean | null
          agencia_provee_maquetador?: boolean | null
          analista_id?: string | null
          articulos_publicados?: number | null
          automation_ia_id?: string | null
          backlinksahrefs?: number | null
          buenaspracticas?: number | null
          buenaspracticasmovil?: number | null
          cfmajestic?: number | null
          clicsgsc?: number | null
          client_id: string
          contenido_id?: string | null
          coordinador_id?: string | null
          corewebvitals?: string | null
          created_at?: string | null
          ctrgsc?: number | null
          director_id?: string | null
          disenadorweb_id?: string | null
          domainrefahrefs?: number | null
          dominioprincipal: string
          drahrefs?: number | null
          duracion_fase?: string | null
          emailcontacto?: string | null
          estrategaoffpage_id?: string | null
          external_technical_team?: Json | null
          fase_proyecto?: string | null
          fecha_suspension?: string | null
          fechaetapainicio?: string | null
          fechavencimiento?: string | null
          ga4_property_id?: string | null
          general_id?: string | null
          hoja_ruta_consolidacion?: string | null
          hoja_ruta_expansion?: string | null
          hoja_ruta_fundacion?: string | null
          id?: string
          idioma_objetivo?: string
          impresionesgsc?: number | null
          indexabilidad?: number | null
          invitados?: Json | null
          kam_id?: string | null
          keyword_reserve_target?: number | null
          lider_id?: string | null
          logotipo?: Json | null
          maquetador_id?: string | null
          metadr?: number | null
          metakeywords?: number | null
          metatrafico?: number | null
          metatraficoporcentaje?: number | null
          motivo_suspension?: string | null
          nombrecontacto?: string | null
          nombremarca: string
          organickeywordsahrefs?: number | null
          organictrafficahrefs?: number | null
          pagespeeddesktop?: number | null
          pagespeedmovil?: number | null
          paginas_indexadas?: number | null
          paisobjetivo?: string | null
          posicionpromediogsc?: number | null
          presupuesto_backlinks?: number | null
          presupuesto_contenido?: number | null
          progreso_proyecto?: string | null
          redactor_id?: string | null
          rendimiento?: number | null
          rendimientomovil?: number | null
          reunion_automation_dia?: string | null
          reunion_automation_hora?: string | null
          reunion_estrategica_dia?: string | null
          reunion_estrategica_hora?: string | null
          reunion_operativa_dia?: string | null
          reunion_operativa_hora?: string | null
          reunion_temas_automation?: string | null
          reunion_temas_estrategica?: string | null
          reunion_temas_operativa?: string | null
          reuniones?: Json | null
          seo_contenido_personalized_id?: string | null
          seo_tecnico_personalized_id?: string | null
          seoestrategista_id?: string | null
          seoscore?: number | null
          seoscoremovil?: number | null
          seotecnico_id?: string | null
          skip_content_validation?: boolean | null
          slack_channel_id?: string | null
          sprints?: string | null
          status_registro?: string | null
          suspendido?: boolean | null
          tfmajestic?: number | null
          tiposnapshot?: string | null
          topicaltrustflow?: string | null
          trustratio?: number | null
          urahrefs?: number | null
          valida_backlinks?: boolean | null
          valida_contenido?: boolean | null
          whatsapp_contacto?: string | null
          whatsapp_group_id?: string | null
        }
        Update: {
          accesibilidad?: number | null
          accesibilidadmovil?: number | null
          agencia_provee_disenador?: boolean | null
          agencia_provee_equipo_tecnico?: boolean | null
          agencia_provee_maquetador?: boolean | null
          analista_id?: string | null
          articulos_publicados?: number | null
          automation_ia_id?: string | null
          backlinksahrefs?: number | null
          buenaspracticas?: number | null
          buenaspracticasmovil?: number | null
          cfmajestic?: number | null
          clicsgsc?: number | null
          client_id?: string
          contenido_id?: string | null
          coordinador_id?: string | null
          corewebvitals?: string | null
          created_at?: string | null
          ctrgsc?: number | null
          director_id?: string | null
          disenadorweb_id?: string | null
          domainrefahrefs?: number | null
          dominioprincipal?: string
          drahrefs?: number | null
          duracion_fase?: string | null
          emailcontacto?: string | null
          estrategaoffpage_id?: string | null
          external_technical_team?: Json | null
          fase_proyecto?: string | null
          fecha_suspension?: string | null
          fechaetapainicio?: string | null
          fechavencimiento?: string | null
          ga4_property_id?: string | null
          general_id?: string | null
          hoja_ruta_consolidacion?: string | null
          hoja_ruta_expansion?: string | null
          hoja_ruta_fundacion?: string | null
          id?: string
          idioma_objetivo?: string
          impresionesgsc?: number | null
          indexabilidad?: number | null
          invitados?: Json | null
          kam_id?: string | null
          keyword_reserve_target?: number | null
          lider_id?: string | null
          logotipo?: Json | null
          maquetador_id?: string | null
          metadr?: number | null
          metakeywords?: number | null
          metatrafico?: number | null
          metatraficoporcentaje?: number | null
          motivo_suspension?: string | null
          nombrecontacto?: string | null
          nombremarca?: string
          organickeywordsahrefs?: number | null
          organictrafficahrefs?: number | null
          pagespeeddesktop?: number | null
          pagespeedmovil?: number | null
          paginas_indexadas?: number | null
          paisobjetivo?: string | null
          posicionpromediogsc?: number | null
          presupuesto_backlinks?: number | null
          presupuesto_contenido?: number | null
          progreso_proyecto?: string | null
          redactor_id?: string | null
          rendimiento?: number | null
          rendimientomovil?: number | null
          reunion_automation_dia?: string | null
          reunion_automation_hora?: string | null
          reunion_estrategica_dia?: string | null
          reunion_estrategica_hora?: string | null
          reunion_operativa_dia?: string | null
          reunion_operativa_hora?: string | null
          reunion_temas_automation?: string | null
          reunion_temas_estrategica?: string | null
          reunion_temas_operativa?: string | null
          reuniones?: Json | null
          seo_contenido_personalized_id?: string | null
          seo_tecnico_personalized_id?: string | null
          seoestrategista_id?: string | null
          seoscore?: number | null
          seoscoremovil?: number | null
          seotecnico_id?: string | null
          skip_content_validation?: boolean | null
          slack_channel_id?: string | null
          sprints?: string | null
          status_registro?: string | null
          suspendido?: boolean | null
          tfmajestic?: number | null
          tiposnapshot?: string | null
          topicaltrustflow?: string | null
          trustratio?: number | null
          urahrefs?: number | null
          valida_backlinks?: boolean | null
          valida_contenido?: boolean | null
          whatsapp_contacto?: string | null
          whatsapp_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proyectos_seo_analista_id_fkey"
            columns: ["analista_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_automation_ia_id_fkey"
            columns: ["automation_ia_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_contenido_id_fkey"
            columns: ["contenido_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_coordinador_id_fkey"
            columns: ["coordinador_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_disenadorweb_id_fkey"
            columns: ["disenadorweb_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_estrategaoffpage_id_fkey"
            columns: ["estrategaoffpage_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_general_id_fkey"
            columns: ["general_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_kam_id_fkey"
            columns: ["kam_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_maquetador_id_fkey"
            columns: ["maquetador_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_redactor_id_fkey"
            columns: ["redactor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_seo_contenido_personalized_id_fkey"
            columns: ["seo_contenido_personalized_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_seo_tecnico_personalized_id_fkey"
            columns: ["seo_tecnico_personalized_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_seoestrategista_id_fkey"
            columns: ["seoestrategista_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_seotecnico_id_fkey"
            columns: ["seotecnico_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos_seo_backup_20241012: {
        Row: {
          accesibilidad: number | null
          accesibilidadmovil: number | null
          analista_id: string | null
          articulos_publicados: number | null
          automation_ia_id: string | null
          buenaspracticas: number | null
          buenaspracticasmovil: number | null
          cfmajestic: number | null
          clicsgsc: number | null
          client_id: string | null
          contenido_id: string | null
          coordinador_id: string | null
          corewebvitals: string | null
          created_at: string | null
          ctrgsc: number | null
          director_id: string | null
          disenadorweb_id: string | null
          dominioprincipal: string | null
          drahrefs: number | null
          duracion_fase: string | null
          emailcontacto: string | null
          estrategaoffpage_id: string | null
          fase_proyecto: string | null
          fechaetapainicio: string | null
          fechavencimiento: string | null
          hoja_ruta_consolidacion: string | null
          hoja_ruta_expansion: string | null
          hoja_ruta_fundacion: string | null
          id: string | null
          idioma_objetivo: string | null
          impresionesgsc: number | null
          indexabilidad: number | null
          invitados: Json | null
          kam_id: string | null
          logotipo: Json | null
          maquetador_id: string | null
          metadr: number | null
          metakeywords: number | null
          metatrafico: number | null
          metatraficoporcentaje: number | null
          nombrecontacto: string | null
          nombremarca: string | null
          organickeywordsahrefs: number | null
          organictrafficahrefs: number | null
          pagespeeddesktop: number | null
          pagespeedmovil: number | null
          paginas_indexadas: number | null
          paisobjetivo: string | null
          posicionpromediogsc: number | null
          presupuesto_backlinks: number | null
          presupuesto_contenido: number | null
          progreso_proyecto: string | null
          redactor_id: string | null
          rendimiento: number | null
          rendimientomovil: number | null
          reunion_automation_dia: string | null
          reunion_automation_hora: string | null
          reunion_estrategica_dia: string | null
          reunion_estrategica_hora: string | null
          reunion_operativa_dia: string | null
          reunion_operativa_hora: string | null
          reunion_temas_automation: string | null
          reunion_temas_estrategica: string | null
          reunion_temas_operativa: string | null
          reuniones: Json | null
          seoestrategista_id: string | null
          seoscore: number | null
          seoscoremovil: number | null
          seotecnico_id: string | null
          sprints: string | null
          tfmajestic: number | null
          tiposnapshot: string | null
          topicaltrustflow: string | null
          trustratio: number | null
          urahrefs: number | null
          valida_backlinks: boolean | null
          valida_contenido: boolean | null
        }
        Insert: {
          accesibilidad?: number | null
          accesibilidadmovil?: number | null
          analista_id?: string | null
          articulos_publicados?: number | null
          automation_ia_id?: string | null
          buenaspracticas?: number | null
          buenaspracticasmovil?: number | null
          cfmajestic?: number | null
          clicsgsc?: number | null
          client_id?: string | null
          contenido_id?: string | null
          coordinador_id?: string | null
          corewebvitals?: string | null
          created_at?: string | null
          ctrgsc?: number | null
          director_id?: string | null
          disenadorweb_id?: string | null
          dominioprincipal?: string | null
          drahrefs?: number | null
          duracion_fase?: string | null
          emailcontacto?: string | null
          estrategaoffpage_id?: string | null
          fase_proyecto?: string | null
          fechaetapainicio?: string | null
          fechavencimiento?: string | null
          hoja_ruta_consolidacion?: string | null
          hoja_ruta_expansion?: string | null
          hoja_ruta_fundacion?: string | null
          id?: string | null
          idioma_objetivo?: string | null
          impresionesgsc?: number | null
          indexabilidad?: number | null
          invitados?: Json | null
          kam_id?: string | null
          logotipo?: Json | null
          maquetador_id?: string | null
          metadr?: number | null
          metakeywords?: number | null
          metatrafico?: number | null
          metatraficoporcentaje?: number | null
          nombrecontacto?: string | null
          nombremarca?: string | null
          organickeywordsahrefs?: number | null
          organictrafficahrefs?: number | null
          pagespeeddesktop?: number | null
          pagespeedmovil?: number | null
          paginas_indexadas?: number | null
          paisobjetivo?: string | null
          posicionpromediogsc?: number | null
          presupuesto_backlinks?: number | null
          presupuesto_contenido?: number | null
          progreso_proyecto?: string | null
          redactor_id?: string | null
          rendimiento?: number | null
          rendimientomovil?: number | null
          reunion_automation_dia?: string | null
          reunion_automation_hora?: string | null
          reunion_estrategica_dia?: string | null
          reunion_estrategica_hora?: string | null
          reunion_operativa_dia?: string | null
          reunion_operativa_hora?: string | null
          reunion_temas_automation?: string | null
          reunion_temas_estrategica?: string | null
          reunion_temas_operativa?: string | null
          reuniones?: Json | null
          seoestrategista_id?: string | null
          seoscore?: number | null
          seoscoremovil?: number | null
          seotecnico_id?: string | null
          sprints?: string | null
          tfmajestic?: number | null
          tiposnapshot?: string | null
          topicaltrustflow?: string | null
          trustratio?: number | null
          urahrefs?: number | null
          valida_backlinks?: boolean | null
          valida_contenido?: boolean | null
        }
        Update: {
          accesibilidad?: number | null
          accesibilidadmovil?: number | null
          analista_id?: string | null
          articulos_publicados?: number | null
          automation_ia_id?: string | null
          buenaspracticas?: number | null
          buenaspracticasmovil?: number | null
          cfmajestic?: number | null
          clicsgsc?: number | null
          client_id?: string | null
          contenido_id?: string | null
          coordinador_id?: string | null
          corewebvitals?: string | null
          created_at?: string | null
          ctrgsc?: number | null
          director_id?: string | null
          disenadorweb_id?: string | null
          dominioprincipal?: string | null
          drahrefs?: number | null
          duracion_fase?: string | null
          emailcontacto?: string | null
          estrategaoffpage_id?: string | null
          fase_proyecto?: string | null
          fechaetapainicio?: string | null
          fechavencimiento?: string | null
          hoja_ruta_consolidacion?: string | null
          hoja_ruta_expansion?: string | null
          hoja_ruta_fundacion?: string | null
          id?: string | null
          idioma_objetivo?: string | null
          impresionesgsc?: number | null
          indexabilidad?: number | null
          invitados?: Json | null
          kam_id?: string | null
          logotipo?: Json | null
          maquetador_id?: string | null
          metadr?: number | null
          metakeywords?: number | null
          metatrafico?: number | null
          metatraficoporcentaje?: number | null
          nombrecontacto?: string | null
          nombremarca?: string | null
          organickeywordsahrefs?: number | null
          organictrafficahrefs?: number | null
          pagespeeddesktop?: number | null
          pagespeedmovil?: number | null
          paginas_indexadas?: number | null
          paisobjetivo?: string | null
          posicionpromediogsc?: number | null
          presupuesto_backlinks?: number | null
          presupuesto_contenido?: number | null
          progreso_proyecto?: string | null
          redactor_id?: string | null
          rendimiento?: number | null
          rendimientomovil?: number | null
          reunion_automation_dia?: string | null
          reunion_automation_hora?: string | null
          reunion_estrategica_dia?: string | null
          reunion_estrategica_hora?: string | null
          reunion_operativa_dia?: string | null
          reunion_operativa_hora?: string | null
          reunion_temas_automation?: string | null
          reunion_temas_estrategica?: string | null
          reunion_temas_operativa?: string | null
          reuniones?: Json | null
          seoestrategista_id?: string | null
          seoscore?: number | null
          seoscoremovil?: number | null
          seotecnico_id?: string | null
          sprints?: string | null
          tfmajestic?: number | null
          tiposnapshot?: string | null
          topicaltrustflow?: string | null
          trustratio?: number | null
          urahrefs?: number | null
          valida_backlinks?: boolean | null
          valida_contenido?: boolean | null
        }
        Relationships: []
      }
      recurring_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          day_of_month: number | null
          day_of_week: number | null
          frequency: string
          id: string
          last_created_at: string | null
          month: number | null
          next_run_at: string
          proyecto_id: string
          status: string | null
          template_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          frequency: string
          id?: string
          last_created_at?: string | null
          month?: number | null
          next_run_at: string
          proyecto_id: string
          status?: string | null
          template_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string
          id?: string
          last_created_at?: string | null
          month?: number | null
          next_run_at?: string
          proyecto_id?: string
          status?: string | null
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_tasks_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "recurring_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "seo_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_arsenal_config: {
        Row: {
          google_review_link: string | null
          id: string
          proyecto_id: string
          subtitulo_seccion: string | null
          titulo_seccion: string | null
          updated_at: string | null
        }
        Insert: {
          google_review_link?: string | null
          id?: string
          proyecto_id: string
          subtitulo_seccion?: string | null
          titulo_seccion?: string | null
          updated_at?: string | null
        }
        Update: {
          google_review_link?: string | null
          id?: string
          proyecto_id?: string
          subtitulo_seccion?: string | null
          titulo_seccion?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_arsenal_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_arsenal_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_arsenal_herramientas: {
        Row: {
          generador_excusas_titulo: string | null
          id: string
          proyecto_id: string
          qr_descripcion: string | null
          qr_download_url: string | null
          qr_imagen_url: string | null
          qr_titulo: string | null
          updated_at: string | null
        }
        Insert: {
          generador_excusas_titulo?: string | null
          id?: string
          proyecto_id: string
          qr_descripcion?: string | null
          qr_download_url?: string | null
          qr_imagen_url?: string | null
          qr_titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          generador_excusas_titulo?: string | null
          id?: string
          proyecto_id?: string
          qr_descripcion?: string | null
          qr_download_url?: string | null
          qr_imagen_url?: string | null
          qr_titulo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_arsenal_herramientas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_arsenal_herramientas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_arsenal_scripts: {
        Row: {
          categoria_label: string | null
          cuerpo_texto: string | null
          enlace_script: string | null
          id: string
          orden: number | null
          proyecto_id: string
          updated_at: string | null
        }
        Insert: {
          categoria_label?: string | null
          cuerpo_texto?: string | null
          enlace_script?: string | null
          id?: string
          orden?: number | null
          proyecto_id: string
          updated_at?: string | null
        }
        Update: {
          categoria_label?: string | null
          cuerpo_texto?: string | null
          enlace_script?: string | null
          id?: string
          orden?: number | null
          proyecto_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_arsenal_scripts_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_arsenal_scripts_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_balance_config: {
        Row: {
          boton_bloqueo_texto: string | null
          dias_para_cierre: number | null
          esta_bloqueado: boolean | null
          id: string
          proyecto_id: string
          subtitulo_seccion: string | null
          titulo_seccion: string | null
          updated_at: string | null
        }
        Insert: {
          boton_bloqueo_texto?: string | null
          dias_para_cierre?: number | null
          esta_bloqueado?: boolean | null
          id?: string
          proyecto_id: string
          subtitulo_seccion?: string | null
          titulo_seccion?: string | null
          updated_at?: string | null
        }
        Update: {
          boton_bloqueo_texto?: string | null
          dias_para_cierre?: number | null
          esta_bloqueado?: boolean | null
          id?: string
          proyecto_id?: string
          subtitulo_seccion?: string | null
          titulo_seccion?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_balance_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_balance_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_balance_metricas: {
        Row: {
          color_tema: string | null
          icono_slug: string | null
          id: string
          orden: number | null
          proyecto_id: string
          subtexto_ayuda: string | null
          titulo_metrica: string | null
          updated_at: string | null
          valor_actual: number | null
        }
        Insert: {
          color_tema?: string | null
          icono_slug?: string | null
          id?: string
          orden?: number | null
          proyecto_id: string
          subtexto_ayuda?: string | null
          titulo_metrica?: string | null
          updated_at?: string | null
          valor_actual?: number | null
        }
        Update: {
          color_tema?: string | null
          icono_slug?: string | null
          id?: string
          orden?: number | null
          proyecto_id?: string
          subtexto_ayuda?: string | null
          titulo_metrica?: string | null
          updated_at?: string | null
          valor_actual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_balance_metricas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_balance_metricas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_camino_pasos: {
        Row: {
          es_bloqueado: boolean | null
          fase_nombre: string | null
          id: string
          mes_nombre: string
          orden: number
          progreso_numerico: number | null
          progreso_total: number | null
          proyecto_id: string
          status_tag: string | null
          updated_at: string | null
        }
        Insert: {
          es_bloqueado?: boolean | null
          fase_nombre?: string | null
          id?: string
          mes_nombre: string
          orden: number
          progreso_numerico?: number | null
          progreso_total?: number | null
          proyecto_id: string
          status_tag?: string | null
          updated_at?: string | null
        }
        Update: {
          es_bloqueado?: boolean | null
          fase_nombre?: string | null
          id?: string
          mes_nombre?: string
          orden?: number
          progreso_numerico?: number | null
          progreso_total?: number | null
          proyecto_id?: string
          status_tag?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_camino_pasos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_camino_pasos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_cronograma_metas: {
        Row: {
          created_at: string | null
          es_mes_actual: boolean | null
          id: string
          mes_label_grafico: string | null
          mes_label_lista: string | null
          orden: number
          proyecto_id: string
          punto_grafico_actual: number | null
          punto_grafico_optimizado: number | null
          valor_proyeccion: string | null
          valor_tactico: number | null
        }
        Insert: {
          created_at?: string | null
          es_mes_actual?: boolean | null
          id?: string
          mes_label_grafico?: string | null
          mes_label_lista?: string | null
          orden: number
          proyecto_id: string
          punto_grafico_actual?: number | null
          punto_grafico_optimizado?: number | null
          valor_proyeccion?: string | null
          valor_tactico?: number | null
        }
        Update: {
          created_at?: string | null
          es_mes_actual?: boolean | null
          id?: string
          mes_label_grafico?: string | null
          mes_label_lista?: string | null
          orden?: number
          proyecto_id?: string
          punto_grafico_actual?: number | null
          punto_grafico_optimizado?: number | null
          valor_proyeccion?: string | null
          valor_tactico?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_cronograma_metas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_cronograma_metas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_estado_vitals: {
        Row: {
          color_pulso_css: string | null
          estado_descripcion_texto: string | null
          estado_porcentaje: number | null
          estado_titulo: string | null
          id: string
          link_accion_label: string | null
          proyecto_id: string
          updated_at: string | null
        }
        Insert: {
          color_pulso_css?: string | null
          estado_descripcion_texto?: string | null
          estado_porcentaje?: number | null
          estado_titulo?: string | null
          id?: string
          link_accion_label?: string | null
          proyecto_id: string
          updated_at?: string | null
        }
        Update: {
          color_pulso_css?: string | null
          estado_descripcion_texto?: string | null
          estado_porcentaje?: number | null
          estado_titulo?: string | null
          id?: string
          link_accion_label?: string | null
          proyecto_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_estado_vitals_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_estado_vitals_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_fama_config: {
        Row: {
          descripcion_seccion: string | null
          id: string
          proyecto_id: string
          titulo_seccion: string | null
          updated_at: string | null
        }
        Insert: {
          descripcion_seccion?: string | null
          id?: string
          proyecto_id: string
          titulo_seccion?: string | null
          updated_at?: string | null
        }
        Update: {
          descripcion_seccion?: string | null
          id?: string
          proyecto_id?: string
          titulo_seccion?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_fama_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_fama_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_fama_testimonios: {
        Row: {
          autor_foto_url: string | null
          autor_iniciales: string | null
          autor_nombre: string
          created_at: string | null
          cuerpo_resena: string
          fecha_publicacion: string | null
          fuente_plataforma: string | null
          id: string
          orden: number | null
          proyecto_id: string
          rating_estrellas: number | null
        }
        Insert: {
          autor_foto_url?: string | null
          autor_iniciales?: string | null
          autor_nombre: string
          created_at?: string | null
          cuerpo_resena: string
          fecha_publicacion?: string | null
          fuente_plataforma?: string | null
          id?: string
          orden?: number | null
          proyecto_id: string
          rating_estrellas?: number | null
        }
        Update: {
          autor_foto_url?: string | null
          autor_iniciales?: string | null
          autor_nombre?: string
          created_at?: string | null
          cuerpo_resena?: string
          fecha_publicacion?: string | null
          fuente_plataforma?: string | null
          id?: string
          orden?: number | null
          proyecto_id?: string
          rating_estrellas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_fama_testimonios_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_fama_testimonios_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_keyword_fichas_detalles: {
        Row: {
          analisis_tactico_parrafo: string | null
          created_at: string | null
          google_serp_url: string | null
          id: string
          kd_valor: number | null
          keyword_titulo: string
          orden: number | null
          posicion_actual: string | null
          potencial_visitas_texto: string | null
          proyecto_id: string
          updated_at: string | null
          volumen_texto: string | null
        }
        Insert: {
          analisis_tactico_parrafo?: string | null
          created_at?: string | null
          google_serp_url?: string | null
          id?: string
          kd_valor?: number | null
          keyword_titulo: string
          orden?: number | null
          posicion_actual?: string | null
          potencial_visitas_texto?: string | null
          proyecto_id: string
          updated_at?: string | null
          volumen_texto?: string | null
        }
        Update: {
          analisis_tactico_parrafo?: string | null
          created_at?: string | null
          google_serp_url?: string | null
          id?: string
          kd_valor?: number | null
          keyword_titulo?: string
          orden?: number | null
          posicion_actual?: string | null
          potencial_visitas_texto?: string | null
          proyecto_id?: string
          updated_at?: string | null
          volumen_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_keyword_fichas_detalles_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_keyword_fichas_detalles_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_panel_config: {
        Row: {
          created_at: string | null
          id: string
          meta_acumulada_label: string | null
          meta_acumulada_valor: number | null
          oraculo_titulo: string | null
          proyecto_id: string
          seccion_titulo: string | null
          vibe_nivel: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          meta_acumulada_label?: string | null
          meta_acumulada_valor?: number | null
          oraculo_titulo?: string | null
          proyecto_id: string
          seccion_titulo?: string | null
          vibe_nivel?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          meta_acumulada_label?: string | null
          meta_acumulada_valor?: number | null
          oraculo_titulo?: string | null
          proyecto_id?: string
          seccion_titulo?: string | null
          vibe_nivel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_panel_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_panel_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_radar_keywords: {
        Row: {
          created_at: string | null
          id: string
          kd_valor: number | null
          keyword_principal: string
          oportunidad_texto: string | null
          orden: number | null
          pais_iso: string | null
          pais_nombre: string | null
          posicion_actual: number | null
          posicion_meta: number | null
          potencial_visitas_texto: string | null
          proyecto_id: string
          status_label: string | null
          updated_at: string | null
          url_monitoreo: string | null
          variaciones: string[] | null
          volumen_valor: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          kd_valor?: number | null
          keyword_principal: string
          oportunidad_texto?: string | null
          orden?: number | null
          pais_iso?: string | null
          pais_nombre?: string | null
          posicion_actual?: number | null
          posicion_meta?: number | null
          potencial_visitas_texto?: string | null
          proyecto_id: string
          status_label?: string | null
          updated_at?: string | null
          url_monitoreo?: string | null
          variaciones?: string[] | null
          volumen_valor?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          kd_valor?: number | null
          keyword_principal?: string
          oportunidad_texto?: string | null
          orden?: number | null
          pais_iso?: string | null
          pais_nombre?: string | null
          posicion_actual?: number | null
          posicion_meta?: number | null
          potencial_visitas_texto?: string | null
          proyecto_id?: string
          status_label?: string | null
          updated_at?: string | null
          url_monitoreo?: string | null
          variaciones?: string[] | null
          volumen_valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_radar_keywords_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_radar_keywords_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_sprint_progreso: {
        Row: {
          dias_restantes: number | null
          id: string
          meta_diaria_progreso_porcentaje: number | null
          meta_diaria_valor: number | null
          meta_lograda: number | null
          meta_total: number | null
          operacion_nombre: string | null
          proyecto_id: string
          sprint_etiqueta: string | null
          texto_ayuda_ritmo: string | null
          updated_at: string | null
        }
        Insert: {
          dias_restantes?: number | null
          id?: string
          meta_diaria_progreso_porcentaje?: number | null
          meta_diaria_valor?: number | null
          meta_lograda?: number | null
          meta_total?: number | null
          operacion_nombre?: string | null
          proyecto_id: string
          sprint_etiqueta?: string | null
          texto_ayuda_ritmo?: string | null
          updated_at?: string | null
        }
        Update: {
          dias_restantes?: number | null
          id?: string
          meta_diaria_progreso_porcentaje?: number | null
          meta_diaria_valor?: number | null
          meta_lograda?: number | null
          meta_total?: number | null
          operacion_nombre?: string | null
          proyecto_id?: string
          sprint_etiqueta?: string | null
          texto_ayuda_ritmo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_sprint_progreso_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_sprint_progreso_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_strategy_cards: {
        Row: {
          color_tema: string | null
          descripcion: string | null
          icono_slug: string | null
          id: string
          orden: number
          proyecto_id: string
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          color_tema?: string | null
          descripcion?: string | null
          icono_slug?: string | null
          id?: string
          orden: number
          proyecto_id: string
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          color_tema?: string | null
          descripcion?: string | null
          icono_slug?: string | null
          id?: string
          orden?: number
          proyecto_id?: string
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_strategy_cards_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_strategy_cards_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      rep_strategy_main: {
        Row: {
          estrategia_titulo: string | null
          hero_image_url: string | null
          hero_tag: string | null
          hero_titulo: string | null
          id: string
          mision_status_label: string | null
          mision_trimestre_desc: string | null
          mision_trimestre_titulo: string | null
          proyecto_id: string
          reglas_bullets: string[] | null
          reglas_titulo: string | null
          updated_at: string | null
        }
        Insert: {
          estrategia_titulo?: string | null
          hero_image_url?: string | null
          hero_tag?: string | null
          hero_titulo?: string | null
          id?: string
          mision_status_label?: string | null
          mision_trimestre_desc?: string | null
          mision_trimestre_titulo?: string | null
          proyecto_id: string
          reglas_bullets?: string[] | null
          reglas_titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          estrategia_titulo?: string | null
          hero_image_url?: string | null
          hero_tag?: string | null
          hero_titulo?: string | null
          id?: string
          mision_status_label?: string | null
          mision_trimestre_desc?: string | null
          mision_trimestre_titulo?: string | null
          proyecto_id?: string
          reglas_bullets?: string[] | null
          reglas_titulo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_strategy_main_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_strategy_main_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      report_pages: {
        Row: {
          countries: string | null
          created_at: string | null
          documentation_url: string | null
          id: string
          last_update_date: string | null
          name: string
          report_id: string
          status: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          countries?: string | null
          created_at?: string | null
          documentation_url?: string | null
          id?: string
          last_update_date?: string | null
          name: string
          report_id: string
          status: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          countries?: string | null
          created_at?: string | null
          documentation_url?: string | null
          id?: string
          last_update_date?: string | null
          name?: string
          report_id?: string
          status?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_pages_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "layout_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedule_config: {
        Row: {
          client_id: string
          created_at: string | null
          delivery_time: string | null
          id: string
          management_type: string | null
          participants: Json | null
          proyecto_id: string
          report_date: string
          report_month: number | null
          report_number: number | null
          report_year: number | null
          smart_report_executive_summary: string | null
          smart_report_pdf_urls: Json | null
          status: string
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          delivery_time?: string | null
          id?: string
          management_type?: string | null
          participants?: Json | null
          proyecto_id: string
          report_date: string
          report_month?: number | null
          report_number?: number | null
          report_year?: number | null
          smart_report_executive_summary?: string | null
          smart_report_pdf_urls?: Json | null
          status?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          delivery_time?: string | null
          id?: string
          management_type?: string | null
          participants?: Json | null
          proyecto_id?: string
          report_date?: string
          report_month?: number | null
          report_number?: number | null
          report_year?: number | null
          smart_report_executive_summary?: string | null
          smart_report_pdf_urls?: Json | null
          status?: string
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_schedule_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedule_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedule_config_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      request_messages: {
        Row: {
          created_at: string | null
          file_urls: string[] | null
          id: string
          is_internal: boolean | null
          message: string
          request_id: string | null
          resource_link: string | null
          sender_id: string
          ticket_id: number | null
        }
        Insert: {
          created_at?: string | null
          file_urls?: string[] | null
          id?: string
          is_internal?: boolean | null
          message: string
          request_id?: string | null
          resource_link?: string | null
          sender_id: string
          ticket_id?: number | null
        }
        Update: {
          created_at?: string | null
          file_urls?: string[] | null
          id?: string
          is_internal?: boolean | null
          message?: string
          request_id?: string | null
          resource_link?: string | null
          sender_id?: string
          ticket_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_request"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_request"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests_attention"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sender"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ticket"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ticket"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "v_ticket_hub_attention"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      resources_attachments: {
        Row: {
          archivo_url: string
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          document_url: string | null
          id: string
          is_active: boolean | null
          nombre: string
          nombre_archivo: string
          orden: number | null
          proyecto_id: string
          tamano_archivo: number | null
          tipo_archivo: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          archivo_url: string
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          document_url?: string | null
          id?: string
          is_active?: boolean | null
          nombre: string
          nombre_archivo: string
          orden?: number | null
          proyecto_id: string
          tamano_archivo?: number | null
          tipo_archivo?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          archivo_url?: string
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          document_url?: string | null
          id?: string
          is_active?: boolean | null
          nombre?: string
          nombre_archivo?: string
          orden?: number | null
          proyecto_id?: string
          tamano_archivo?: number | null
          tipo_archivo?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_resources_attachments_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_resources_attachments_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      roles_backup_20241012: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      seo_checklist_templates: {
        Row: {
          category: string
          created_at: string | null
          default_priority: string | null
          description: string | null
          display_order: number | null
          id: string
          subcategory: string
          task_name: string
        }
        Insert: {
          category: string
          created_at?: string | null
          default_priority?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          subcategory: string
          task_name: string
        }
        Update: {
          category?: string
          created_at?: string | null
          default_priority?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          subcategory?: string
          task_name?: string
        }
        Relationships: []
      }
      seo_content_swarm_runtime_config: {
        Row: {
          agent_matrix: Json
          config_key: string
          created_at: string
          default_execution_mode: string
          enabled: boolean
          image_skill_slug: string
          image_skill_version: number | null
          legacy_orchestrator_slug: string
          legacy_orchestrator_version: number | null
          rollout_notes: string | null
          router_slug: string
          updated_at: string
        }
        Insert: {
          agent_matrix?: Json
          config_key: string
          created_at?: string
          default_execution_mode?: string
          enabled?: boolean
          image_skill_slug?: string
          image_skill_version?: number | null
          legacy_orchestrator_slug?: string
          legacy_orchestrator_version?: number | null
          rollout_notes?: string | null
          router_slug?: string
          updated_at?: string
        }
        Update: {
          agent_matrix?: Json
          config_key?: string
          created_at?: string
          default_execution_mode?: string
          enabled?: boolean
          image_skill_slug?: string
          image_skill_version?: number | null
          legacy_orchestrator_slug?: string
          legacy_orchestrator_version?: number | null
          rollout_notes?: string | null
          router_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      seo_lab_report_runs: {
        Row: {
          agent_status: string | null
          brand_name: string | null
          client_id: string
          created_by: string | null
          duration_ms: number | null
          executed_at: string
          id: string
          payload: Json
          proyecto_id: string
          report_type: string
          report_type_label: string | null
          started_at: string | null
        }
        Insert: {
          agent_status?: string | null
          brand_name?: string | null
          client_id: string
          created_by?: string | null
          duration_ms?: number | null
          executed_at?: string
          id?: string
          payload?: Json
          proyecto_id: string
          report_type: string
          report_type_label?: string | null
          started_at?: string | null
        }
        Update: {
          agent_status?: string | null
          brand_name?: string | null
          client_id?: string
          created_by?: string | null
          duration_ms?: number | null
          executed_at?: string
          id?: string
          payload?: Json
          proyecto_id?: string
          report_type?: string
          report_type_label?: string | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_lab_report_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_lab_report_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_lab_report_runs_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_lab_report_runs_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      seo_strategies: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          end_date: string
          fase: string
          id: string
          is_active: boolean | null
          name: string
          objectives_notes: string | null
          proyecto_id: string
          siblings_link_count: number | null
          start_date: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date: string
          fase?: string
          id?: string
          is_active?: boolean | null
          name: string
          objectives_notes?: string | null
          proyecto_id: string
          siblings_link_count?: number | null
          start_date: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          fase?: string
          id?: string
          is_active?: boolean | null
          name?: string
          objectives_notes?: string | null
          proyecto_id?: string
          siblings_link_count?: number | null
          start_date?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_strategies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_strategies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_strategies_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_strategies_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      smart_report_data_brand_competition: {
        Row: {
          brand_slug: string
          client_id: string
          country: string
          created_at: string
          data_source: string[]
          fetched_at: string
          history_payload: Json
          id: string
          overview_payload: Json
          proyecto_id: string
          range_label: string
          request_key: string
          request_payload: Json
          response_time_ms: number | null
          scope: string
          tier: string
          updated_at: string
          warning: string | null
        }
        Insert: {
          brand_slug: string
          client_id: string
          country: string
          created_at?: string
          data_source?: string[]
          fetched_at?: string
          history_payload: Json
          id?: string
          overview_payload: Json
          proyecto_id: string
          range_label?: string
          request_key: string
          request_payload: Json
          response_time_ms?: number | null
          scope?: string
          tier?: string
          updated_at?: string
          warning?: string | null
        }
        Update: {
          brand_slug?: string
          client_id?: string
          country?: string
          created_at?: string
          data_source?: string[]
          fetched_at?: string
          history_payload?: Json
          id?: string
          overview_payload?: Json
          proyecto_id?: string
          range_label?: string
          request_key?: string
          request_payload?: Json
          response_time_ms?: number | null
          scope?: string
          tier?: string
          updated_at?: string
          warning?: string | null
        }
        Relationships: []
      }
      smart_report_data_cache: {
        Row: {
          ahrefs_payload: Json | null
          ai_citations_payload: Json | null
          ai_section_summaries: Json | null
          client_id: string
          compare_period_end: string
          compare_period_start: string
          created_at: string
          fetched_at: string
          ga4_payload: Json | null
          gsc_payload: Json
          id: string
          period_end: string
          period_start: string
          proyecto_id: string
          site_url: string
          updated_at: string
        }
        Insert: {
          ahrefs_payload?: Json | null
          ai_citations_payload?: Json | null
          ai_section_summaries?: Json | null
          client_id: string
          compare_period_end: string
          compare_period_start: string
          created_at?: string
          fetched_at?: string
          ga4_payload?: Json | null
          gsc_payload: Json
          id?: string
          period_end: string
          period_start: string
          proyecto_id: string
          site_url: string
          updated_at?: string
        }
        Update: {
          ahrefs_payload?: Json | null
          ai_citations_payload?: Json | null
          ai_section_summaries?: Json | null
          client_id?: string
          compare_period_end?: string
          compare_period_start?: string
          created_at?: string
          fetched_at?: string
          ga4_payload?: Json | null
          gsc_payload?: Json
          id?: string
          period_end?: string
          period_start?: string
          proyecto_id?: string
          site_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      strategy_allowed_anchors: {
        Row: {
          anchor_text_value: string
          created_at: string | null
          distribution_id: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          anchor_text_value: string
          created_at?: string | null
          distribution_id: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          anchor_text_value?: string
          created_at?: string | null
          distribution_id?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_allowed_anchors_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "strategy_anchor_distribution"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_anchor_distribution: {
        Row: {
          anchor_type: Database["public"]["Enums"]["anchor_type_enum"]
          created_at: string | null
          id: string
          strategy_id: string
          target_percentage: number
        }
        Insert: {
          anchor_type: Database["public"]["Enums"]["anchor_type_enum"]
          created_at?: string | null
          id?: string
          strategy_id: string
          target_percentage: number
        }
        Update: {
          anchor_type?: Database["public"]["Enums"]["anchor_type_enum"]
          created_at?: string | null
          id?: string
          strategy_id?: string
          target_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategy_anchor_distribution_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "seo_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_keyword_objectives: {
        Row: {
          created_at: string | null
          id: string
          initial_position: number | null
          keyword_id: string
          status: string | null
          strategy_id: string
          strategy_type: Database["public"]["Enums"]["keyword_strategy_type"]
          target_date: string | null
          target_position: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          initial_position?: number | null
          keyword_id: string
          status?: string | null
          strategy_id: string
          strategy_type: Database["public"]["Enums"]["keyword_strategy_type"]
          target_date?: string | null
          target_position?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          initial_position?: number | null
          keyword_id?: string
          status?: string | null
          strategy_id?: string
          strategy_type?: Database["public"]["Enums"]["keyword_strategy_type"]
          target_date?: string | null
          target_position?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_keyword_objectives_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keyword_research_approved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_keyword_objectives_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "seo_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_verticals: {
        Row: {
          anchor_text: string | null
          created_at: string | null
          id: string
          main_keyword: string | null
          pillar_level: string | null
          priority: number | null
          search_volume: string | null
          strategy_id: string
          target_url: string | null
          type: string | null
          updated_at: string | null
          vertical_name: string
        }
        Insert: {
          anchor_text?: string | null
          created_at?: string | null
          id?: string
          main_keyword?: string | null
          pillar_level?: string | null
          priority?: number | null
          search_volume?: string | null
          strategy_id: string
          target_url?: string | null
          type?: string | null
          updated_at?: string | null
          vertical_name: string
        }
        Update: {
          anchor_text?: string | null
          created_at?: string | null
          id?: string
          main_keyword?: string | null
          pillar_level?: string | null
          priority?: number | null
          search_volume?: string | null
          strategy_id?: string
          target_url?: string | null
          type?: string | null
          updated_at?: string | null
          vertical_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_verticals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "seo_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      style_guides: {
        Row: {
          activo: boolean
          content: string
          created_at: string
          created_by: string | null
          id: string
          notas: string | null
          proyecto_id: string
          updated_at: string
          version: number
        }
        Insert: {
          activo?: boolean
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          notas?: string | null
          proyecto_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          activo?: boolean
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notas?: string | null
          proyecto_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "style_guides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "style_guides_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "style_guides_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      subcategorias: {
        Row: {
          categoria_id: number | null
          created_at: string | null
          id: number
          nombre: string
        }
        Insert: {
          categoria_id?: number | null
          created_at?: string | null
          id?: number
          nombre: string
        }
        Update: {
          categoria_id?: number | null
          created_at?: string | null
          id?: number
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          blocked_task_id: string
          blocker_task_id: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          blocked_task_id: string
          blocker_task_id: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          blocked_task_id?: string
          blocker_task_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_blocked_task_id_fkey"
            columns: ["blocked_task_id"]
            isOneToOne: false
            referencedRelation: "clickup_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_blocked_task_id_fkey"
            columns: ["blocked_task_id"]
            isOneToOne: false
            referencedRelation: "view_salud_tablero"
            referencedColumns: ["tarea_id"]
          },
          {
            foreignKeyName: "task_dependencies_blocker_task_id_fkey"
            columns: ["blocker_task_id"]
            isOneToOne: false
            referencedRelation: "clickup_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_blocker_task_id_fkey"
            columns: ["blocker_task_id"]
            isOneToOne: false
            referencedRelation: "view_salud_tablero"
            referencedColumns: ["tarea_id"]
          },
          {
            foreignKeyName: "task_dependencies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notifications: {
        Row: {
          client_id: string
          created_at: string
          event_type: string
          id: string
          is_read: boolean
          message: string
          payload: Json | null
          proyecto_id: string
          read_at: string | null
          recipient_user_id: string
          task_id: string
          title: string
          triggered_by_user_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          event_type: string
          id?: string
          is_read?: boolean
          message: string
          payload?: Json | null
          proyecto_id: string
          read_at?: string | null
          recipient_user_id: string
          task_id: string
          title: string
          triggered_by_user_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          event_type?: string
          id?: string
          is_read?: boolean
          message?: string
          payload?: Json | null
          proyecto_id?: string
          read_at?: string | null
          recipient_user_id?: string
          task_id?: string
          title?: string
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notifications_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notifications_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "task_notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_notifications_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_priorities: {
        Row: {
          color: string
          id: number
          name: string
          order_level: number
        }
        Insert: {
          color: string
          id?: number
          name: string
          order_level: number
        }
        Update: {
          color?: string
          id?: number
          name?: string
          order_level?: number
        }
        Relationships: []
      }
      task_statuses: {
        Row: {
          color: string | null
          id: number
          name: string
          orden: number | null
        }
        Insert: {
          color?: string | null
          id?: number
          name: string
          orden?: number | null
        }
        Update: {
          color?: string | null
          id?: number
          name?: string
          orden?: number | null
        }
        Relationships: []
      }
      team_member_skills: {
        Row: {
          created_at: string | null
          id: string
          proficiency_level: number | null
          skill_id: string | null
          team_member_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          proficiency_level?: number | null
          skill_id?: string | null
          team_member_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          proficiency_level?: number | null
          skill_id?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_member_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "team_skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_skills_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members_archived"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members_archived: {
        Row: {
          agency_role_id: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          slack_id: string | null
          updated_at: string | null
        }
        Insert: {
          agency_role_id?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          slack_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_role_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          slack_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_agency_role_id_fkey"
            columns: ["agency_role_id"]
            isOneToOne: false
            referencedRelation: "agency_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members_backup_20241012: {
        Row: {
          agency_role_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          phone: string | null
          slack_id: string | null
          updated_at: string | null
        }
        Insert: {
          agency_role_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          slack_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_role_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          slack_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_profile_documents: {
        Row: {
          allowed_roles: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          document_url: string | null
          file_url: string | null
          icon_color: string | null
          id: string
          is_active: boolean | null
          section: string
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          allowed_roles?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          document_url?: string | null
          file_url?: string | null
          icon_color?: string | null
          id?: string
          is_active?: boolean | null
          section?: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          allowed_roles?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          document_url?: string | null
          file_url?: string | null
          icon_color?: string | null
          id?: string
          is_active?: boolean | null
          section?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_profile_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_profile_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          role_key: string
          role_name_en: string
          role_name_es: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          role_key: string
          role_name_en: string
          role_name_es?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          role_key?: string
          role_name_en?: string
          role_name_es?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_skills: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      ticket_hub_alerts: {
        Row: {
          alert_level: number
          assignee_id: string | null
          attention_reason: string | null
          consecutive_days_attention: number
          created_at: string
          first_detected_at: string
          is_active: boolean
          last_alert_level_sent: number
          last_evaluated_on: string | null
          last_notified_at: string | null
          proyecto_id: string | null
          resolved_at: string | null
          slack_channel_id: string | null
          ticket_id: number
          updated_at: string
        }
        Insert: {
          alert_level?: number
          assignee_id?: string | null
          attention_reason?: string | null
          consecutive_days_attention?: number
          created_at?: string
          first_detected_at?: string
          is_active?: boolean
          last_alert_level_sent?: number
          last_evaluated_on?: string | null
          last_notified_at?: string | null
          proyecto_id?: string | null
          resolved_at?: string | null
          slack_channel_id?: string | null
          ticket_id: number
          updated_at?: string
        }
        Update: {
          alert_level?: number
          assignee_id?: string | null
          attention_reason?: string | null
          consecutive_days_attention?: number
          created_at?: string
          first_detected_at?: string
          is_active?: boolean
          last_alert_level_sent?: number
          last_evaluated_on?: string | null
          last_notified_at?: string | null
          proyecto_id?: string | null
          resolved_at?: string | null
          slack_channel_id?: string | null
          ticket_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_hub_alerts_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_hub_alerts_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_hub_alerts_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "ticket_hub_alerts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_hub_alerts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "v_ticket_hub_attention"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      tickets: {
        Row: {
          ai_analysis_notes: string | null
          ai_calculated_priority: string | null
          ai_suggested_priority: string | null
          ai_suggested_response: string | null
          ai_validation_status: string | null
          archived: boolean | null
          assignee_id: string | null
          attachment_download_link: string | null
          attachment_drive_file_id: string | null
          attachment_view_link: string | null
          category: string | null
          client_id: string | null
          created_at: string | null
          expected_date: string | null
          file_urls: string[] | null
          first_response_at: string | null
          id: number
          language: string | null
          last_notification_sent_at: string | null
          linked_task_id: string | null
          priority: string | null
          proyecto_id: string | null
          status: string | null
          ticket_description: string | null
          ticket_id: string
          ticket_subject: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ai_analysis_notes?: string | null
          ai_calculated_priority?: string | null
          ai_suggested_priority?: string | null
          ai_suggested_response?: string | null
          ai_validation_status?: string | null
          archived?: boolean | null
          assignee_id?: string | null
          attachment_download_link?: string | null
          attachment_drive_file_id?: string | null
          attachment_view_link?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          expected_date?: string | null
          file_urls?: string[] | null
          first_response_at?: string | null
          id?: number
          language?: string | null
          last_notification_sent_at?: string | null
          linked_task_id?: string | null
          priority?: string | null
          proyecto_id?: string | null
          status?: string | null
          ticket_description?: string | null
          ticket_id: string
          ticket_subject: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ai_analysis_notes?: string | null
          ai_calculated_priority?: string | null
          ai_suggested_priority?: string | null
          ai_suggested_response?: string | null
          ai_validation_status?: string | null
          archived?: boolean | null
          assignee_id?: string | null
          attachment_download_link?: string | null
          attachment_drive_file_id?: string | null
          attachment_view_link?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          expected_date?: string | null
          file_urls?: string[] | null
          first_response_at?: string | null
          id?: number
          language?: string | null
          last_notification_sent_at?: string | null
          linked_task_id?: string | null
          priority?: string | null
          proyecto_id?: string | null
          status?: string | null
          ticket_description?: string | null
          ticket_id?: string
          ticket_subject?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "clickup_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "view_salud_tablero"
            referencedColumns: ["tarea_id"]
          },
          {
            foreignKeyName: "tickets_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          description: string | null
          duration: number | null
          end_time: string | null
          id: string
          is_billable: boolean
          manual_entry: boolean
          start_time: string
          tags: Json | null
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration?: number | null
          end_time?: string | null
          id?: string
          is_billable?: boolean
          manual_entry?: boolean
          start_time: string
          tags?: Json | null
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration?: number | null
          end_time?: string | null
          id?: string
          is_billable?: boolean
          manual_entry?: boolean
          start_time?: string
          tags?: Json | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "clickup_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "view_salud_tablero"
            referencedColumns: ["tarea_id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_categories: {
        Row: {
          anchor_text: string | null
          category_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          main_keyword_id: string | null
          name: string
          proyecto_id: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          anchor_text?: string | null
          category_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          main_keyword_id?: string | null
          name: string
          proyecto_id?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          anchor_text?: string | null
          category_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          main_keyword_id?: string | null
          name?: string
          proyecto_id?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_categories_main_keyword_id_fkey"
            columns: ["main_keyword_id"]
            isOneToOne: false
            referencedRelation: "keyword_research"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_categories_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_categories_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      user_notification_settings: {
        Row: {
          enabled: boolean
          module: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          module: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          module?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          permissions: Json
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          client_id: string | null
          phone_number: string
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          phone_number: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          phone_number?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_weekly_summaries: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          summary_content: string
          tasks_data: Json | null
          user_id: string
          week_of: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          summary_content: string
          tasks_data?: Json | null
          user_id: string
          week_of?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          summary_content?: string
          tasks_data?: Json | null
          user_id?: string
          week_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_weekly_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          agency_role_id: string | null
          avatar_style_id: string | null
          bio: string | null
          created_at: string
          email: string
          full_name: string | null
          gender: string | null
          id: string
          password_hash: string
          phone: string | null
          photo_url: string | null
          role_id: string
          slack_id: string | null
        }
        Insert: {
          agency_role_id?: string | null
          avatar_style_id?: string | null
          bio?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          gender?: string | null
          id?: string
          password_hash: string
          phone?: string | null
          photo_url?: string | null
          role_id: string
          slack_id?: string | null
        }
        Update: {
          agency_role_id?: string | null
          avatar_style_id?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          gender?: string | null
          id?: string
          password_hash?: string
          phone?: string | null
          photo_url?: string | null
          role_id?: string
          slack_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          allowed_roles: string[] | null
          category: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          language: string | null
          proyecto_id: string | null
          sort_order: number | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_type: string | null
          youtube_id: string
          youtube_url: string
        }
        Insert: {
          allowed_roles?: string[] | null
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          language?: string | null
          proyecto_id?: string | null
          sort_order?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_type?: string | null
          youtube_id: string
          youtube_url: string
        }
        Update: {
          allowed_roles?: string[] | null
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          language?: string | null
          proyecto_id?: string | null
          sort_order?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_type?: string | null
          youtube_id?: string
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_videos_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_videos_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_videos_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_videos_proyecto"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "videos_language_fkey"
            columns: ["language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
        ]
      }
      wordpress_credentials: {
        Row: {
          created_at: string | null
          default_category_slug: string | null
          id: string
          is_active: boolean | null
          marca: string
          notes: string | null
          updated_at: string | null
          wp_app_password: string
          wp_domain: string
          wp_username: string
        }
        Insert: {
          created_at?: string | null
          default_category_slug?: string | null
          id?: string
          is_active?: boolean | null
          marca: string
          notes?: string | null
          updated_at?: string | null
          wp_app_password: string
          wp_domain: string
          wp_username: string
        }
        Update: {
          created_at?: string | null
          default_category_slug?: string | null
          id?: string
          is_active?: boolean | null
          marca?: string
          notes?: string | null
          updated_at?: string | null
          wp_app_password?: string
          wp_domain?: string
          wp_username?: string
        }
        Relationships: []
      }
      wordpress_publication_logs: {
        Row: {
          attempted_at: string | null
          content_item_id: string
          error_message: string | null
          id: string
          marca: string
          published_at: string | null
          request_payload: Json | null
          response_data: Json | null
          retry_count: number | null
          status: string
          wp_post_id: number | null
        }
        Insert: {
          attempted_at?: string | null
          content_item_id: string
          error_message?: string | null
          id?: string
          marca: string
          published_at?: string | null
          request_payload?: Json | null
          response_data?: Json | null
          retry_count?: number | null
          status?: string
          wp_post_id?: number | null
        }
        Update: {
          attempted_at?: string | null
          content_item_id?: string
          error_message?: string | null
          id?: string
          marca?: string
          published_at?: string | null
          request_payload?: Json | null
          response_data?: Json | null
          retry_count?: number | null
          status?: string
          wp_post_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_publication_logs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_publication_logs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_publication_logs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wordpress_publication_logs_marca_fkey"
            columns: ["marca"]
            isOneToOne: false
            referencedRelation: "wordpress_credentials"
            referencedColumns: ["marca"]
          },
        ]
      }
      workspace_brands: {
        Row: {
          created_at: string | null
          id: string
          order_index: number | null
          proyecto_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_index?: number | null
          proyecto_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_index?: number | null
          proyecto_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_brands_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_brands_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "workspace_brands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string
          description: string | null
          icon: string | null
          id: string
          name: string
          order_index: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          order_index?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      writing_guides: {
        Row: {
          archivo_url: string | null
          created_at: string | null
          descripcion: string | null
          document_url: string | null
          id: string
          is_active: boolean | null
          nombre: string | null
          nombre_archivo: string | null
          proyecto_id: string | null
          tamano_archivo: number | null
          tipo_archivo: string | null
          updated_at: string | null
        }
        Insert: {
          archivo_url?: string | null
          created_at?: string | null
          descripcion?: string | null
          document_url?: string | null
          id: string
          is_active?: boolean | null
          nombre?: string | null
          nombre_archivo?: string | null
          proyecto_id?: string | null
          tamano_archivo?: number | null
          tipo_archivo?: string | null
          updated_at?: string | null
        }
        Update: {
          archivo_url?: string | null
          created_at?: string | null
          descripcion?: string | null
          document_url?: string | null
          id?: string
          is_active?: boolean | null
          nombre?: string | null
          nombre_archivo?: string | null
          proyecto_id?: string | null
          tamano_archivo?: number | null
          tipo_archivo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "writing_guides_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_guides_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
    }
    Views: {
      admin_payments_view: {
        Row: {
          applied_rate: number | null
          concept_title: string | null
          created_at: string | null
          currency: string | null
          freelancer_avatar: string | null
          freelancer_name: string | null
          payment_id: string | null
          production_date: string | null
          quantity: number | null
          service_type: string | null
          status: string | null
          total_amount: number | null
          unit: string | null
        }
        Relationships: []
      }
      agency_operating_now: {
        Row: {
          bogota_date: string | null
          checked_at_bogota: string | null
          checked_at_utc: string | null
          is_working_day: boolean | null
          operational_timezone: string | null
          reason: string | null
        }
        Relationships: []
      }
      ahrefs_complete_analyses: {
        Row: {
          ai_overview_paginas: number | null
          ai_overview_valor: number | null
          backlinks_count: number | null
          chatgpt_paginas: number | null
          chatgpt_valor: number | null
          client_name: string | null
          cliente_id: string | null
          copilot_paginas: number | null
          copilot_valor: number | null
          created_at: string | null
          domain_rating: number | null
          dominios_referentes: number | null
          fecha_registro: string | null
          gemini_paginas: number | null
          gemini_valor: number | null
          keywords_organicas: number | null
          periodo_desde: string | null
          periodo_hasta: string | null
          perplexity_paginas: number | null
          perplexity_valor: number | null
          proyecto_id: string | null
          shared_analysis_id: string | null
          top3_keywords: number | null
          total_backlinks_historico: number | null
          total_dominios_referentes_historico: number | null
          trafico_organico: number | null
          url_rating: number | null
          valor_trafico: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backlinks_metrics_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlinks_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlinks_metrics_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      awa_analysis_runs: {
        Row: {
          agent_0_completed_at: string | null
          agent_1_completed_at: string | null
          agent_2_completed_at: string | null
          agent_3a_completed_at: string | null
          agent_3b_completed_at: string | null
          agent_3c_completed_at: string | null
          agent_4_completed_at: string | null
          agent_5_completed_at: string | null
          agent_6_completed_at: string | null
          client_id: string | null
          completed_at: string | null
          domain: string | null
          error_message: string | null
          id: string | null
          last_heartbeat_at: string | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_0_completed_at?: string | null
          agent_1_completed_at?: string | null
          agent_2_completed_at?: string | null
          agent_3a_completed_at?: string | null
          agent_3b_completed_at?: string | null
          agent_3c_completed_at?: string | null
          agent_4_completed_at?: string | null
          agent_5_completed_at?: string | null
          agent_6_completed_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          domain?: string | null
          error_message?: string | null
          id?: string | null
          last_heartbeat_at?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_0_completed_at?: string | null
          agent_1_completed_at?: string | null
          agent_2_completed_at?: string | null
          agent_3a_completed_at?: string | null
          agent_3b_completed_at?: string | null
          agent_3c_completed_at?: string | null
          agent_4_completed_at?: string | null
          agent_5_completed_at?: string | null
          agent_6_completed_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          domain?: string | null
          error_message?: string | null
          id?: string | null
          last_heartbeat_at?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      awa_ingestion_batches: {
        Row: {
          attempt_no: number | null
          batch_status: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          dataset: string | null
          error_message: string | null
          id: string | null
          payload_checksum: string | null
          records_expected: number | null
          records_inserted: number | null
          records_received: number | null
          records_rejected: number | null
          records_updated: number | null
          request_params: Json | null
          response_meta: Json | null
          run_id: string | null
          source_system: string | null
          started_at: string | null
          updated_at: string | null
        }
        Insert: {
          attempt_no?: number | null
          batch_status?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          dataset?: string | null
          error_message?: string | null
          id?: string | null
          payload_checksum?: string | null
          records_expected?: number | null
          records_inserted?: number | null
          records_received?: number | null
          records_rejected?: number | null
          records_updated?: number | null
          request_params?: Json | null
          response_meta?: Json | null
          run_id?: string | null
          source_system?: string | null
          started_at?: string | null
          updated_at?: string | null
        }
        Update: {
          attempt_no?: number | null
          batch_status?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          dataset?: string | null
          error_message?: string | null
          id?: string | null
          payload_checksum?: string | null
          records_expected?: number | null
          records_inserted?: number | null
          records_received?: number | null
          records_rejected?: number | null
          records_updated?: number | null
          request_params?: Json | null
          response_meta?: Json | null
          run_id?: string | null
          source_system?: string | null
          started_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      awa_referring_domains: {
        Row: {
          backlinks_count: number | null
          captured_at: string | null
          client_id: string | null
          domain: string | null
          domain_rating: number | null
          first_seen: string | null
          id: string | null
          ingestion_batch_id: string | null
          is_dofollow: boolean | null
          is_lost: boolean | null
          lost_at: string | null
          referring_domain: string | null
          run_id: string | null
        }
        Insert: {
          backlinks_count?: number | null
          captured_at?: string | null
          client_id?: string | null
          domain?: string | null
          domain_rating?: number | null
          first_seen?: string | null
          id?: string | null
          ingestion_batch_id?: string | null
          is_dofollow?: boolean | null
          is_lost?: boolean | null
          lost_at?: string | null
          referring_domain?: string | null
          run_id?: string | null
        }
        Update: {
          backlinks_count?: number | null
          captured_at?: string | null
          client_id?: string | null
          domain?: string | null
          domain_rating?: number | null
          first_seen?: string | null
          id?: string | null
          ingestion_batch_id?: string | null
          is_dofollow?: boolean | null
          is_lost?: boolean | null
          lost_at?: string | null
          referring_domain?: string | null
          run_id?: string | null
        }
        Relationships: []
      }
      awa_run_agent_steps: {
        Row: {
          agent_name: string | null
          attempt_no: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string | null
          metrics: Json | null
          run_id: string | null
          started_at: string | null
          step_status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          attempt_no?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          metrics?: Json | null
          run_id?: string | null
          started_at?: string | null
          step_status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          attempt_no?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          metrics?: Json | null
          run_id?: string | null
          started_at?: string | null
          step_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      awa_serp_overview: {
        Row: {
          captured_at: string | null
          client_id: string | null
          domain: string | null
          domain_rating: number | null
          estimated_traffic: number | null
          id: string | null
          ingestion_batch_id: string | null
          is_client_domain: boolean | null
          keyword: string | null
          result_domain: string | null
          result_url: string | null
          run_id: string | null
          serp_position: number | null
        }
        Insert: {
          captured_at?: string | null
          client_id?: string | null
          domain?: string | null
          domain_rating?: number | null
          estimated_traffic?: number | null
          id?: string | null
          ingestion_batch_id?: string | null
          is_client_domain?: boolean | null
          keyword?: string | null
          result_domain?: string | null
          result_url?: string | null
          run_id?: string | null
          serp_position?: number | null
        }
        Update: {
          captured_at?: string | null
          client_id?: string | null
          domain?: string | null
          domain_rating?: number | null
          estimated_traffic?: number | null
          id?: string | null
          ingestion_batch_id?: string | null
          is_client_domain?: boolean | null
          keyword?: string | null
          result_domain?: string | null
          result_url?: string | null
          run_id?: string | null
          serp_position?: number | null
        }
        Relationships: []
      }
      awa_site_audit_issues: {
        Row: {
          affected_urls_count: number | null
          captured_at: string | null
          category: string | null
          client_id: string | null
          description: string | null
          domain: string | null
          id: string | null
          ingestion_batch_id: string | null
          issue_name: string | null
          issue_type: string | null
          recommended_fix: string | null
          run_id: string | null
          sample_urls: string[] | null
          severity_score: number | null
        }
        Insert: {
          affected_urls_count?: number | null
          captured_at?: string | null
          category?: string | null
          client_id?: string | null
          description?: string | null
          domain?: string | null
          id?: string | null
          ingestion_batch_id?: string | null
          issue_name?: string | null
          issue_type?: string | null
          recommended_fix?: string | null
          run_id?: string | null
          sample_urls?: string[] | null
          severity_score?: number | null
        }
        Update: {
          affected_urls_count?: number | null
          captured_at?: string | null
          category?: string | null
          client_id?: string | null
          description?: string | null
          domain?: string | null
          id?: string | null
          ingestion_batch_id?: string | null
          issue_name?: string | null
          issue_type?: string | null
          recommended_fix?: string | null
          run_id?: string | null
          sample_urls?: string[] | null
          severity_score?: number | null
        }
        Relationships: []
      }
      awa_site_overview: {
        Row: {
          ahrefs_rank: number | null
          backlinks_total: number | null
          captured_at: string | null
          client_id: string | null
          domain: string | null
          domain_rating: number | null
          id: string | null
          ingestion_batch_id: string | null
          organic_keywords: number | null
          organic_traffic: number | null
          referring_domains: number | null
          run_id: string | null
          traffic_value: number | null
          url_rating: number | null
        }
        Insert: {
          ahrefs_rank?: number | null
          backlinks_total?: number | null
          captured_at?: string | null
          client_id?: string | null
          domain?: string | null
          domain_rating?: number | null
          id?: string | null
          ingestion_batch_id?: string | null
          organic_keywords?: number | null
          organic_traffic?: number | null
          referring_domains?: number | null
          run_id?: string | null
          traffic_value?: number | null
          url_rating?: number | null
        }
        Update: {
          ahrefs_rank?: number | null
          backlinks_total?: number | null
          captured_at?: string | null
          client_id?: string | null
          domain?: string | null
          domain_rating?: number | null
          id?: string | null
          ingestion_batch_id?: string | null
          organic_keywords?: number | null
          organic_traffic?: number | null
          referring_domains?: number | null
          run_id?: string | null
          traffic_value?: number | null
          url_rating?: number | null
        }
        Relationships: []
      }
      awa_v_active_run_watchlist: {
        Row: {
          client_id: string | null
          client_name: string | null
          domain: string | null
          failed_agent_steps: number | null
          failed_ingestion_batches: number | null
          heartbeat_state: string | null
          last_heartbeat_at: string | null
          retry_count: number | null
          run_id: string | null
          running_agent_steps: number | null
          running_ingestion_batches: number | null
          started_at: string | null
          status: string | null
        }
        Relationships: []
      }
      awa_v_latest_readiness_snapshot: {
        Row: {
          captured_at: string | null
          failed_checks: number | null
          findings: Json | null
          passed_checks: number | null
          readiness_status: string | null
          snapshot_scope: string | null
          summary: string | null
          warning_checks: number | null
        }
        Relationships: []
      }
      awa_v_reporting_readiness: {
        Row: {
          client_id: string | null
          client_name: string | null
          diagnosis_status: string | null
          domain: string | null
          generated_reports: number | null
          reporting_readiness_state: string | null
          run_id: string | null
          run_status: string | null
          usable_findings: number | null
          usable_recovery_actions: number | null
        }
        Relationships: []
      }
      awa_v_run_reporting_summary: {
        Row: {
          client_id: string | null
          client_name: string | null
          confidence_band: string | null
          diagnosis_id: string | null
          diagnosis_status: string | null
          domain: string | null
          finding_count: number | null
          latest_report_generated_at: string | null
          latest_report_published_at: string | null
          primary_cause: string | null
          primary_cause_probability: number | null
          recovery_action_count: number | null
          report_count: number | null
          run_id: string | null
          run_status: string | null
          validated_finding_count: number | null
        }
        Relationships: []
      }
      client_requests_attention: {
        Row: {
          assigned_to: string | null
          attention_reason: string | null
          blocked_reason: string | null
          created_by: string | null
          days_overdue: number | null
          days_waiting: number | null
          escalation_level: number | null
          expected_date: string | null
          follow_up_count: number | null
          id: string | null
          last_attention_notified_at: string | null
          last_message_at: string | null
          next_follow_up_at: string | null
          priority: string | null
          request_name: string | null
          snoozed_until: string | null
          status: string | null
          updated_at: string | null
          waiting_since: string | null
        }
        Insert: {
          assigned_to?: string | null
          attention_reason?: never
          blocked_reason?: string | null
          created_by?: string | null
          days_overdue?: never
          days_waiting?: never
          escalation_level?: number | null
          expected_date?: string | null
          follow_up_count?: number | null
          id?: string | null
          last_attention_notified_at?: string | null
          last_message_at?: string | null
          next_follow_up_at?: string | null
          priority?: string | null
          request_name?: string | null
          snoozed_until?: string | null
          status?: string | null
          updated_at?: string | null
          waiting_since?: string | null
        }
        Update: {
          assigned_to?: string | null
          attention_reason?: never
          blocked_reason?: string | null
          created_by?: string | null
          days_overdue?: never
          days_waiting?: never
          escalation_level?: number | null
          expected_date?: string | null
          follow_up_count?: number | null
          id?: string | null
          last_attention_notified_at?: string | null
          last_message_at?: string | null
          next_follow_up_at?: string | null
          priority?: string | null
          request_name?: string | null
          snoozed_until?: string | null
          status?: string | null
          updated_at?: string | null
          waiting_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_assigned_to_fkey1"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_created_by_fkey1"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_dashboard_stats: {
        Row: {
          avg_keyword_difficulty: number | null
          avg_search_volume: number | null
          avg_word_count: number | null
          client_id: string | null
          expired_count: number | null
          expiring_soon_count: number | null
          in_progress_count: number | null
          pending_review_count: number | null
          published_count: number | null
          total_content: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      content_full_view: {
        Row: {
          author_id: string | null
          author_name: string | null
          brief_url: string | null
          category_id: string | null
          category_name: string | null
          client_approval_status: string | null
          client_id: string | null
          client_name: string | null
          content_doc_url: string | null
          content_score: number | null
          content_type: string | null
          created_at: string | null
          created_by: string | null
          custom_metadata: Json | null
          editor_id: string | null
          editor_name: string | null
          expiration_date: string | null
          expiration_notification_sent: boolean | null
          final_published_url: string | null
          id: string | null
          is_latest_version: boolean | null
          keyword_difficulty: number | null
          last_modified_by: string | null
          last_reminder_date: string | null
          main_keyword: string | null
          meta_description: string | null
          og_image_url: string | null
          parent_version_id: string | null
          pending_comments_count: number | null
          pending_tasks_count: number | null
          project_name: string | null
          proyecto_id: string | null
          publication_date: string | null
          published_at: string | null
          published_by: string | null
          reading_time: number | null
          reminder_sent_count: number | null
          reviewer_id: string | null
          reviewer_name: string | null
          scheduled_date: string | null
          search_volume: number | null
          secondary_keywords: string[] | null
          slug: string | null
          staging_url: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          validation_deadline: string | null
          validation_status: string | null
          version: number | null
          word_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "content_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_last_modified_by_fkey"
            columns: ["last_modified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "content_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "vw_content_validation_pending"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
          {
            foreignKeyName: "content_items_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_dashboard: {
        Row: {
          completed_at: string | null
          current_stage: string | null
          duration_ms: number | null
          elements_added: Json | null
          error_message: string | null
          run_id: string | null
          slug: string | null
          status: string | null
          title: string | null
          triggered_at: string | null
          word_count_after: number | null
          word_count_before: number | null
        }
        Relationships: []
      }
      ils_dashboard: {
        Row: {
          brand_name: string | null
          candidates_count: number | null
          completed_at: string | null
          decisions_count: number | null
          duration_ms: number | null
          editorial_summary: string | null
          error_message: string | null
          final_published_url: string | null
          run_id: string | null
          slug: string | null
          status: string | null
          title: string | null
          triggered_at: string | null
          universe_size: number | null
        }
        Relationships: []
      }
      notifications_delivery_operating_gate: {
        Row: {
          active_or_pending_notifications: number | null
          bogota_date: string | null
          checked_at_bogota: string | null
          checked_at_utc: string | null
          delivery_gate_status: string | null
          delivery_instruction: string | null
          failed_notifications: number | null
          is_working_day: boolean | null
          reason: string | null
        }
        Relationships: []
      }
      notifications_outbox_pending: {
        Row: {
          attempts: number | null
          created_at: string | null
          id: string | null
          last_error: string | null
          metadata: Json | null
          next_try_at: string | null
          payload: Json | null
          priority: number | null
          scheduled_for: string | null
          sent_at: string | null
          source: string | null
          status: string | null
          target_id: string | null
          target_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          id?: string | null
          last_error?: string | null
          metadata?: Json | null
          next_try_at?: string | null
          payload?: Json | null
          priority?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          source?: string | null
          status?: string | null
          target_id?: string | null
          target_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          id?: string | null
          last_error?: string | null
          metadata?: Json | null
          next_try_at?: string | null
          payload?: Json | null
          priority?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          source?: string | null
          status?: string | null
          target_id?: string | null
          target_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_keyword_reserve_status: {
        Row: {
          alert_level: number | null
          contenido_id: string | null
          director_id: string | null
          keywords_disponibles: number | null
          keywords_faltantes: number | null
          last_alert_at: string | null
          last_keyword_count: number | null
          lider_id: string | null
          nombremarca: string | null
          proyecto_id: string | null
          reserve_status: string | null
          seoestrategista_id: string | null
          slack_channel_id: string | null
          snooze_until: string | null
          target: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proyectos_seo_contenido_id_fkey"
            columns: ["contenido_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_seo_seoestrategista_id_fkey"
            columns: ["seoestrategista_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ticket_hub_attention: {
        Row: {
          archived: boolean | null
          assignee_id: string | null
          assignee_slack_id: string | null
          attention_reason: string | null
          client_id: string | null
          created_at: string | null
          days_since_update: number | null
          director_slack_id: string | null
          first_response_at: string | null
          hours_since_created: number | null
          language: string | null
          priority: string | null
          project_slack_channel: string | null
          proyecto_id: string | null
          status: string | null
          ticket_display_id: string | null
          ticket_id: number | null
          ticket_subject: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos_seo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "v_keyword_reserve_status"
            referencedColumns: ["proyecto_id"]
          },
        ]
      }
      view_salud_tablero: {
        Row: {
          canal_slack_proyecto: string | null
          diagnostico: string | null
          dias_sin_movimiento: number | null
          estado_actual: string | null
          fecha_vencimiento: string | null
          proyecto_nombre: string | null
          responsable_id: string | null
          tarea_id: string | null
          tarea_nombre: string | null
        }
        Relationships: []
      }
      vw_content_validation_pending: {
        Row: {
          author_name: string | null
          client_name: string | null
          content_uploaded_at: string | null
          days_remaining: number | null
          id: string | null
          notifications_sent: number | null
          priority_status: string | null
          status: string | null
          title: string | null
          validation_deadline: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _freelancer_invoice_edge_url: {
        Args: { p_slug: string }
        Returns: string
      }
      _freelancer_invoice_internal_secret: { Args: never; Returns: string }
      acknowledge_freelancer_invoice: {
        Args: { p_message?: string; p_token: string }
        Returns: Json
      }
      ahrefs_compare_latest_runs: {
        Args: { p_domain: string }
        Returns: {
          backlinks_gained: number
          backlinks_lost: number
          baseline_run_id: string
          comparison_id: string
          current_run_id: string
          organic_keywords_declined: number
          organic_keywords_gained: number
          organic_keywords_improved: number
          organic_keywords_lost: number
          referring_domains_declined: number
          referring_domains_gained: number
          referring_domains_improved: number
          referring_domains_lost: number
          top_pages_declined: number
          top_pages_gained: number
          top_pages_improved: number
          top_pages_lost: number
        }[]
      }
      ahrefs_compare_runs: {
        Args: { p_baseline_run_id: string; p_current_run_id: string }
        Returns: {
          backlinks_gained: number
          backlinks_lost: number
          comparison_id: string
          organic_keywords_declined: number
          organic_keywords_gained: number
          organic_keywords_improved: number
          organic_keywords_lost: number
          referring_domains_declined: number
          referring_domains_gained: number
          referring_domains_improved: number
          referring_domains_lost: number
          top_pages_declined: number
          top_pages_gained: number
          top_pages_improved: number
          top_pages_lost: number
        }[]
      }
      ahrefs_complete_backlinks_snapshot: {
        Args: {
          p_ahrefs_status: number
          p_client_id: string
          p_domain: string
          p_ingestion_batch_id: string
          p_rows: Json
          p_run_id: string
        }
        Returns: {
          inserted_backlinks: number
        }[]
      }
      ahrefs_complete_batch_analysis_valuation: {
        Args: {
          p_ahrefs_status: number
          p_client_id: string
          p_domain: string
          p_ingestion_batch_id: string
          p_metrics: Json
          p_run_id: string
          p_snapshot_date: string
        }
        Returns: {
          domain_rating_history_id: string
          site_overview_id: string
        }[]
      }
      ahrefs_complete_organic_keywords_snapshot: {
        Args: {
          p_ahrefs_status: number
          p_client_id: string
          p_country: string
          p_domain: string
          p_ingestion_batch_id: string
          p_rows: Json
          p_run_id: string
          p_snapshot_date: string
        }
        Returns: {
          inserted_keyword_history: number
          inserted_organic_keywords: number
        }[]
      }
      ahrefs_complete_referring_domains_snapshot: {
        Args: {
          p_ahrefs_status: number
          p_client_id: string
          p_domain: string
          p_ingestion_batch_id: string
          p_rows: Json
          p_run_id: string
        }
        Returns: {
          inserted_referring_domains: number
        }[]
      }
      ahrefs_complete_top_pages_snapshot: {
        Args: {
          p_ahrefs_status: number
          p_client_id: string
          p_country: string
          p_domain: string
          p_ingestion_batch_id: string
          p_rows: Json
          p_run_id: string
          p_snapshot_date: string
        }
        Returns: {
          inserted_top_pages: number
        }[]
      }
      ahrefs_complete_total_orchestration: {
        Args: {
          p_comparison_result: Json
          p_diagnostic_result: Json
          p_error_message?: string
          p_ingestion_results: Json
          p_orchestration_id: string
          p_recovery_plan_result: Json
          p_status: string
        }
        Returns: {
          orchestration_id: string
          orchestration_status: string
        }[]
      }
      ahrefs_complete_url_valuation: {
        Args: {
          p_ahrefs_status: number
          p_client_id: string
          p_domain: string
          p_ingestion_batch_id: string
          p_metrics: Json
          p_run_id: string
        }
        Returns: {
          site_overview_id: string
        }[]
      }
      ahrefs_dispatch_ready_analysis_requests: {
        Args: { p_limit?: number }
        Returns: {
          analysis_request_id: string
          error_message: string
          net_request_id: number
          new_status: string
          previous_status: string
        }[]
      }
      ahrefs_enqueue_url_analysis: {
        Args: {
          p_allow_partial?: boolean
          p_client_name?: string
          p_country?: string
          p_mode?: string
          p_protocol?: string
          p_row_limit?: number
          p_snapshot_date?: string
          p_target_url: string
        }
        Returns: {
          analysis_request_id: string
          request_status: string
        }[]
      }
      ahrefs_fail_backlinks_snapshot: {
        Args: {
          p_ahrefs_status: number
          p_error_message: string
          p_ingestion_batch_id: string
          p_raw_body?: string
          p_run_id: string
        }
        Returns: undefined
      }
      ahrefs_fail_batch_analysis_valuation: {
        Args: {
          p_ahrefs_status: number
          p_error_message: string
          p_ingestion_batch_id: string
          p_raw_body?: string
          p_run_id: string
        }
        Returns: undefined
      }
      ahrefs_fail_organic_keywords_snapshot: {
        Args: {
          p_ahrefs_status: number
          p_error_message: string
          p_ingestion_batch_id: string
          p_raw_body?: string
          p_run_id: string
        }
        Returns: undefined
      }
      ahrefs_fail_referring_domains_snapshot: {
        Args: {
          p_ahrefs_status: number
          p_error_message: string
          p_ingestion_batch_id: string
          p_raw_body?: string
          p_run_id: string
        }
        Returns: undefined
      }
      ahrefs_fail_top_pages_snapshot: {
        Args: {
          p_ahrefs_status: number
          p_error_message: string
          p_ingestion_batch_id: string
          p_raw_body?: string
          p_run_id: string
        }
        Returns: undefined
      }
      ahrefs_fail_total_orchestration: {
        Args: {
          p_error_message: string
          p_ingestion_results: Json
          p_orchestration_id: string
        }
        Returns: {
          orchestration_id: string
          orchestration_status: string
        }[]
      }
      ahrefs_fail_url_valuation: {
        Args: {
          p_ahrefs_status: number
          p_error_message: string
          p_ingestion_batch_id: string
          p_raw_body?: string
          p_run_id: string
        }
        Returns: undefined
      }
      ahrefs_generate_diagnostic_from_comparison: {
        Args: { p_comparison_id: string }
        Returns: {
          critical_findings: number
          diagnostic_report_id: string
          findings_created: number
          insight_findings: number
          opportunity_score: number
          overall_risk_level: string
          recommendation_findings: number
          risk_score: number
          warning_findings: number
        }[]
      }
      ahrefs_generate_latest_diagnostic: {
        Args: { p_domain: string }
        Returns: {
          comparison_id: string
          critical_findings: number
          diagnostic_report_id: string
          findings_created: number
          insight_findings: number
          opportunity_score: number
          overall_risk_level: string
          recommendation_findings: number
          risk_score: number
          warning_findings: number
        }[]
      }
      ahrefs_generate_latest_recovery_plan: {
        Args: { p_domain: string }
        Returns: {
          diagnostic_report_id: string
          findings_linked: number
          month_1_3_actions: number
          month_3_6_actions: number
          quick_win_actions: number
          recovery_actions_created: number
        }[]
      }
      ahrefs_generate_recovery_plan_from_diagnostic: {
        Args: { p_diagnostic_report_id: string }
        Returns: {
          findings_linked: number
          month_1_3_actions: number
          month_3_6_actions: number
          quick_win_actions: number
          recovery_actions_created: number
        }[]
      }
      ahrefs_init_backlinks_snapshot: {
        Args: {
          p_aggregation: string
          p_client_name: string
          p_domain: string
          p_history: string
          p_limit?: number
          p_mode: string
          p_protocol: string
          p_target_url: string
        }
        Returns: {
          client_id: string
          ingestion_batch_id: string
          run_id: string
        }[]
      }
      ahrefs_init_batch_analysis_valuation: {
        Args: {
          p_client_name: string
          p_country: string
          p_domain: string
          p_mode: string
          p_protocol: string
          p_snapshot_date: string
          p_target_url: string
        }
        Returns: {
          client_id: string
          ingestion_batch_id: string
          run_id: string
        }[]
      }
      ahrefs_init_organic_keywords_snapshot: {
        Args: {
          p_client_name: string
          p_country: string
          p_domain: string
          p_limit?: number
          p_mode: string
          p_protocol: string
          p_snapshot_date: string
          p_target_url: string
        }
        Returns: {
          client_id: string
          ingestion_batch_id: string
          run_id: string
        }[]
      }
      ahrefs_init_referring_domains_snapshot: {
        Args: {
          p_client_name: string
          p_domain: string
          p_history: string
          p_limit?: number
          p_mode: string
          p_protocol: string
          p_target_url: string
        }
        Returns: {
          client_id: string
          ingestion_batch_id: string
          run_id: string
        }[]
      }
      ahrefs_init_top_pages_snapshot: {
        Args: {
          p_client_name: string
          p_country: string
          p_domain: string
          p_limit?: number
          p_mode: string
          p_protocol: string
          p_snapshot_date: string
          p_target_url: string
        }
        Returns: {
          client_id: string
          ingestion_batch_id: string
          run_id: string
        }[]
      }
      ahrefs_init_total_orchestration: {
        Args: {
          p_allow_partial?: boolean
          p_client_name: string
          p_country: string
          p_domain: string
          p_mode: string
          p_protocol: string
          p_snapshot_date: string
          p_target_url: string
        }
        Returns: {
          orchestration_id: string
        }[]
      }
      ahrefs_init_url_valuation: {
        Args: {
          p_client_name: string
          p_country: string
          p_domain: string
          p_metrics_date: string
          p_mode: string
          p_protocol: string
          p_target_url: string
        }
        Returns: {
          client_id: string
          ingestion_batch_id: string
          run_id: string
        }[]
      }
      ahrefs_note_total_orchestration_event: {
        Args: { p_message: string; p_payload?: Json; p_run_id: string }
        Returns: undefined
      }
      approve_freelancer_invoice: {
        Args: { p_admin_user_id: string; p_notes?: string; p_token: string }
        Returns: Json
      }
      calculate_next_run: {
        Args: { frequency: string; from_date: string }
        Returns: string
      }
      check_expiring_content: {
        Args: never
        Returns: {
          client_id: string
          content_id: string
          days_until_expiration: number
          title: string
          validation_deadline: string
        }[]
      }
      check_task_dependency_cycle: {
        Args: { p_blocked_task_id: string; p_blocker_task_id: string }
        Returns: boolean
      }
      claim_due_notifications: {
        Args: {
          p_limit?: number
          p_now?: string
          p_target_types?: string[]
          p_worker_id?: string
        }
        Returns: {
          attempts: number
          dedupe_key: string
          id: string
          metadata: Json
          payload: Json
          scheduled_for: string
          source: string
          target_id: string
          target_type: string
          type: string
        }[]
      }
      clean_and_reinject_blocks: { Args: { item_id: string }; Returns: string }
      dispatch_freelancer_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      dispatch_freelancer_invoice_followup: {
        Args: { p_invoice_id: string; p_target: string }
        Returns: undefined
      }
      escalate_pending_freelancer_invoices: { Args: never; Returns: Json }
      evaluate_seo_article_quality: {
        Args: { p_content_item_id: string }
        Returns: Json
      }
      fix_clipboard_block: { Args: { item_id: string }; Returns: string }
      fn_check_keyword_reserve: {
        Args: never
        Returns: {
          out_accion: string
          out_alert_level_nuevo: number
          out_keywords_disponibles: number
          out_nombremarca: string
          out_proyecto_id: string
        }[]
      }
      fn_check_ticket_hub_attention: {
        Args: {
          p_directors_channel_id?: string
          p_supervisors_channel_id?: string
        }
        Returns: Json
      }
      fn_keyword_reserve_dashboard: {
        Args: never
        Returns: {
          alert_level: number
          dias_desde_alerta: number
          keywords_disponibles: number
          keywords_faltantes: number
          nombremarca: string
          reserve_status: string
          slack_channel_id: string
          target: number
        }[]
      }
      fn_keyword_reserve_inventory_count: {
        Args: { p_proyecto_id: string }
        Returns: number
      }
      fn_keyword_reserve_is_business_day: { Args: never; Returns: boolean }
      fn_keyword_reserve_local_today: { Args: never; Returns: string }
      generate_meeting_reminders: {
        Args: never
        Returns: {
          action: string
          meeting_date: string
          meeting_type: string
          proyecto_id: string
        }[]
      }
      generate_monthly_freelancer_invoices: {
        Args: { p_period_month: number; p_period_year: number }
        Returns: {
          out_invoice_id: string
          out_monthly_amount: number
          out_user_id: string
        }[]
      }
      get_all_users_with_clients: {
        Args: never
        Returns: {
          client_id: string
          client_name: string
          email: string
          full_name: string
          role_name: string
          user_id: string
        }[]
      }
      get_content_items_by_proyecto: {
        Args: { p_proyecto_id: string }
        Returns: {
          author_id: string
          author_name: string
          brief_url: string
          category_id: string
          category_name: string
          category_slug: string
          client_approval_status: string
          client_id: string
          content_doc_url: string
          content_score: number
          content_type: string
          created_at: string
          created_by: string
          custom_metadata: Json
          editor_id: string
          editor_name: string
          expiration_date: string
          expiration_notification_sent: boolean
          final_published_url: string
          id: string
          is_latest_version: boolean
          keyword_difficulty: number
          last_modified_by: string
          last_reminder_date: string
          main_keyword: string
          meta_description: string
          og_image_url: string
          parent_version_id: string
          proyecto_id: string
          publication_date: string
          published_at: string
          published_by: string
          reading_time: number
          reminder_sent_count: number
          reviewer_id: string
          reviewer_name: string
          scheduled_date: string
          search_volume: number
          secondary_keywords: string[]
          slug: string
          staging_url: string
          status: string
          title: string
          updated_at: string
          validation_deadline: string
          version: number
          word_count: number
        }[]
      }
      get_content_items_for_validation_alerts: {
        Args: { days_before: number }
        Returns: {
          already_notified: boolean
          author_email: string
          author_id: string
          author_name: string
          client_id: string
          client_name: string
          content_id: string
          content_status: string
          content_title: string
          days_remaining: number
          proyecto_id: string
          validation_deadline: string
        }[]
      }
      get_content_stats: {
        Args: { p_client_id: string; p_date_from?: string; p_date_to?: string }
        Returns: {
          avg_keyword_difficulty: number
          expired_content: number
          pending_content: number
          published_content: number
          total_content: number
          total_search_volume: number
          total_words: number
        }[]
      }
      get_keyword_alerts_data: {
        Args: never
        Returns: {
          alert_level: number
          current_count: number
          last_alert_at: string
          lider_slack_id: string
          nombremarca: string
          proyecto_id: string
          seoestrategista_slack_id: string
          slack_channel_id: string
          target: number
        }[]
      }
      get_last_day_of_next_month: {
        Args: { p_from_date?: string }
        Returns: string
      }
      get_layout_report_optimized: {
        Args: { report_id: string }
        Returns: {
          breakpoint_name: string
          consumed_hours: number
          page_countries: string
          page_created_at: string
          page_id: string
          page_name: string
          page_status: string
          page_url: string
        }[]
      }
      get_next_meeting_date: {
        Args: {
          p_biweekly?: boolean
          p_dia_semana: string
          p_from_date?: string
        }
        Returns: string
      }
      get_user_by_email: {
        Args: { user_email: string }
        Returns: {
          email: string
          full_name: string
          id: string
          password_hash: string
          role_name: string
        }[]
      }
      get_user_client: {
        Args: { user_id: string }
        Returns: {
          client_id: string
          name: string
        }[]
      }
      ils_generate_canonical_url: {
        Args: { p_domain: string; p_keyword: string; p_slug: string }
        Returns: string
      }
      ils_get_brand_universe: {
        Args: {
          p_country: string
          p_exclude_item_id: string
          p_language: string
          p_limit?: number
          p_proyecto_id: string
        }
        Returns: {
          article_analysis_id: string
          cluster_id: string
          cluster_key: string
          content_item_id: string
          content_role: string
          customer_journey_stage: string
          final_published_url: string
          primary_keyword: string
          search_intent: string
          slug: string
          title: string
        }[]
      }
      ils_inject_links_into_articles: {
        Args: { p_proyecto_id: string }
        Returns: {
          links_appended: number
          links_injected: number
          source_slug: string
        }[]
      }
      initialize_project_checklist: {
        Args: { target_project_id: string }
        Returns: undefined
      }
      inject_images_into_article: {
        Args: { p_content_item_id: string }
        Returns: Json
      }
      inject_internal_link: {
        Args: { p_anchor: string; p_content: string; p_slug: string }
        Returns: string
      }
      is_agency_working_day: {
        Args: { p_timestamp?: string }
        Returns: boolean
      }
      mark_freelancer_invoice_paid: {
        Args: {
          p_admin_user_id: string
          p_invoice_id: string
          p_reference?: string
        }
        Returns: Json
      }
      match_brand_learnings: {
        Args: {
          match_count: number
          match_threshold: number
          p_client_id: string
          query_embedding: string
        }
        Returns: {
          category_tag: string
          id: string
          learning_context: string
          similarity: number
        }[]
      }
      match_chatbot_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      match_documents: {
        Args: { filter?: Json; match_count: number; query_embedding: string }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      normalize_keyword_text: { Args: { value: string }; Returns: string }
      notify_admin_for_invoice_approval: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      notify_admin_for_invoice_rejection: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      notify_writer_of_approval: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      orbit_enqueue_lighthouse_analysis: {
        Args: {
          p_client_name?: string
          p_country?: string
          p_created_by?: string
          p_request_payload?: Json
          p_row_limit?: number
          p_target_url: string
        }
        Returns: Json
      }
      publish_article_to_wordpress: {
        Args: { p_content_item_id: string; p_marca: string }
        Returns: Json
      }
      register_notification_sent: {
        Args: {
          p_content_id: string
          p_notification_type: string
          p_sent_to: string
          p_slack_ts?: string
        }
        Returns: string
      }
      reject_freelancer_invoice: {
        Args: { p_reason: string; p_token: string }
        Returns: Json
      }
      reset_stuck_outbox_notifications: {
        Args: { p_max_attempts?: number; p_stuck_minutes?: number }
        Returns: {
          action: string
          affected: number
        }[]
      }
      run_client_requests_attention_check: {
        Args: { p_channel_id?: string }
        Returns: Json
      }
      run_monthly_freelancer_invoice_generator: { Args: never; Returns: Json }
      unaccent: { Args: { "": string }; Returns: string }
      upsert_user_client: {
        Args: {
          client_id_param: string
          proyecto_id_param: string
          user_id_param: string
        }
        Returns: Json
      }
      validate_login: {
        Args: { p_email: string; p_password: string }
        Returns: {
          email: string
          full_name: string
          id: string
          role: string
        }[]
      }
    }
    Enums: {
      anchor_type_enum:
        | "EXACT_MATCH"
        | "PARTIAL_MATCH"
        | "BRANDED"
        | "NAKED_URL"
        | "GENERIC"
        | "LSI"
      freelancer_invoice_status:
        | "draft"
        | "sent"
        | "acknowledged_by_writer"
        | "rejected_by_writer"
        | "admin_approved"
        | "paid"
        | "cancelled"
      keyword_status:
        | "pending"
        | "approved"
        | "in_use"
        | "completed"
        | "rejected"
      keyword_strategy_type: "CORE" | "QUICK_WIN" | "MANTENIMIENTO"
      strategy_phase_type:
        | "FUNDACION"
        | "CONSOLIDACION"
        | "EXPANSION"
        | "CUSTOM"
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
      anchor_type_enum: [
        "EXACT_MATCH",
        "PARTIAL_MATCH",
        "BRANDED",
        "NAKED_URL",
        "GENERIC",
        "LSI",
      ],
      freelancer_invoice_status: [
        "draft",
        "sent",
        "acknowledged_by_writer",
        "rejected_by_writer",
        "admin_approved",
        "paid",
        "cancelled",
      ],
      keyword_status: [
        "pending",
        "approved",
        "in_use",
        "completed",
        "rejected",
      ],
      keyword_strategy_type: ["CORE", "QUICK_WIN", "MANTENIMIENTO"],
      strategy_phase_type: [
        "FUNDACION",
        "CONSOLIDACION",
        "EXPANSION",
        "CUSTOM",
      ],
    },
  },
} as const
