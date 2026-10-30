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
      billing_sessions: {
        Row: {
          amount_krw: number
          billing: string
          created_at: string
          expires_at: string
          id: number
          payment_id: number | null
          plan_id: string
          plan_key: string
          reason: string
          session_token: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_krw: number
          billing: string
          created_at?: string
          expires_at: string
          id?: number
          payment_id?: number | null
          plan_id: string
          plan_key: string
          reason: string
          session_token: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_krw?: number
          billing?: string
          created_at?: string
          expires_at?: string
          id?: number
          payment_id?: number | null
          plan_id?: string
          plan_key?: string
          reason?: string
          session_token?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_sessions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "billing_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_avatar_url: string
          author_name: string
          category_en: string | null
          category_ko: string | null
          content_en: string | null
          content_ko: string | null
          created_at: string
          created_by: string | null
          excerpt_en: string | null
          excerpt_ko: string | null
          id: string
          is_pinned: boolean
          is_published: boolean
          published_at: string
          related_job_slugs: string[]
          related_post_slugs: string[]
          schema_type: string
          seo_description_en: string | null
          seo_description_ko: string | null
          seo_title_en: string | null
          seo_title_ko: string | null
          slug: string
          tags: string[]
          thumbnail_url: string
          title_en: string | null
          title_ko: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          author_avatar_url?: string
          author_name?: string
          category_en?: string | null
          category_ko?: string | null
          content_en?: string | null
          content_ko?: string | null
          created_at?: string
          created_by?: string | null
          excerpt_en?: string | null
          excerpt_ko?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          published_at?: string
          related_job_slugs?: string[]
          related_post_slugs?: string[]
          schema_type?: string
          seo_description_en?: string | null
          seo_description_ko?: string | null
          seo_title_en?: string | null
          seo_title_ko?: string | null
          slug: string
          tags?: string[]
          thumbnail_url: string
          title_en?: string | null
          title_ko?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          author_avatar_url?: string
          author_name?: string
          category_en?: string | null
          category_ko?: string | null
          content_en?: string | null
          content_ko?: string | null
          created_at?: string
          created_by?: string | null
          excerpt_en?: string | null
          excerpt_ko?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          published_at?: string
          related_job_slugs?: string[]
          related_post_slugs?: string[]
          schema_type?: string
          seo_description_en?: string | null
          seo_description_ko?: string | null
          seo_title_en?: string | null
          seo_title_ko?: string | null
          slug?: string
          tags?: string[]
          thumbnail_url?: string
          title_en?: string | null
          title_ko?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      bookmark_folder: {
        Row: {
          created_at: string
          id: number
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmark_folder_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      bookmark_folder_item: {
        Row: {
          candid_id: string
          created_at: string
          folder_id: number
          id: number
          user_id: string
        }
        Insert: {
          candid_id: string
          created_at?: string
          folder_id: number
          id?: number
          user_id: string
        }
        Update: {
          candid_id?: string
          created_at?: string
          folder_id?: number
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmark_folder_item_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "bookmark_folder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmark_folder_item_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      bookmark_folder_share: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          folder_id: number
          id: string
          revoked_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          folder_id: number
          id?: string
          revoked_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          folder_id?: number
          id?: string
          revoked_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmark_folder_share_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookmark_folder_share_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "bookmark_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmark_folder_share_note: {
        Row: {
          candid_id: string
          created_at: string
          folder_id: number
          id: number
          memo: string
          updated_at: string
          viewer_key: string
          viewer_name: string
        }
        Insert: {
          candid_id: string
          created_at?: string
          folder_id: number
          id?: number
          memo: string
          updated_at?: string
          viewer_key: string
          viewer_name?: string
        }
        Update: {
          candid_id?: string
          created_at?: string
          folder_id?: number
          id?: number
          memo?: string
          updated_at?: string
          viewer_key?: string
          viewer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmark_folder_share_note_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmark_folder_share_note_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "bookmark_folder"
            referencedColumns: ["id"]
          },
        ]
      }
      candid: {
        Row: {
          bio: string | null
          created_at: string
          email: string | null
          fts: unknown
          headline: string | null
          id: string
          is_duplicated_old: boolean
          is_korean: boolean
          is_linkedin_deprecated: boolean
          is_selective: boolean
          last_updated_at: string | null
          linkedin_url: string | null
          links: string[] | null
          location: string | null
          name: string | null
          profile_picture: string | null
          summary: string | null
          total_exp_months: number | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          email?: string | null
          fts?: unknown
          headline?: string | null
          id?: string
          is_duplicated_old?: boolean
          is_korean?: boolean
          is_linkedin_deprecated?: boolean
          is_selective?: boolean
          last_updated_at?: string | null
          linkedin_url?: string | null
          links?: string[] | null
          location?: string | null
          name?: string | null
          profile_picture?: string | null
          summary?: string | null
          total_exp_months?: number | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          email?: string | null
          fts?: unknown
          headline?: string | null
          id?: string
          is_duplicated_old?: boolean
          is_korean?: boolean
          is_linkedin_deprecated?: boolean
          is_selective?: boolean
          last_updated_at?: string | null
          linkedin_url?: string | null
          links?: string[] | null
          location?: string | null
          name?: string | null
          profile_picture?: string | null
          summary?: string | null
          total_exp_months?: number | null
        }
        Relationships: []
      }
      candid_id_map: {
        Row: {
          candid_id: string
          created_at: string
          identifier: string
          is_current: boolean
          is_duplicated: boolean
          last_updated_at: string
        }
        Insert: {
          candid_id: string
          created_at?: string
          identifier: string
          is_current?: boolean
          is_duplicated?: boolean
          last_updated_at?: string
        }
        Update: {
          candid_id?: string
          created_at?: string
          identifier?: string
          is_current?: boolean
          is_duplicated?: boolean
          last_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candid_id_map_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
      }
      candid_links_index: {
        Row: {
          candid_id: string
          github_links: string | null
          linkedin_links: string | null
          scholar_links: string | null
          updated_at: string | null
        }
        Insert: {
          candid_id: string
          github_links?: string | null
          linkedin_links?: string | null
          scholar_links?: string | null
          updated_at?: string | null
        }
        Update: {
          candid_id?: string
          github_links?: string | null
          linkedin_links?: string | null
          scholar_links?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candid_links_index_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: true
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_mark: {
        Row: {
          candid_id: string
          created_at: string
          id: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          candid_id: string
          created_at?: string
          id?: number
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          candid_id?: string
          created_at?: string
          id?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_mark_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_mark_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      career_email_messages: {
        Row: {
          body_text: string | null
          created_at: string
          created_by: string | null
          direction: string
          from_email: string | null
          id: string
          inbound_event_id: string | null
          mail_type: string
          metadata: Json
          occurred_at: string
          reply_job_id: string | null
          status: string
          subject: string | null
          talent_id: string
          talent_message_id: number | null
          to_email: string | null
        }
        Insert: {
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          from_email?: string | null
          id?: string
          inbound_event_id?: string | null
          mail_type: string
          metadata?: Json
          occurred_at?: string
          reply_job_id?: string | null
          status?: string
          subject?: string | null
          talent_id: string
          talent_message_id?: number | null
          to_email?: string | null
        }
        Update: {
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          from_email?: string | null
          id?: string
          inbound_event_id?: string | null
          mail_type?: string
          metadata?: Json
          occurred_at?: string
          reply_job_id?: string | null
          status?: string
          subject?: string | null
          talent_id?: string
          talent_message_id?: number | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "career_email_messages_inbound_event_id_fkey"
            columns: ["inbound_event_id"]
            isOneToOne: false
            referencedRelation: "email_inbound_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_email_messages_reply_job_id_fkey"
            columns: ["reply_job_id"]
            isOneToOne: false
            referencedRelation: "email_reply_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_email_messages_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "career_email_messages_talent_message_id_fkey"
            columns: ["talent_message_id"]
            isOneToOne: false
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      career_email_onboarding_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          local_id: string | null
          metadata: Json
          normalized_email_hash: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          lead_id?: string | null
          local_id?: string | null
          metadata?: Json
          normalized_email_hash?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          local_id?: string | null
          metadata?: Json
          normalized_email_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "career_email_onboarding_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "career_email_onboarding_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      career_email_onboarding_leads: {
        Row: {
          abtest_type: string
          calendar_cta_sent_at: string | null
          calendar_url: string | null
          conversation_id: string | null
          converted_at: string | null
          converted_user_id: string | null
          country_lang: string | null
          created_at: string
          display_name: string | null
          email: string
          first_email_resend_id: string | null
          first_email_sent_at: string | null
          first_inbound_at: string | null
          id: string
          is_mobile: boolean | null
          last_error: string | null
          local_id: string | null
          metadata: Json
          normalized_email: string
          page_path: string | null
          paused_at: string | null
          profile_ingested_at: string | null
          profile_links: string[]
          profile_received_at: string | null
          reply_alias: string | null
          resume_text: string | null
          review_attempts: number
          review_email_resend_id: string | null
          review_locked_at: string | null
          review_locked_by: string | null
          source: string | null
          status: string
          step: string
          talent_id: string | null
          updated_at: string
          variant: string
        }
        Insert: {
          abtest_type?: string
          calendar_cta_sent_at?: string | null
          calendar_url?: string | null
          conversation_id?: string | null
          converted_at?: string | null
          converted_user_id?: string | null
          country_lang?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          first_email_resend_id?: string | null
          first_email_sent_at?: string | null
          first_inbound_at?: string | null
          id?: string
          is_mobile?: boolean | null
          last_error?: string | null
          local_id?: string | null
          metadata?: Json
          normalized_email: string
          page_path?: string | null
          paused_at?: string | null
          profile_ingested_at?: string | null
          profile_links?: string[]
          profile_received_at?: string | null
          reply_alias?: string | null
          resume_text?: string | null
          review_attempts?: number
          review_email_resend_id?: string | null
          review_locked_at?: string | null
          review_locked_by?: string | null
          source?: string | null
          status?: string
          step?: string
          talent_id?: string | null
          updated_at?: string
          variant?: string
        }
        Update: {
          abtest_type?: string
          calendar_cta_sent_at?: string | null
          calendar_url?: string | null
          conversation_id?: string | null
          converted_at?: string | null
          converted_user_id?: string | null
          country_lang?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          first_email_resend_id?: string | null
          first_email_sent_at?: string | null
          first_inbound_at?: string | null
          id?: string
          is_mobile?: boolean | null
          last_error?: string | null
          local_id?: string | null
          metadata?: Json
          normalized_email?: string
          page_path?: string | null
          paused_at?: string | null
          profile_ingested_at?: string | null
          profile_links?: string[]
          profile_received_at?: string | null
          reply_alias?: string | null
          resume_text?: string | null
          review_attempts?: number
          review_email_resend_id?: string | null
          review_locked_at?: string | null
          review_locked_by?: string | null
          source?: string | null
          status?: string
          step?: string
          talent_id?: string | null
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_email_onboarding_leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_email_onboarding_leads_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      career_utm_sources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_agent_update_proposals: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by_user_message_id: number | null
          expires_at: string
          id: string
          message_metadata: Json
          message_model: string | null
          message_thinking_logs: Json
          message_type: string
          payload: Json | null
          presentation_text: string | null
          presented_message_id: number | null
          preview: string | null
          scope_key: string
          slack_thread_id: string | null
          source: string
          status: string
          summary: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by_user_message_id?: number | null
          expires_at: string
          id?: string
          message_metadata?: Json
          message_model?: string | null
          message_thinking_logs?: Json
          message_type: string
          payload?: Json | null
          presentation_text?: string | null
          presented_message_id?: number | null
          preview?: string | null
          scope_key: string
          slack_thread_id?: string | null
          source: string
          status?: string
          summary: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by_user_message_id?: number | null
          expires_at?: string
          id?: string
          message_metadata?: Json
          message_model?: string | null
          message_thinking_logs?: Json
          message_type?: string
          payload?: Json | null
          presentation_text?: string | null
          presented_message_id?: number | null
          preview?: string | null
          scope_key?: string
          slack_thread_id?: string | null
          source?: string
          status?: string
          summary?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_agent_update_proposals_created_by_user_message_id_fkey"
            columns: ["created_by_user_message_id"]
            isOneToOne: false
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_agent_update_proposals_presented_message_id_fkey"
            columns: ["presented_message_id"]
            isOneToOne: false
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_agent_update_proposals_slack_thread_id_fkey"
            columns: ["slack_thread_id"]
            isOneToOne: false
            referencedRelation: "company_slack_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_agent_update_proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      company_agent_web_action_jobs: {
        Row: {
          action_context: Json
          action_name: string
          actor_user_id: string | null
          anchor_message_id: number
          attempt_count: number
          company_workspace_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          progress_message_id: number | null
          queue_dispatch_attempt_count: number
          queue_dispatch_status: string
          queue_dispatched_at: string | null
          queue_last_error: string | null
          queue_next_attempt_at: string
          role_id: string | null
          status: string
          terminal_message_id: number | null
          updated_at: string
        }
        Insert: {
          action_context?: Json
          action_name: string
          actor_user_id?: string | null
          anchor_message_id: number
          attempt_count?: number
          company_workspace_id: string
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          progress_message_id?: number | null
          queue_dispatch_attempt_count?: number
          queue_dispatch_status?: string
          queue_dispatched_at?: string | null
          queue_last_error?: string | null
          queue_next_attempt_at?: string
          role_id?: string | null
          status?: string
          terminal_message_id?: number | null
          updated_at?: string
        }
        Update: {
          action_context?: Json
          action_name?: string
          actor_user_id?: string | null
          anchor_message_id?: number
          attempt_count?: number
          company_workspace_id?: string
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          progress_message_id?: number | null
          queue_dispatch_attempt_count?: number
          queue_dispatch_status?: string
          queue_dispatched_at?: string | null
          queue_last_error?: string | null
          queue_next_attempt_at?: string
          role_id?: string | null
          status?: string
          terminal_message_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_agent_web_action_jobs_anchor_message_id_fkey"
            columns: ["anchor_message_id"]
            isOneToOne: true
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_agent_web_action_jobs_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_agent_web_action_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "company_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_agent_web_action_jobs_progress_message_id_fkey"
            columns: ["progress_message_id"]
            isOneToOne: false
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_agent_web_action_jobs_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_agent_web_action_jobs_terminal_message_id_fkey"
            columns: ["terminal_message_id"]
            isOneToOne: false
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      company_behavior_contexts: {
        Row: {
          created_at: string | null
          reason: string | null
          role_id: string
          text_context: string
        }
        Insert: {
          created_at?: string | null
          reason?: string | null
          role_id: string
          text_context?: string
        }
        Update: {
          created_at?: string | null
          reason?: string | null
          role_id?: string
          text_context?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_behavior_contexts_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: true
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_context_runs: {
        Row: {
          available_at: string
          id: string
          result: Json
          role_id: string
          status: string
          trigger_reason: string
        }
        Insert: {
          available_at?: string
          id?: string
          result?: Json
          role_id: string
          status?: string
          trigger_reason: string
        }
        Update: {
          available_at?: string
          id?: string
          result?: Json
          role_id?: string
          status?: string
          trigger_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_context_runs_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_conversation_summaries: {
        Row: {
          company_workspace_id: string
          content: string
          conversation_id: string
          created_at: string
          id: number
          message_count: number
          metadata: Json
          model: string | null
          role_id: string | null
          slack_thread_id: string | null
          source_end_message_id: number
          source_start_message_id: number
        }
        Insert: {
          company_workspace_id: string
          content: string
          conversation_id: string
          created_at?: string
          id?: number
          message_count: number
          metadata?: Json
          model?: string | null
          role_id?: string | null
          slack_thread_id?: string | null
          source_end_message_id: number
          source_start_message_id: number
        }
        Update: {
          company_workspace_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          id?: number
          message_count?: number
          metadata?: Json
          model?: string | null
          role_id?: string | null
          slack_thread_id?: string | null
          source_end_message_id?: number
          source_start_message_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_conversation_summaries_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_conversation_summaries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "company_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_conversation_summaries_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_conversation_summaries_slack_thread_id_fkey"
            columns: ["slack_thread_id"]
            isOneToOne: false
            referencedRelation: "company_slack_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      company_conversations: {
        Row: {
          company_workspace_id: string
          created_at: string
          hidden_through_message_id: number | null
          id: string
          last_message_at: string | null
          last_message_id: number | null
          metadata: Json
          role_id: string | null
          summary_cursor_message_id: number | null
          team_id: string | null
          team_scope: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          company_workspace_id: string
          created_at?: string
          hidden_through_message_id?: number | null
          id?: string
          last_message_at?: string | null
          last_message_id?: number | null
          metadata?: Json
          role_id?: string | null
          summary_cursor_message_id?: number | null
          team_id?: string | null
          team_scope?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_workspace_id?: string
          created_at?: string
          hidden_through_message_id?: number | null
          id?: string
          last_message_at?: string | null
          last_message_id?: number | null
          metadata?: Json
          role_id?: string | null
          summary_cursor_message_id?: number | null
          team_id?: string | null
          team_scope?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_conversations_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_conversations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "company_workspace_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      company_data: {
        Row: {
          company_workspace_id: string
          confidence: number | null
          created_at: string
          last_funding_round_description: string | null
          last_funding_stage: string | null
          last_news: string | null
          main_investors: string | null
          search_query: string | null
          searched_at: string
          source_payload: Json | null
          total_funding_raised: string | null
          updated_at: string
        }
        Insert: {
          company_workspace_id: string
          confidence?: number | null
          created_at?: string
          last_funding_round_description?: string | null
          last_funding_stage?: string | null
          last_news?: string | null
          main_investors?: string | null
          search_query?: string | null
          searched_at?: string
          source_payload?: Json | null
          total_funding_raised?: string | null
          updated_at?: string
        }
        Update: {
          company_workspace_id?: string
          confidence?: number | null
          created_at?: string
          last_funding_round_description?: string | null
          last_funding_stage?: string | null
          last_news?: string | null
          main_investors?: string | null
          search_query?: string | null
          searched_at?: string
          source_payload?: Json | null
          total_funding_raised?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_data_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: true
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      company_db: {
        Row: {
          crunchbase_information: Json | null
          description: string | null
          employee_count_range: Json | null
          founded_year: number | null
          funding_url: string | null
          harvestapi_information: Json | null
          id: number
          investors: string | null
          last_crunchbase_updated_at: string | null
          last_harvestapi_updated_at: string | null
          last_updated_at: string
          linkedin_company_id: number | null
          linkedin_url: string | null
          location: string | null
          logo: string | null
          name: string | null
          related_links: string[] | null
          short_description: string | null
          specialities: string
          website_url: string | null
        }
        Insert: {
          crunchbase_information?: Json | null
          description?: string | null
          employee_count_range?: Json | null
          founded_year?: number | null
          funding_url?: string | null
          harvestapi_information?: Json | null
          id?: number
          investors?: string | null
          last_crunchbase_updated_at?: string | null
          last_harvestapi_updated_at?: string | null
          last_updated_at?: string
          linkedin_company_id?: number | null
          linkedin_url?: string | null
          location?: string | null
          logo?: string | null
          name?: string | null
          related_links?: string[] | null
          short_description?: string | null
          specialities?: string
          website_url?: string | null
        }
        Update: {
          crunchbase_information?: Json | null
          description?: string | null
          employee_count_range?: Json | null
          founded_year?: number | null
          funding_url?: string | null
          harvestapi_information?: Json | null
          id?: number
          investors?: string | null
          last_crunchbase_updated_at?: string | null
          last_harvestapi_updated_at?: string | null
          last_updated_at?: string
          linkedin_company_id?: number | null
          linkedin_url?: string | null
          location?: string | null
          logo?: string | null
          name?: string | null
          related_links?: string[] | null
          short_description?: string | null
          specialities?: string
          website_url?: string | null
        }
        Relationships: []
      }
      company_events: {
        Row: {
          content: string
          created_at: string
          id: number
          source: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: never
          source: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: never
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      company_first_search_runs: {
        Row: {
          attempt_count: number
          available_at: string
          company_workspace_id: string
          contract_version: string
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          lease_expires_at: string | null
          lease_token: string | null
          model_manifest: Json
          query_plan: Json
          requested_role_ids: string[]
          result: Json
          role_id: string | null
          scheduled_role_ids: string[]
          scheduled_slot: string
          selection_committed_at: string | null
          source_calibration_id: string | null
          source_cutoff: string | null
          source_snapshot: Json
          started_at: string | null
          status: string
          trigger_reason: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          company_workspace_id: string
          contract_version?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          model_manifest?: Json
          query_plan?: Json
          requested_role_ids?: string[]
          result?: Json
          role_id?: string | null
          scheduled_role_ids?: string[]
          scheduled_slot: string
          selection_committed_at?: string | null
          source_calibration_id?: string | null
          source_cutoff?: string | null
          source_snapshot?: Json
          started_at?: string | null
          status?: string
          trigger_reason?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          company_workspace_id?: string
          contract_version?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          model_manifest?: Json
          query_plan?: Json
          requested_role_ids?: string[]
          result?: Json
          role_id?: string | null
          scheduled_role_ids?: string[]
          scheduled_slot?: string
          selection_committed_at?: string | null
          source_calibration_id?: string | null
          source_cutoff?: string | null
          source_snapshot?: Json
          started_at?: string | null
          status?: string
          trigger_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_first_search_runs_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_first_search_runs_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_first_slack_outbox: {
        Row: {
          attempt_count: number
          available_at: string
          blocks: Json
          candidate_ids: string[]
          channel_id: string
          chunk_index: number
          claimed_at: string | null
          company_workspace_id: string
          created_at: string
          delivery_kind: string
          id: string
          idempotency_key: string
          last_error: string | null
          message_text: string
          role_ids: string[]
          run_id: string
          sent_at: string | null
          slack_message_ts: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          blocks?: Json
          candidate_ids?: string[]
          channel_id: string
          chunk_index?: number
          claimed_at?: string | null
          company_workspace_id: string
          created_at?: string
          delivery_kind?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          message_text: string
          role_ids?: string[]
          run_id: string
          sent_at?: string | null
          slack_message_ts?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          blocks?: Json
          candidate_ids?: string[]
          channel_id?: string
          chunk_index?: number
          claimed_at?: string | null
          company_workspace_id?: string
          created_at?: string
          delivery_kind?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          message_text?: string
          role_ids?: string[]
          run_id?: string
          sent_at?: string | null
          slack_message_ts?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_first_slack_outbox_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "company_slack_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_first_slack_outbox_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_first_slack_outbox_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "company_first_search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      company_first_talent_scores: {
        Row: {
          candidate_fit: string
          company_fit: string
          criteria_evaluations: Json
          evaluation_as_of: string
          reason: string
          role_fit: string
          role_id: string
          score: number
          scored_at: string
          source_run_id: string
          talent_id: string
        }
        Insert: {
          candidate_fit: string
          company_fit: string
          criteria_evaluations?: Json
          evaluation_as_of: string
          reason: string
          role_fit: string
          role_id: string
          score: number
          scored_at: string
          source_run_id: string
          talent_id: string
        }
        Update: {
          candidate_fit?: string
          company_fit?: string
          criteria_evaluations?: Json
          evaluation_as_of?: string
          reason?: string
          role_fit?: string
          role_id?: string
          score?: number
          scored_at?: string
          source_run_id?: string
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_first_talent_scores_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_first_talent_scores_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "company_first_search_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_first_talent_scores_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      company_internal_roles: {
        Row: {
          considerations: Json
          created_at: string
          criteria: Json
          intro_search_date: string[]
          intro_search_time: number
          is_anonymous: boolean
          is_auto: boolean
          is_company_first_search: boolean
          is_harper_tailored_role: boolean
          is_promote: boolean
          is_require_linkedin: boolean | null
          is_require_resume: boolean | null
          max_pending_talents: number | null
          memory: string | null
          questions: Json | null
          request: string | null
          role_id: string
          role_status_changed_at: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          considerations?: Json
          created_at?: string
          criteria?: Json
          intro_search_date?: string[]
          intro_search_time?: number
          is_anonymous?: boolean
          is_auto?: boolean
          is_company_first_search?: boolean
          is_harper_tailored_role?: boolean
          is_promote?: boolean
          is_require_linkedin?: boolean | null
          is_require_resume?: boolean | null
          max_pending_talents?: number | null
          memory?: string | null
          questions?: Json | null
          request?: string | null
          role_id: string
          role_status_changed_at?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          considerations?: Json
          created_at?: string
          criteria?: Json
          intro_search_date?: string[]
          intro_search_time?: number
          is_anonymous?: boolean
          is_auto?: boolean
          is_company_first_search?: boolean
          is_harper_tailored_role?: boolean
          is_promote?: boolean
          is_require_linkedin?: boolean | null
          is_require_resume?: boolean | null
          max_pending_talents?: number | null
          memory?: string | null
          questions?: Json | null
          request?: string | null
          role_id?: string
          role_status_changed_at?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_internal_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: true
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_internal_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "company_workspace_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      company_intro_candidates: {
        Row: {
          candidate_sent_at: string | null
          close_reason: string | null
          company_appeal: string | null
          company_workspace_id: string
          connected_at: string | null
          created_at: string
          delivery_run_id: string | null
          id: string
          intro_recipient_emails: string[]
          next_stage_id: string | null
          presentation: Json
          recommendation_id: string | null
          requested_at: string | null
          requested_by_company_user_id: string | null
          revision: number
          role_fingerprint: string
          role_id: string
          selected_at: string
          selection_reason: string
          selection_run_id: string
          status: string
          talent_decision_at: string | null
          talent_fingerprint: string
          talent_id: string
          updated_at: string
        }
        Insert: {
          candidate_sent_at?: string | null
          close_reason?: string | null
          company_appeal?: string | null
          company_workspace_id: string
          connected_at?: string | null
          created_at?: string
          delivery_run_id?: string | null
          id?: string
          intro_recipient_emails?: string[]
          next_stage_id?: string | null
          presentation?: Json
          recommendation_id?: string | null
          requested_at?: string | null
          requested_by_company_user_id?: string | null
          revision?: number
          role_fingerprint: string
          role_id: string
          selected_at?: string
          selection_reason: string
          selection_run_id: string
          status?: string
          talent_decision_at?: string | null
          talent_fingerprint: string
          talent_id: string
          updated_at?: string
        }
        Update: {
          candidate_sent_at?: string | null
          close_reason?: string | null
          company_appeal?: string | null
          company_workspace_id?: string
          connected_at?: string | null
          created_at?: string
          delivery_run_id?: string | null
          id?: string
          intro_recipient_emails?: string[]
          next_stage_id?: string | null
          presentation?: Json
          recommendation_id?: string | null
          requested_at?: string | null
          requested_by_company_user_id?: string | null
          revision?: number
          role_fingerprint?: string
          role_id?: string
          selected_at?: string
          selection_reason?: string
          selection_run_id?: string
          status?: string
          talent_decision_at?: string | null
          talent_fingerprint?: string
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_intro_candidates_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_intro_candidates_delivery_run_id_fkey"
            columns: ["delivery_run_id"]
            isOneToOne: true
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_intro_candidates_next_stage_id_fkey"
            columns: ["next_stage_id"]
            isOneToOne: false
            referencedRelation: "ops_matching_role_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_intro_candidates_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: true
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_intro_candidates_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: true
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_intro_candidates_requested_by_company_user_id_fkey"
            columns: ["requested_by_company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_intro_candidates_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_intro_candidates_selection_run_id_fkey"
            columns: ["selection_run_id"]
            isOneToOne: false
            referencedRelation: "company_first_search_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_intro_candidates_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      company_memories: {
        Row: {
          company_workspace_id: string
          content: string
          created_at: string
          id: string
          role_id: string | null
          updated_at: string
        }
        Insert: {
          company_workspace_id: string
          content: string
          created_at?: string
          id?: string
          role_id?: string | null
          updated_at?: string
        }
        Update: {
          company_workspace_id?: string
          content?: string
          created_at?: string
          id?: string
          role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memories_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_memories_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_message_templates: {
        Row: {
          company_workspace_id: string
          content: Json
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_workspace_id: string
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_workspace_id?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      company_messages: {
        Row: {
          company_user_id: string | null
          company_workspace_id: string
          content: string
          conversation_id: string
          created_at: string
          id: number
          mentions: Json
          message_type: string
          metadata: Json
          model: string | null
          role: string
          role_id: string | null
          slack_message_ts: string | null
          slack_thread_id: string | null
          slack_user_id: string | null
          status: string
          thinking_logs: Json
        }
        Insert: {
          company_user_id?: string | null
          company_workspace_id: string
          content: string
          conversation_id: string
          created_at?: string
          id?: number
          mentions?: Json
          message_type?: string
          metadata?: Json
          model?: string | null
          role: string
          role_id?: string | null
          slack_message_ts?: string | null
          slack_thread_id?: string | null
          slack_user_id?: string | null
          status?: string
          thinking_logs?: Json
        }
        Update: {
          company_user_id?: string | null
          company_workspace_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          id?: number
          mentions?: Json
          message_type?: string
          metadata?: Json
          model?: string | null
          role?: string
          role_id?: string | null
          slack_message_ts?: string | null
          slack_thread_id?: string | null
          slack_user_id?: string | null
          status?: string
          thinking_logs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "company_messages_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_messages_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "company_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_messages_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_messages_slack_thread_id_fkey"
            columns: ["slack_thread_id"]
            isOneToOne: false
            referencedRelation: "company_slack_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      company_role_assignees: {
        Row: {
          company_user_id: string
          role_id: string
        }
        Insert: {
          company_user_id: string
          role_id: string
        }
        Update: {
          company_user_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_role_assignees_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_role_assignees_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_role_board_cards: {
        Row: {
          company_workspace_id: string
          recommendation_id: string
          role_id: string
          updated_at: string
          updated_by: string | null
          x: number
          y: number
        }
        Insert: {
          company_workspace_id: string
          recommendation_id: string
          role_id: string
          updated_at?: string
          updated_by?: string | null
          x: number
          y: number
        }
        Update: {
          company_workspace_id?: string
          recommendation_id?: string
          role_id?: string
          updated_at?: string
          updated_by?: string | null
          x?: number
          y?: number
        }
        Relationships: []
      }
      company_role_board_texts: {
        Row: {
          board: string
          company_workspace_id: string
          created_at: string
          created_by: string | null
          id: string
          role_id: string
          size: number
          text: string
          updated_at: string
          updated_by: string | null
          x: number
          y: number
        }
        Insert: {
          board: string
          company_workspace_id: string
          created_at?: string
          created_by?: string | null
          id: string
          role_id: string
          size?: number
          text: string
          updated_at?: string
          updated_by?: string | null
          x: number
          y: number
        }
        Update: {
          board?: string
          company_workspace_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          role_id?: string
          size?: number
          text?: string
          updated_at?: string
          updated_by?: string | null
          x?: number
          y?: number
        }
        Relationships: []
      }
      company_role_board_viewports: {
        Row: {
          company_user_id: string
          company_workspace_id: string
          role_id: string
          updated_at: string
          viewport: Json
        }
        Insert: {
          company_user_id: string
          company_workspace_id: string
          role_id: string
          updated_at?: string
          viewport: Json
        }
        Update: {
          company_user_id?: string
          company_workspace_id?: string
          role_id?: string
          updated_at?: string
          viewport?: Json
        }
        Relationships: []
      }
      company_role_calibrations: {
        Row: {
          available_at: string
          company_workspace_id: string
          created_at: string
          id: string
          payload: Json
          role_id: string
          status: string
          updated_at: string
        }
        Insert: {
          available_at?: string
          company_workspace_id: string
          created_at?: string
          id?: string
          payload?: Json
          role_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          available_at?: string
          company_workspace_id?: string
          created_at?: string
          id?: string
          payload?: Json
          role_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_role_calibrations_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_role_calibrations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_role_list_columns: {
        Row: {
          company_workspace_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          label: string
          role_id: string
          updated_at: string
          updated_by: string | null
          values: Json
        }
        Insert: {
          company_workspace_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          label: string
          role_id: string
          updated_at?: string
          updated_by?: string | null
          values?: Json
        }
        Update: {
          company_workspace_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          label?: string
          role_id?: string
          updated_at?: string
          updated_by?: string | null
          values?: Json
        }
        Relationships: []
      }
      company_role_liveness: {
        Row: {
          closed_detected_at: string | null
          consecutive_missing_count: number
          deadline_type: string | null
          last_alive_at: string | null
          last_detail_checked_at: string | null
          last_error: string | null
          last_seen_at: string | null
          next_check_at: string | null
          role_id: string
          source_expires_at: string | null
          source_external_id: string
          source_provider: string
          source_status: string | null
          updated_at: string
        }
        Insert: {
          closed_detected_at?: string | null
          consecutive_missing_count?: number
          deadline_type?: string | null
          last_alive_at?: string | null
          last_detail_checked_at?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          next_check_at?: string | null
          role_id: string
          source_expires_at?: string | null
          source_external_id: string
          source_provider: string
          source_status?: string | null
          updated_at?: string
        }
        Update: {
          closed_detected_at?: string | null
          consecutive_missing_count?: number
          deadline_type?: string | null
          last_alive_at?: string | null
          last_detail_checked_at?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          next_check_at?: string | null
          role_id?: string
          source_expires_at?: string | null
          source_external_id?: string
          source_provider?: string
          source_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_role_liveness_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: true
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_role_notification_channels: {
        Row: {
          channel_id: string
          role_id: string
        }
        Insert: {
          channel_id: string
          role_id: string
        }
        Update: {
          channel_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_role_notification_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "company_slack_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_role_notification_channels_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_roles: {
        Row: {
          company_workspace_id: string
          country_code: string | null
          created_at: string
          description: string | null
          description_summary: string | null
          expired_at: string | null
          expires_at: string | null
          external_jd_url: string | null
          information: Json | null
          is_expired: boolean
          location_text: string | null
          name: string
          salary_is_predicted: boolean
          opportunity_search_tsv: unknown
          posted_at: string | null
          priority: number | null
          request: string | null
          role_id: string
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          salary_range: string | null
          seniority_level: string | null
          source_job_id: string | null
          source_provider: string | null
          source_type: string
          status: string
          summary: Json
          title_embedding: string | null
          title_embedding_text: string | null
          type: string[]
          updated_at: string
          work_mode: string | null
        }
        Insert: {
          company_workspace_id: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          description_summary?: string | null
          expired_at?: string | null
          expires_at?: string | null
          external_jd_url?: string | null
          information?: Json | null
          is_expired?: boolean
          location_text?: string | null
          name: string
          salary_is_predicted?: boolean
          opportunity_search_tsv?: unknown
          posted_at?: string | null
          priority?: number | null
          request?: string | null
          role_id?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          salary_range?: string | null
          seniority_level?: string | null
          source_job_id?: string | null
          source_provider?: string | null
          source_type?: string
          status?: string
          summary?: Json
          title_embedding?: string | null
          title_embedding_text?: string | null
          type?: string[]
          updated_at?: string
          work_mode?: string | null
        }
        Update: {
          company_workspace_id?: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          description_summary?: string | null
          expired_at?: string | null
          expires_at?: string | null
          external_jd_url?: string | null
          information?: Json | null
          is_expired?: boolean
          location_text?: string | null
          name?: string
          salary_is_predicted?: boolean
          opportunity_search_tsv?: unknown
          posted_at?: string | null
          priority?: number | null
          request?: string | null
          role_id?: string
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          salary_range?: string | null
          seniority_level?: string | null
          source_job_id?: string | null
          source_provider?: string | null
          source_type?: string
          status?: string
          summary?: Json
          title_embedding?: string | null
          title_embedding_text?: string | null
          type?: string[]
          updated_at?: string
          work_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_roles_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      company_roles_archive: {
        Row: {
          archived_at: string
          company_workspace_id: string
          created_at: string
          expired_at: string | null
          expires_at: string | null
          external_jd_url: string | null
          name: string
          posted_at: string | null
          role_id: string
          source_job_id: string | null
          source_provider: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string
          company_workspace_id: string
          created_at: string
          expired_at?: string | null
          expires_at?: string | null
          external_jd_url?: string | null
          name: string
          posted_at?: string | null
          role_id: string
          source_job_id?: string | null
          source_provider?: string | null
          updated_at: string
        }
        Update: {
          archived_at?: string
          company_workspace_id?: string
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          external_jd_url?: string | null
          name?: string
          posted_at?: string | null
          role_id?: string
          source_job_id?: string | null
          source_provider?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_slack_channels: {
        Row: {
          company_workspace_id: string
          created_at: string
          default_role_id: string | null
          id: string
          is_enabled: boolean
          is_private: boolean
          notify_candidate_accepted: boolean
          notify_candidate_rejected: boolean
          notify_member_joined: boolean
          reply_to_harper_threads: boolean
          respond_to_mentions: boolean
          slack_channel_id: string
          slack_channel_name: string | null
          slack_team_id: string
          updated_at: string
          worker_target: string
        }
        Insert: {
          company_workspace_id: string
          created_at?: string
          default_role_id?: string | null
          id?: string
          is_enabled?: boolean
          is_private?: boolean
          notify_candidate_accepted?: boolean
          notify_candidate_rejected?: boolean
          notify_member_joined?: boolean
          reply_to_harper_threads?: boolean
          respond_to_mentions?: boolean
          slack_channel_id: string
          slack_channel_name?: string | null
          slack_team_id: string
          updated_at?: string
          worker_target?: string
        }
        Update: {
          company_workspace_id?: string
          created_at?: string
          default_role_id?: string | null
          id?: string
          is_enabled?: boolean
          is_private?: boolean
          notify_candidate_accepted?: boolean
          notify_candidate_rejected?: boolean
          notify_member_joined?: boolean
          reply_to_harper_threads?: boolean
          respond_to_mentions?: boolean
          slack_channel_id?: string
          slack_channel_name?: string | null
          slack_team_id?: string
          updated_at?: string
          worker_target?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_slack_channels_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_slack_integrations"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_slack_channels_default_role_id_fkey"
            columns: ["default_role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_slack_integrations: {
        Row: {
          bot_token_ciphertext: string | null
          company_workspace_id: string
          connected_at: string
          created_at: string
          id: string
          installed_at: string | null
          installed_by_user_id: string | null
          last_error: string | null
          last_sent_at: string | null
          notify_candidate_accepted: boolean
          notify_candidate_rejected: boolean
          notify_member_joined: boolean
          scopes: string[]
          slack_app_id: string | null
          slack_bot_user_id: string | null
          slack_channel_id: string | null
          slack_channel_name: string | null
          slack_team_id: string
          slack_team_name: string | null
          status: string
          updated_at: string
          webhook_url_ciphertext: string | null
        }
        Insert: {
          bot_token_ciphertext?: string | null
          company_workspace_id: string
          connected_at?: string
          created_at?: string
          id?: string
          installed_at?: string | null
          installed_by_user_id?: string | null
          last_error?: string | null
          last_sent_at?: string | null
          notify_candidate_accepted?: boolean
          notify_candidate_rejected?: boolean
          notify_member_joined?: boolean
          scopes?: string[]
          slack_app_id?: string | null
          slack_bot_user_id?: string | null
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slack_team_id: string
          slack_team_name?: string | null
          status?: string
          updated_at?: string
          webhook_url_ciphertext?: string | null
        }
        Update: {
          bot_token_ciphertext?: string | null
          company_workspace_id?: string
          connected_at?: string
          created_at?: string
          id?: string
          installed_at?: string | null
          installed_by_user_id?: string | null
          last_error?: string | null
          last_sent_at?: string | null
          notify_candidate_accepted?: boolean
          notify_candidate_rejected?: boolean
          notify_member_joined?: boolean
          scopes?: string[]
          slack_app_id?: string | null
          slack_bot_user_id?: string | null
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slack_team_id?: string
          slack_team_name?: string | null
          status?: string
          updated_at?: string
          webhook_url_ciphertext?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_slack_integrations_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: true
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_slack_integrations_installed_by_user_id_fkey"
            columns: ["installed_by_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      company_slack_threads: {
        Row: {
          channel_id: string
          created_at: string
          created_by_harper: boolean
          id: string
          role_id: string | null
          slack_thread_ts: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          created_by_harper?: boolean
          id?: string
          role_id?: string | null
          slack_thread_ts: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          created_by_harper?: boolean
          id?: string
          role_id?: string | null
          slack_thread_ts?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_slack_threads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "company_slack_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_slack_threads_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_snapshot: {
        Row: {
          company_db_id: number | null
          company_name: string
          content: Json
          created_at: string
          id: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          company_db_id?: number | null
          company_name: string
          content?: Json
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          company_db_id?: number | null
          company_name?: string
          content?: Json
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_snapshot_company_db_id_fkey"
            columns: ["company_db_id"]
            isOneToOne: false
            referencedRelation: "company_db"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_snapshot_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      company_talent_relays: {
        Row: {
          company_talent_request_id: string | null
          created_at: string
          document_id: string | null
          id: string
          recommendation_id: string
          relay_content: string | null
          source_talent_message_id: number
        }
        Insert: {
          company_talent_request_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          recommendation_id: string
          relay_content?: string | null
          source_talent_message_id: number
        }
        Update: {
          company_talent_request_id?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          recommendation_id?: string
          relay_content?: string | null
          source_talent_message_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_talent_relays_company_talent_request_id_fkey"
            columns: ["company_talent_request_id"]
            isOneToOne: false
            referencedRelation: "company_talent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_relays_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "talent_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_relays_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_relays_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_relays_source_talent_message_id_fkey"
            columns: ["source_talent_message_id"]
            isOneToOne: false
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      company_talent_requests: {
        Row: {
          approved_at: string | null
          company_workspace_id: string
          contact_kind: string
          contact_purpose: string
          created_at: string
          delivery_body: string | null
          delivery_subject: string | null
          document_id: string | null
          draft_revision: number
          expects_document: boolean
          expires_at: string
          id: string
          in_reply_to_company_talent_relay_id: string | null
          intent: string
          recommendation_id: string
          request_context: string
          response_disposition: string | null
          resume_stage: string | null
          role_id: string
          source_company_message_id: number
          talent_id: string
          talent_source_message_id: number | null
          updated_at: string
          workflow_status: string
        }
        Insert: {
          approved_at?: string | null
          company_workspace_id: string
          contact_kind?: string
          contact_purpose?: string
          created_at?: string
          delivery_body?: string | null
          delivery_subject?: string | null
          document_id?: string | null
          draft_revision?: number
          expects_document?: boolean
          expires_at?: string
          id?: string
          in_reply_to_company_talent_relay_id?: string | null
          intent?: string
          recommendation_id: string
          request_context: string
          response_disposition?: string | null
          resume_stage?: string | null
          role_id: string
          source_company_message_id: number
          talent_id: string
          talent_source_message_id?: number | null
          updated_at?: string
          workflow_status?: string
        }
        Update: {
          approved_at?: string | null
          company_workspace_id?: string
          contact_kind?: string
          contact_purpose?: string
          created_at?: string
          delivery_body?: string | null
          delivery_subject?: string | null
          document_id?: string | null
          draft_revision?: number
          expects_document?: boolean
          expires_at?: string
          id?: string
          in_reply_to_company_talent_relay_id?: string | null
          intent?: string
          recommendation_id?: string
          request_context?: string
          response_disposition?: string | null
          resume_stage?: string | null
          role_id?: string
          source_company_message_id?: number
          talent_id?: string
          talent_source_message_id?: number | null
          updated_at?: string
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_talent_requests_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_talent_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "talent_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_requests_in_reply_to_company_talent_relay_i_fkey"
            columns: ["in_reply_to_company_talent_relay_id"]
            isOneToOne: false
            referencedRelation: "company_talent_relays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_requests_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_requests_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_requests_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_talent_requests_source_company_message_id_fkey"
            columns: ["source_company_message_id"]
            isOneToOne: false
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_talent_requests_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_talent_requests_talent_source_message_id_fkey"
            columns: ["talent_source_message_id"]
            isOneToOne: false
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      company_todo_reads: {
        Row: {
          item_id: string
          read_at: string
          role_id: string
          user_id: string
        }
        Insert: {
          item_id: string
          read_at?: string
          role_id: string
          user_id: string
        }
        Update: {
          item_id?: string
          read_at?: string
          role_id?: string
          user_id?: string
        }
        Relationships: []
      }
      company_todo_suggestion_mutes: {
        Row: {
          company_workspace_id: string
          created_at: string
          created_by: string | null
          kind: string
          role_id: string
        }
        Insert: {
          company_workspace_id: string
          created_at?: string
          created_by?: string | null
          kind: string
          role_id: string
        }
        Update: {
          company_workspace_id?: string
          created_at?: string
          created_by?: string | null
          kind?: string
          role_id?: string
        }
        Relationships: []
      }
      company_todo_suggestions: {
        Row: {
          approval_message_id: number | null
          company_workspace_id: string
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string
          id: string
          kind: string
          plan: string
          role_id: string
          slack_thread_id: string | null
          source: string | null
          status: string
          talent_ids: string[]
          talent_stages: Json
          title: string
          updated_at: string
        }
        Insert: {
          approval_message_id?: number | null
          company_workspace_id: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          id?: string
          kind: string
          plan: string
          role_id: string
          slack_thread_id?: string | null
          source?: string | null
          status?: string
          talent_ids?: string[]
          talent_stages?: Json
          title: string
          updated_at?: string
        }
        Update: {
          approval_message_id?: number | null
          company_workspace_id?: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string
          id?: string
          kind?: string
          plan?: string
          role_id?: string
          slack_thread_id?: string | null
          source?: string | null
          status?: string
          talent_ids?: string[]
          talent_stages?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_user_calendar_busy_blocks: {
        Row: {
          all_day: boolean
          company_user_id: string
          created_at: string
          end_at: string
          external_calendar_id: string
          external_event_id: string
          id: string
          is_blocking: boolean
          last_seen_at: string
          provider: string
          start_at: string
        }
        Insert: {
          all_day?: boolean
          company_user_id: string
          created_at?: string
          end_at: string
          external_calendar_id: string
          external_event_id: string
          id?: string
          is_blocking?: boolean
          last_seen_at?: string
          provider?: string
          start_at: string
        }
        Update: {
          all_day?: boolean
          company_user_id?: string
          created_at?: string
          end_at?: string
          external_calendar_id?: string
          external_event_id?: string
          id?: string
          is_blocking?: boolean
          last_seen_at?: string
          provider?: string
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_user_calendar_busy_blocks_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      company_user_integrations: {
        Row: {
          company_user_id: string
          composio_connected_account_id: string
          created_at: string
          last_sync_window_end_at: string | null
          last_synced_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          company_user_id: string
          composio_connected_account_id: string
          created_at?: string
          last_sync_window_end_at?: string | null
          last_synced_at?: string | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_user_id?: string
          composio_connected_account_id?: string
          created_at?: string
          last_sync_window_end_at?: string | null
          last_synced_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_user_integrations_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      company_user_workspace: {
        Row: {
          access_scope: string
          authority: string
          company_user_id: string
          company_workspace_id: string
          created_at: string
          id: string
          role: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          access_scope?: string
          authority?: string
          company_user_id: string
          company_workspace_id: string
          created_at?: string
          id?: string
          role?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          access_scope?: string
          authority?: string
          company_user_id?: string
          company_workspace_id?: string
          created_at?: string
          id?: string
          role?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_user_workspace_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_user_workspace_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_user_workspace_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "company_workspace_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          company: string | null
          company_description: string | null
          created_at: string
          email: string | null
          email_preferences: Json
          is_authenticated: boolean
          is_custom: boolean
          locale: string | null
          location: string | null
          name: string | null
          onboarding_completed_at: string | null
          profile_picture: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          company_description?: string | null
          created_at?: string
          email?: string | null
          email_preferences?: Json
          is_authenticated?: boolean
          is_custom?: boolean
          locale?: string | null
          location?: string | null
          name?: string | null
          onboarding_completed_at?: string | null
          profile_picture?: string | null
          role?: string | null
          user_id?: string
        }
        Update: {
          company?: string | null
          company_description?: string | null
          created_at?: string
          email?: string | null
          email_preferences?: Json
          is_authenticated?: boolean
          is_custom?: boolean
          locale?: string | null
          location?: string | null
          name?: string | null
          onboarding_completed_at?: string | null
          profile_picture?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      company_workspace: {
        Row: {
          billing_checkout: Json | null
          billing_free_anchor_at: string | null
          billing_model: string
          billing_reconciled_at: string | null
          billing_started_at: string | null
          brief: string | null
          career_url: string | null
          company_db_id: number | null
          company_description: string | null
          company_name: string
          company_workspace_id: string
          created_at: string
          external_roles_enabled: boolean
          has_career_page: boolean
          homepage_url: string | null
          is_reviewing: boolean
          review_domain: string | null
          signup_notification: Json | null
          is_internal: boolean
          is_scrape_original: boolean
          linkedin_url: string | null
          locale: string | null
          logo_url: string | null
          pitch: string | null
          published_name: string | null
          request: string | null
          signup_domain: string | null
          signup_state: Json | null
          stripe_customer_id: string | null
          test_score: number
          updated_at: string
        }
        Insert: {
          billing_checkout?: Json | null
          billing_free_anchor_at?: string | null
          billing_model?: string
          billing_reconciled_at?: string | null
          billing_started_at?: string | null
          brief?: string | null
          career_url?: string | null
          company_db_id?: number | null
          company_description?: string | null
          company_name: string
          company_workspace_id?: string
          created_at?: string
          external_roles_enabled?: boolean
          has_career_page?: boolean
          homepage_url?: string | null
          is_reviewing?: boolean
          review_domain?: string | null
          signup_notification?: Json | null
          is_internal?: boolean
          is_scrape_original?: boolean
          linkedin_url?: string | null
          locale?: string | null
          logo_url?: string | null
          pitch?: string | null
          published_name?: string | null
          request?: string | null
          signup_domain?: string | null
          signup_state?: Json | null
          stripe_customer_id?: string | null
          test_score?: number
          updated_at?: string
        }
        Update: {
          billing_checkout?: Json | null
          billing_free_anchor_at?: string | null
          billing_model?: string
          billing_reconciled_at?: string | null
          billing_started_at?: string | null
          brief?: string | null
          career_url?: string | null
          company_db_id?: number | null
          company_description?: string | null
          company_name?: string
          company_workspace_id?: string
          created_at?: string
          external_roles_enabled?: boolean
          has_career_page?: boolean
          homepage_url?: string | null
          is_reviewing?: boolean
          review_domain?: string | null
          signup_notification?: Json | null
          is_internal?: boolean
          is_scrape_original?: boolean
          linkedin_url?: string | null
          locale?: string | null
          logo_url?: string | null
          pitch?: string | null
          published_name?: string | null
          request?: string | null
          signup_domain?: string | null
          signup_state?: Json | null
          stripe_customer_id?: string | null
          test_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_company_db_id_fkey"
            columns: ["company_db_id"]
            isOneToOne: false
            referencedRelation: "company_db"
            referencedColumns: ["id"]
          },
        ]
      }
      company_workspace_credit_events: {
        Row: {
          action_code: string
          action_payload: Json
          actor_id: string
          attempts: number
          business_key: string
          company_workspace_id: string
          completed_at: string | null
          created_at: string
          delta: number
          execution_token: string | null
          execution_until: string | null
          id: string
          period_id: string | null
          role_id: string
          talent_id: string
        }
        Insert: {
          action_code: string
          action_payload?: Json
          actor_id: string
          attempts?: number
          business_key: string
          company_workspace_id: string
          completed_at?: string | null
          created_at?: string
          delta: number
          execution_token?: string | null
          execution_until?: string | null
          id?: string
          period_id?: string | null
          role_id: string
          talent_id: string
        }
        Update: {
          action_code?: string
          action_payload?: Json
          actor_id?: string
          attempts?: number
          business_key?: string
          company_workspace_id?: string
          completed_at?: string | null
          created_at?: string
          delta?: number
          execution_token?: string | null
          execution_until?: string | null
          id?: string
          period_id?: string | null
          role_id?: string
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_credit_even_period_id_company_workspace__fkey"
            columns: ["period_id", "company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace_credit_periods"
            referencedColumns: ["id", "company_workspace_id"]
          },
          {
            foreignKeyName: "company_workspace_credit_events_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_workspace_credit_events_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      company_workspace_credit_periods: {
        Row: {
          agent_id: string | null
          allowance: number
          company_workspace_id: string
          confirmed_at: string
          ends_at: string
          id: string
          remaining: number
          slot_id: string | null
          starts_at: string
          stripe_invoice_id: string | null
        }
        Insert: {
          agent_id?: string | null
          allowance: number
          company_workspace_id: string
          confirmed_at?: string
          ends_at: string
          id?: string
          remaining: number
          slot_id?: string | null
          starts_at: string
          stripe_invoice_id?: string | null
        }
        Update: {
          agent_id?: string | null
          allowance?: number
          company_workspace_id?: string
          confirmed_at?: string
          ends_at?: string
          id?: string
          remaining?: number
          slot_id?: string | null
          starts_at?: string
          stripe_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_credit_peri_slot_id_company_workspace_i_fkey"
            columns: ["slot_id", "company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace_agents"
            referencedColumns: ["id", "company_workspace_id"]
          },
          {
            foreignKeyName: "company_workspace_credit_peri_slot_id_company_workspace_i_fkey"
            columns: ["slot_id", "company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace_slots"
            referencedColumns: ["id", "company_workspace_id"]
          },
          {
            foreignKeyName: "company_workspace_credit_periods_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      company_workspace_invitations: {
        Row: {
          accepted_at: string | null
          access_scope: string
          company_workspace_id: string
          created_at: string
          email: string
          invitation_id: string
          invited_by_user_id: string | null
          last_sent_at: string
          role: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          access_scope?: string
          company_workspace_id: string
          created_at?: string
          email: string
          invitation_id?: string
          invited_by_user_id?: string | null
          last_sent_at?: string
          role?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          access_scope?: string
          company_workspace_id?: string
          created_at?: string
          email?: string
          invitation_id?: string
          invited_by_user_id?: string | null
          last_sent_at?: string
          role?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_invitations_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "company_workspace_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_workspace_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "company_workspace_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      company_workspace_merge_audit: {
        Row: {
          duplicate_company_name: string
          duplicate_homepage_url: string | null
          duplicate_linkedin_url: string | null
          duplicate_logo_url: string | null
          duplicate_role_count: number
          duplicate_workspace_id: string
          merged_at: string
          name_key: string
          run_id: string
          target_company_db_id: number
          target_company_name: string
          target_homepage_url: string | null
          target_linkedin_url: string | null
          target_workspace_id: string
        }
        Insert: {
          duplicate_company_name: string
          duplicate_homepage_url?: string | null
          duplicate_linkedin_url?: string | null
          duplicate_logo_url?: string | null
          duplicate_role_count?: number
          duplicate_workspace_id: string
          merged_at?: string
          name_key: string
          run_id: string
          target_company_db_id: number
          target_company_name: string
          target_homepage_url?: string | null
          target_linkedin_url?: string | null
          target_workspace_id: string
        }
        Update: {
          duplicate_company_name?: string
          duplicate_homepage_url?: string | null
          duplicate_linkedin_url?: string | null
          duplicate_logo_url?: string | null
          duplicate_role_count?: number
          duplicate_workspace_id?: string
          merged_at?: string
          name_key?: string
          run_id?: string
          target_company_db_id?: number
          target_company_name?: string
          target_homepage_url?: string | null
          target_linkedin_url?: string | null
          target_workspace_id?: string
        }
        Relationships: []
      }
      company_workspace_quality_label: {
        Row: {
          company_workspace_id: string
          created_at: string
          human_quality_label: number | null
          human_quality_labeled_at: string | null
          llm_quality_label: number | null
          llm_quality_label_reason: string | null
          llm_quality_label_v2: number | null
          llm_quality_labeled_at: string | null
          updated_at: string
        }
        Insert: {
          company_workspace_id: string
          created_at?: string
          human_quality_label?: number | null
          human_quality_labeled_at?: string | null
          llm_quality_label?: number | null
          llm_quality_label_reason?: string | null
          llm_quality_label_v2?: number | null
          llm_quality_labeled_at?: string | null
          updated_at?: string
        }
        Update: {
          company_workspace_id?: string
          created_at?: string
          human_quality_label?: number | null
          human_quality_labeled_at?: string | null
          llm_quality_label?: number | null
          llm_quality_label_reason?: string | null
          llm_quality_label_v2?: number | null
          llm_quality_labeled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_quality_label_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: true
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      company_workspace_slots: {
        Row: {
          assigned_role_id: string | null
          billing_change: Json | null
          billing_interval: string
          cancel_at: string | null
          company_workspace_id: string
          created_at: string
          current_period_end: string | null
          ended_at: string | null
          grant_metadata: Json | null
          grant_request_id: string | null
          id: string
          revision: number
          source: string
          started_at: string
          status: string
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_cancel_at: string | null
          subscription_slot_number: number
          updated_at: string
        }
        Insert: {
          assigned_role_id?: string | null
          billing_change?: Json | null
          billing_interval?: string
          cancel_at?: string | null
          company_workspace_id: string
          created_at?: string
          current_period_end?: string | null
          ended_at?: string | null
          grant_metadata?: Json | null
          grant_request_id?: string | null
          id?: string
          revision?: number
          source?: string
          started_at: string
          status: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at?: string | null
          subscription_slot_number?: number
          updated_at?: string
        }
        Update: {
          assigned_role_id?: string | null
          billing_change?: Json | null
          billing_interval?: string
          cancel_at?: string | null
          company_workspace_id?: string
          created_at?: string
          current_period_end?: string | null
          ended_at?: string | null
          grant_metadata?: Json | null
          grant_request_id?: string | null
          id?: string
          revision?: number
          source?: string
          started_at?: string
          status?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at?: string | null
          subscription_slot_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_slots_assigned_role_id_fkey"
            columns: ["assigned_role_id"]
            isOneToOne: true
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_workspace_slots_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      company_workspace_team_members: {
        Row: {
          membership_id: string
          team_id: string
        }
        Insert: {
          membership_id: string
          team_id: string
        }
        Update: {
          membership_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_team_members_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "company_user_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_workspace_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "company_workspace_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      company_workspace_teams: {
        Row: {
          company_workspace_id: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_workspace_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_workspace_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_teams_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      connection: {
        Row: {
          candid_id: string | null
          created_at: string
          id: number
          last_updated_at: string
          text: string | null
          typed: number | null
          user_id: string | null
        }
        Insert: {
          candid_id?: string | null
          created_at?: string
          id?: number
          last_updated_at?: string
          text?: string | null
          typed?: number | null
          user_id?: string | null
        }
        Update: {
          candid_id?: string | null
          created_at?: string
          id?: number
          last_updated_at?: string
          text?: string | null
          typed?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      contact_queue: {
        Row: {
          attempts: number
          cancelled_at: string | null
          company_talent_relay_id: string | null
          company_talent_request_id: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          recommendation_id: string | null
          resend_email_id: string | null
          role_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          cancelled_at?: string | null
          company_talent_relay_id?: string | null
          company_talent_request_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          recommendation_id?: string | null
          resend_email_id?: string | null
          role_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          cancelled_at?: string | null
          company_talent_relay_id?: string | null
          company_talent_request_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          recommendation_id?: string | null
          resend_email_id?: string | null
          role_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_queue_company_talent_relay_id_fkey"
            columns: ["company_talent_relay_id"]
            isOneToOne: false
            referencedRelation: "company_talent_relays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_queue_company_talent_request_id_fkey"
            columns: ["company_talent_request_id"]
            isOneToOne: false
            referencedRelation: "company_talent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_queue_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_queue_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_queue_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "contact_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      credits: {
        Row: {
          charged_credit: number | null
          created_at: string
          id: number
          last_updated_at: string | null
          remain_credit: number | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          charged_credit?: number | null
          created_at?: string
          id?: number
          last_updated_at?: string | null
          remain_credit?: number | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          charged_credit?: number | null
          created_at?: string
          id?: number
          last_updated_at?: string | null
          remain_credit?: number | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      credits_history: {
        Row: {
          charged_credits: number | null
          created_at: string
          event_type: string | null
          id: number
          user_id: string | null
        }
        Insert: {
          charged_credits?: number | null
          created_at?: string
          event_type?: string | null
          id?: number
          user_id?: string | null
        }
        Update: {
          charged_credits?: number | null
          created_at?: string
          event_type?: string | null
          id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credits_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_email_broadcasts: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          html_content: string
          id: string
          name: string
          queued_at: string | null
          recipient_onboarding_done_only: boolean
          recipient_preferred_locale: string | null
          scheduled_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          html_content: string
          id?: string
          name: string
          queued_at?: string | null
          recipient_onboarding_done_only?: boolean
          recipient_preferred_locale?: string | null
          scheduled_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          name?: string
          queued_at?: string | null
          recipient_onboarding_done_only?: boolean
          recipient_preferred_locale?: string | null
          scheduled_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_email_campaign_deliveries: {
        Row: {
          campaign_id: string
          discovery_run_id: string
          sent_at: string
          talent_id: string
        }
        Insert: {
          campaign_id: string
          discovery_run_id: string
          sent_at?: string
          talent_id: string
        }
        Update: {
          campaign_id?: string
          discovery_run_id?: string
          sent_at?: string
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_campaign_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_email_campaign_deliveries_discovery_run_id_fkey"
            columns: ["discovery_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_email_campaign_deliveries_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_email_campaigns: {
        Row: {
          created_at: string
          email_title: string | null
          html_content: string
          id: string
          max_sends_per_user: number
          max_total_sends: number
          name: string
          recipient_preferred_locale: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_title?: string | null
          html_content: string
          id?: string
          max_sends_per_user?: number
          max_total_sends?: number
          name: string
          recipient_preferred_locale?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_title?: string | null
          html_content?: string
          id?: string
          max_sends_per_user?: number
          max_total_sends?: number
          name?: string
          recipient_preferred_locale?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crunchbase_history: {
        Row: {
          company_db_id: number | null
          content: Json
          created_at: string
          fetched_at: string
          id: string
          organization_permalink: string | null
          organization_url: string
          source_actor: string | null
        }
        Insert: {
          company_db_id?: number | null
          content?: Json
          created_at?: string
          fetched_at?: string
          id?: string
          organization_permalink?: string | null
          organization_url: string
          source_actor?: string | null
        }
        Update: {
          company_db_id?: number | null
          content?: Json
          created_at?: string
          fetched_at?: string
          id?: string
          organization_permalink?: string | null
          organization_url?: string
          source_actor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crunchbase_history_company_db_id_fkey"
            columns: ["company_db_id"]
            isOneToOne: false
            referencedRelation: "company_db"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          excerpt: string | null
          id: number
          markdown: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          excerpt?: string | null
          id?: number
          markdown?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          excerpt?: string | null
          id?: number
          markdown?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: []
      }
      edu_user: {
        Row: {
          candid_id: string | null
          created_at: string
          degree: string | null
          description: string | null
          end_date: string | null
          field: string | null
          id: string
          school: string | null
          start_date: string | null
          url: string | null
        }
        Insert: {
          candid_id?: string | null
          created_at?: string
          degree?: string | null
          description?: string | null
          end_date?: string | null
          field?: string | null
          id?: string
          school?: string | null
          start_date?: string | null
          url?: string | null
        }
        Update: {
          candid_id?: string | null
          created_at?: string
          degree?: string | null
          description?: string | null
          end_date?: string | null
          field?: string | null
          id?: string
          school?: string | null
          start_date?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_user_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
      }
      email_inbound_events: {
        Row: {
          attachments: Json
          cc_addresses: string[]
          created_at: string
          from_email: string | null
          id: string
          message_id: string | null
          provider: string
          provider_email_id: string
          provider_event_id: string | null
          received_at: string
          subject: string | null
          to_addresses: string[]
        }
        Insert: {
          attachments?: Json
          cc_addresses?: string[]
          created_at?: string
          from_email?: string | null
          id?: string
          message_id?: string | null
          provider?: string
          provider_email_id: string
          provider_event_id?: string | null
          received_at?: string
          subject?: string | null
          to_addresses?: string[]
        }
        Update: {
          attachments?: Json
          cc_addresses?: string[]
          created_at?: string
          from_email?: string | null
          id?: string
          message_id?: string | null
          provider?: string
          provider_email_id?: string
          provider_event_id?: string | null
          received_at?: string
          subject?: string | null
          to_addresses?: string[]
        }
        Relationships: []
      }
      email_reply_aliases: {
        Row: {
          company_user_id: string | null
          company_workspace_id: string | null
          company_conversation_id: string | null
          metadata: Json
          company_talent_request_id: string | null
          conversation_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          talent_id: string | null
          token_hash: string
        }
        Insert: {
          company_user_id?: string | null
          company_workspace_id?: string | null
          company_conversation_id?: string | null
          metadata?: Json
          company_talent_request_id?: string | null
          conversation_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          talent_id?: string | null
          token_hash: string
        }
        Update: {
          company_user_id?: string | null
          company_workspace_id?: string | null
          company_conversation_id?: string | null
          metadata?: Json
          company_talent_request_id?: string | null
          conversation_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          talent_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_reply_aliases_company_talent_request_id_fkey"
            columns: ["company_talent_request_id"]
            isOneToOne: false
            referencedRelation: "company_talent_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_reply_aliases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_reply_aliases_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      email_reply_jobs: {
        Row: {
          assistant_message_id: number | null
          attempts: number
          conversation_id: string | null
          created_at: string
          id: string
          inbound_event_id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          metadata: Json
          processed_at: string | null
          resend_email_id: string | null
          skip_reason: string | null
          status: string
          talent_id: string | null
          updated_at: string
          user_message_id: number | null
        }
        Insert: {
          assistant_message_id?: number | null
          attempts?: number
          conversation_id?: string | null
          created_at?: string
          id?: string
          inbound_event_id: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          processed_at?: string | null
          resend_email_id?: string | null
          skip_reason?: string | null
          status?: string
          talent_id?: string | null
          updated_at?: string
          user_message_id?: number | null
        }
        Update: {
          assistant_message_id?: number | null
          attempts?: number
          conversation_id?: string | null
          created_at?: string
          id?: string
          inbound_event_id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json
          processed_at?: string | null
          resend_email_id?: string | null
          skip_reason?: string | null
          status?: string
          talent_id?: string | null
          updated_at?: string
          user_message_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_reply_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_reply_jobs_inbound_event_id_fkey"
            columns: ["inbound_event_id"]
            isOneToOne: true
            referencedRelation: "email_inbound_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_reply_jobs_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ensemble_variants: {
        Row: {
          allow_fallback: boolean
          created_at: string
          expand_threshold: number
          extra_info: string | null
          fallback_only: boolean
          fallback_threshold: number
          id: number
          is_active: boolean
          name: string
          priority: number
          provider: string
          temperature: number
          updated_at: string
          weight: number
        }
        Insert: {
          allow_fallback?: boolean
          created_at?: string
          expand_threshold?: number
          extra_info?: string | null
          fallback_only?: boolean
          fallback_threshold?: number
          id?: number
          is_active?: boolean
          name: string
          priority?: number
          provider?: string
          temperature?: number
          updated_at?: string
          weight?: number
        }
        Update: {
          allow_fallback?: boolean
          created_at?: string
          expand_threshold?: number
          extra_info?: string | null
          fallback_only?: boolean
          fallback_threshold?: number
          id?: number
          is_active?: boolean
          name?: string
          priority?: number
          provider?: string
          temperature?: number
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      experience_user: {
        Row: {
          candid_id: string | null
          company_id: number | null
          created_at: string
          description: string | null
          end_date: string | null
          id: number
          months: number | null
          role: string | null
          start_date: string | null
        }
        Insert: {
          candid_id?: string | null
          company_id?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: number
          months?: number | null
          role?: string | null
          start_date?: string | null
        }
        Update: {
          candid_id?: string | null
          company_id?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: number
          months?: number | null
          role?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_user_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_user_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_db"
            referencedColumns: ["id"]
          },
        ]
      }
      external_recommendation_runs: {
        Row: {
          attempts: number
          created_at: string
          day_key: string | null
          discovery_run_id: string | null
          error: string | null
          experiment: string
          finished_at: string | null
          id: string
          lease_expires_at: string | null
          lease_token: string | null
          locale: string | null
          metrics: Json
          plan: Json | null
          provider: string | null
          role_ids: string[]
          status: string
          surface: string
          talent_id: string
          time_zone: string | null
          variant: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          day_key?: string | null
          discovery_run_id?: string | null
          error?: string | null
          experiment: string
          finished_at?: string | null
          id?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          locale?: string | null
          metrics?: Json
          plan?: Json | null
          provider?: string | null
          role_ids?: string[]
          status?: string
          surface: string
          talent_id: string
          time_zone?: string | null
          variant: string
        }
        Update: {
          attempts?: number
          created_at?: string
          day_key?: string | null
          discovery_run_id?: string | null
          error?: string | null
          experiment?: string
          finished_at?: string | null
          id?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          locale?: string | null
          metrics?: Json
          plan?: Json | null
          provider?: string | null
          role_ids?: string[]
          status?: string
          surface?: string
          talent_id?: string
          time_zone?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_recommendation_runs_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      extra_experience: {
        Row: {
          candid_id: string | null
          created_at: string
          description: string | null
          id: number
          issued_at: string | null
          issued_by: string | null
          title: string | null
          type: string | null
        }
        Insert: {
          candid_id?: string | null
          created_at?: string
          description?: string | null
          id?: number
          issued_at?: string | null
          issued_by?: string | null
          title?: string | null
          type?: string | null
        }
        Update: {
          candid_id?: string | null
          created_at?: string
          description?: string | null
          id?: number
          issued_at?: string | null
          issued_by?: string | null
          title?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extra_experience_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          content: string | null
          created_at: string
          from: string | null
          id: number
          reply_id: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          from?: string | null
          id?: number
          reply_id?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          from?: string | null
          id?: number
          reply_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      github_profile: {
        Row: {
          activity_summary: Json | null
          avatar_url: string | null
          bio: string | null
          blog: string | null
          candid_id: string | null
          company: string | null
          created_at: string | null
          email: string | null
          followers: number | null
          following: number | null
          github_created_at: string | null
          github_id: number | null
          github_url: string | null
          github_username: string
          id: string
          is_hireable: boolean | null
          is_site_admin: boolean | null
          last_fetched_at: string | null
          location: string | null
          name: string | null
          node_id: string | null
          public_gists: number | null
          public_repos: number | null
          readme_markdown: string | null
          search_text: string | null
          updated_at: string | null
        }
        Insert: {
          activity_summary?: Json | null
          avatar_url?: string | null
          bio?: string | null
          blog?: string | null
          candid_id?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          followers?: number | null
          following?: number | null
          github_created_at?: string | null
          github_id?: number | null
          github_url?: string | null
          github_username: string
          id?: string
          is_hireable?: boolean | null
          is_site_admin?: boolean | null
          last_fetched_at?: string | null
          location?: string | null
          name?: string | null
          node_id?: string | null
          public_gists?: number | null
          public_repos?: number | null
          readme_markdown?: string | null
          search_text?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_summary?: Json | null
          avatar_url?: string | null
          bio?: string | null
          blog?: string | null
          candid_id?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          followers?: number | null
          following?: number | null
          github_created_at?: string | null
          github_id?: number | null
          github_url?: string | null
          github_username?: string
          id?: string
          is_hireable?: boolean | null
          is_site_admin?: boolean | null
          last_fetched_at?: string | null
          location?: string | null
          name?: string | null
          node_id?: string | null
          public_gists?: number | null
          public_repos?: number | null
          readme_markdown?: string | null
          search_text?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "github_profile_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
      }
      github_repo: {
        Row: {
          created_at: string | null
          description: string | null
          forks: number | null
          github_id: number | null
          homepage: string | null
          id: string
          is_archived: boolean | null
          is_disabled: boolean | null
          is_fork: boolean | null
          language: string | null
          languages: Json | null
          last_fetched_at: string | null
          license: string | null
          node_id: string | null
          open_issues: number | null
          owner: string
          pushed_at: string | null
          readme_excerpt: string | null
          repo_created_at: string | null
          repo_full_name: string
          repo_name: string
          search_text: string | null
          stars: number | null
          topics: string[] | null
          updated_at: string | null
          watchers: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          forks?: number | null
          github_id?: number | null
          homepage?: string | null
          id?: string
          is_archived?: boolean | null
          is_disabled?: boolean | null
          is_fork?: boolean | null
          language?: string | null
          languages?: Json | null
          last_fetched_at?: string | null
          license?: string | null
          node_id?: string | null
          open_issues?: number | null
          owner: string
          pushed_at?: string | null
          readme_excerpt?: string | null
          repo_created_at?: string | null
          repo_full_name: string
          repo_name: string
          search_text?: string | null
          stars?: number | null
          topics?: string[] | null
          updated_at?: string | null
          watchers?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          forks?: number | null
          github_id?: number | null
          homepage?: string | null
          id?: string
          is_archived?: boolean | null
          is_disabled?: boolean | null
          is_fork?: boolean | null
          language?: string | null
          languages?: Json | null
          last_fetched_at?: string | null
          license?: string | null
          node_id?: string | null
          open_issues?: number | null
          owner?: string
          pushed_at?: string | null
          readme_excerpt?: string | null
          repo_created_at?: string | null
          repo_full_name?: string
          repo_name?: string
          search_text?: string | null
          stars?: number | null
          topics?: string[] | null
          updated_at?: string | null
          watchers?: number | null
        }
        Relationships: []
      }
      github_repo_contribution: {
        Row: {
          commits: number
          created_at: string
          description: string | null
          github_profile_id: string | null
          id: number
          last_contrib_at: string | null
          merged_prs: number
          repo_id: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          commits?: number
          created_at?: string
          description?: string | null
          github_profile_id?: string | null
          id?: number
          last_contrib_at?: string | null
          merged_prs?: number
          repo_id?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          commits?: number
          created_at?: string
          description?: string | null
          github_profile_id?: string | null
          id?: number
          last_contrib_at?: string | null
          merged_prs?: number
          repo_id?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_repo_contribution_github_profile_id_fkey"
            columns: ["github_profile_id"]
            isOneToOne: false
            referencedRelation: "github_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "github_repo_contribution_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "github_repo"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_accounts: {
        Row: {
          archived_at: string | null
          as_of: string | null
          audience_evidence: Json
          audience_summary: string | null
          collected_at: string | null
          created_at: string
          created_by: string | null
          creator_id: string | null
          external_id: string | null
          handle: string | null
          id: string
          last_post_at: string | null
          owner_kind: string
          platform: string
          profile_url: string | null
          provider_scope: string
          ref: number
          row_version: number
          source_ref: string | null
          updated_at: string
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          archived_at?: string | null
          as_of?: string | null
          audience_evidence?: Json
          audience_summary?: string | null
          collected_at?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          external_id?: string | null
          handle?: string | null
          id?: string
          last_post_at?: string | null
          owner_kind?: string
          platform: string
          profile_url?: string | null
          provider_scope?: string
          ref?: never
          row_version?: number
          source_ref?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          archived_at?: string | null
          as_of?: string | null
          audience_evidence?: Json
          audience_summary?: string | null
          collected_at?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          external_id?: string | null
          handle?: string | null
          id?: string
          last_post_at?: string | null
          owner_kind?: string
          platform?: string
          profile_url?: string | null
          provider_scope?: string
          ref?: never
          row_version?: number
          source_ref?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["creator_id"]
          },
        ]
      }
      gtm_activities: {
        Row: {
          archived_at: string | null
          body: string | null
          connection_ref: string | null
          correction_of_id: string | null
          created_at: string
          created_by: string | null
          entity: string | null
          entity_id: string | null
          external_id: string | null
          id: string
          kind: string
          occurred_at: string
          outreach_template_id: string | null
          payload: Json
          provider: string | null
          ref: number
          request_id: string | null
          row_version: number
          source_ref: string | null
          thread_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          body?: string | null
          connection_ref?: string | null
          correction_of_id?: string | null
          created_at?: string
          created_by?: string | null
          entity?: string | null
          entity_id?: string | null
          external_id?: string | null
          id?: string
          kind: string
          occurred_at?: string
          outreach_template_id?: string | null
          payload?: Json
          provider?: string | null
          ref?: never
          request_id?: string | null
          row_version?: number
          source_ref?: string | null
          thread_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          body?: string | null
          connection_ref?: string | null
          correction_of_id?: string | null
          created_at?: string
          created_by?: string | null
          entity?: string | null
          entity_id?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          outreach_template_id?: string | null
          payload?: Json
          provider?: string | null
          ref?: never
          request_id?: string | null
          row_version?: number
          source_ref?: string | null
          thread_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_activities_correction_of_id_fkey"
            columns: ["correction_of_id"]
            isOneToOne: false
            referencedRelation: "gtm_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_activities_correction_of_id_fkey"
            columns: ["correction_of_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_activities_outreach_template_id_fkey"
            columns: ["outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["outreach_template_id"]
          },
          {
            foreignKeyName: "gtm_activities_outreach_template_id_fkey"
            columns: ["outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_template_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_activities_outreach_template_id_fkey"
            columns: ["outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_campaigns: {
        Row: {
          archived_at: string | null
          audience_brief: string | null
          created_at: string
          created_by: string | null
          description: string | null
          guide_ref: string | null
          guide_version: string | null
          id: string
          name: string
          owner_id: string | null
          ref: number
          row_version: number
          updated_at: string
          updated_by: string | null
          value_proposition: string | null
        }
        Insert: {
          archived_at?: string | null
          audience_brief?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          guide_ref?: string | null
          guide_version?: string | null
          id?: string
          name: string
          owner_id?: string | null
          ref?: never
          row_version?: number
          updated_at?: string
          updated_by?: string | null
          value_proposition?: string | null
        }
        Update: {
          archived_at?: string | null
          audience_brief?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          guide_ref?: string | null
          guide_version?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          ref?: never
          row_version?: number
          updated_at?: string
          updated_by?: string | null
          value_proposition?: string | null
        }
        Relationships: []
      }
      gtm_collaborations: {
        Row: {
          action_items: Json
          agreed_at: string | null
          archived_at: string | null
          close_reason: string | null
          closed_at: string | null
          compensation_strategy_id: string | null
          contact_ref: string | null
          created_at: string
          created_by: string | null
          creator_id: string
          due_at: string | null
          id: string
          origin_activity_id: string | null
          owner_id: string | null
          plan_id: string | null
          previous_collaboration_id: string | null
          ref: number
          row_version: number
          status: string
          terms: string | null
          terms_version: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action_items?: Json
          agreed_at?: string | null
          archived_at?: string | null
          close_reason?: string | null
          closed_at?: string | null
          compensation_strategy_id?: string | null
          contact_ref?: string | null
          created_at?: string
          created_by?: string | null
          creator_id: string
          due_at?: string | null
          id?: string
          origin_activity_id?: string | null
          owner_id?: string | null
          plan_id?: string | null
          previous_collaboration_id?: string | null
          ref?: never
          row_version?: number
          status?: string
          terms?: string | null
          terms_version?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action_items?: Json
          agreed_at?: string | null
          archived_at?: string | null
          close_reason?: string | null
          closed_at?: string | null
          compensation_strategy_id?: string | null
          contact_ref?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string
          due_at?: string | null
          id?: string
          origin_activity_id?: string | null
          owner_id?: string | null
          plan_id?: string | null
          previous_collaboration_id?: string | null
          ref?: never
          row_version?: number
          status?: string
          terms?: string | null
          terms_version?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_collaborations_compensation_strategy_id_fkey"
            columns: ["compensation_strategy_id"]
            isOneToOne: false
            referencedRelation: "gtm_compensation_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_compensation_strategy_id_fkey"
            columns: ["compensation_strategy_id"]
            isOneToOne: false
            referencedRelation: "gtm_compensation_strategy_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_collaborations_origin_fk"
            columns: ["origin_activity_id"]
            isOneToOne: false
            referencedRelation: "gtm_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_origin_fk"
            columns: ["origin_activity_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "gtm_plan_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "gtm_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_previous_collaboration_id_fkey"
            columns: ["previous_collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_collaborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_collaborations_previous_collaboration_id_fkey"
            columns: ["previous_collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_collaborations_previous_collaboration_id_fkey"
            columns: ["previous_collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_collaborations_previous_collaboration_id_fkey"
            columns: ["previous_collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_collaborations_previous_collaboration_id_fkey"
            columns: ["previous_collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_collaborations_previous_collaboration_id_fkey"
            columns: ["previous_collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_collaborations_previous_collaboration_id_fkey"
            columns: ["previous_collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_collaborations_previous_collaboration_id_fkey"
            columns: ["previous_collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
        ]
      }
      gtm_compensation_strategies: {
        Row: {
          amount_per_unit: number | null
          archived_at: string | null
          base_fee: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_recommended: boolean
          measurement_window_days: number
          name: string
          notes: string | null
          pricing_model: string
          recommendation_reason: string | null
          recommended_at: string | null
          ref: number
          row_version: number
          status: string
          updated_at: string
          updated_by: string | null
          version: number
          views_per_unit: number | null
        }
        Insert: {
          amount_per_unit?: number | null
          archived_at?: string | null
          base_fee?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_recommended?: boolean
          measurement_window_days?: number
          name: string
          notes?: string | null
          pricing_model?: string
          recommendation_reason?: string | null
          recommended_at?: string | null
          ref?: never
          row_version?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          views_per_unit?: number | null
        }
        Update: {
          amount_per_unit?: number | null
          archived_at?: string | null
          base_fee?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_recommended?: boolean
          measurement_window_days?: number
          name?: string
          notes?: string | null
          pricing_model?: string
          recommendation_reason?: string | null
          recommended_at?: string | null
          ref?: never
          row_version?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          views_per_unit?: number | null
        }
        Relationships: []
      }
      gtm_contents: {
        Row: {
          account_id: string | null
          action_items: Json
          archived_at: string | null
          asset_refs: Json
          brief_ref: string | null
          brief_version: string | null
          campaign_id: string | null
          collaboration_id: string | null
          compensation_cost_id: string | null
          compensation_snapshot: Json
          compensation_strategy_id: string | null
          content_group_id: string
          created_at: string
          created_by: string | null
          creator_id: string | null
          cta: string | null
          destination_url: string | null
          distribution_type: string
          due_at: string | null
          execution_reason: string | null
          execution_snapshot: Json
          external_post_id: string | null
          format_id: string | null
          id: string
          language: string | null
          origin_activity_id: string | null
          placement: string | null
          plan_id: string | null
          platform_metrics_due_at: string | null
          platform_metrics_finalized_at: string | null
          platform_metrics_last_collected_at: string | null
          platform_metrics_last_error: string | null
          post_url: string | null
          previous_content_id: string | null
          production_status: string
          publish_status: string
          published_at: string | null
          ref: number
          reused_from_content_id: string | null
          rights_source: string | null
          row_version: number
          scheduled_at: string | null
          target_audience: string | null
          target_market: string | null
          title: string
          tracking_links: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id?: string | null
          action_items?: Json
          archived_at?: string | null
          asset_refs?: Json
          brief_ref?: string | null
          brief_version?: string | null
          campaign_id?: string | null
          collaboration_id?: string | null
          compensation_cost_id?: string | null
          compensation_snapshot?: Json
          compensation_strategy_id?: string | null
          content_group_id?: string
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          cta?: string | null
          destination_url?: string | null
          distribution_type?: string
          due_at?: string | null
          execution_reason?: string | null
          execution_snapshot?: Json
          external_post_id?: string | null
          format_id?: string | null
          id?: string
          language?: string | null
          origin_activity_id?: string | null
          placement?: string | null
          plan_id?: string | null
          platform_metrics_due_at?: string | null
          platform_metrics_finalized_at?: string | null
          platform_metrics_last_collected_at?: string | null
          platform_metrics_last_error?: string | null
          post_url?: string | null
          previous_content_id?: string | null
          production_status?: string
          publish_status?: string
          published_at?: string | null
          ref?: never
          reused_from_content_id?: string | null
          rights_source?: string | null
          row_version?: number
          scheduled_at?: string | null
          target_audience?: string | null
          target_market?: string | null
          title: string
          tracking_links?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string | null
          action_items?: Json
          archived_at?: string | null
          asset_refs?: Json
          brief_ref?: string | null
          brief_version?: string | null
          campaign_id?: string | null
          collaboration_id?: string | null
          compensation_cost_id?: string | null
          compensation_snapshot?: Json
          compensation_strategy_id?: string | null
          content_group_id?: string
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          cta?: string | null
          destination_url?: string | null
          distribution_type?: string
          due_at?: string | null
          execution_reason?: string | null
          execution_snapshot?: Json
          external_post_id?: string | null
          format_id?: string | null
          id?: string
          language?: string | null
          origin_activity_id?: string | null
          placement?: string | null
          plan_id?: string | null
          platform_metrics_due_at?: string | null
          platform_metrics_finalized_at?: string | null
          platform_metrics_last_collected_at?: string | null
          platform_metrics_last_error?: string | null
          post_url?: string | null
          previous_content_id?: string | null
          production_status?: string
          publish_status?: string
          published_at?: string | null
          ref?: never
          reused_from_content_id?: string | null
          rights_source?: string | null
          row_version?: number
          scheduled_at?: string | null
          target_audience?: string | null
          target_market?: string | null
          title?: string
          tracking_links?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_contents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gtm_account_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gtm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "gtm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_collaborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_compensation_cost_id_fkey"
            columns: ["compensation_cost_id"]
            isOneToOne: false
            referencedRelation: "gtm_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_compensation_strategy_id_fkey"
            columns: ["compensation_strategy_id"]
            isOneToOne: false
            referencedRelation: "gtm_compensation_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_compensation_strategy_id_fkey"
            columns: ["compensation_strategy_id"]
            isOneToOne: false
            referencedRelation: "gtm_compensation_strategy_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_contents_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "gtm_format_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "gtm_formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_origin_fk"
            columns: ["origin_activity_id"]
            isOneToOne: false
            referencedRelation: "gtm_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_origin_fk"
            columns: ["origin_activity_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "gtm_plan_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "gtm_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_previous_content_id_fkey"
            columns: ["previous_content_id"]
            isOneToOne: false
            referencedRelation: "gtm_content_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_previous_content_id_fkey"
            columns: ["previous_content_id"]
            isOneToOne: false
            referencedRelation: "gtm_contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_reused_from_content_id_fkey"
            columns: ["reused_from_content_id"]
            isOneToOne: false
            referencedRelation: "gtm_content_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_reused_from_content_id_fkey"
            columns: ["reused_from_content_id"]
            isOneToOne: false
            referencedRelation: "gtm_contents"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_costs: {
        Row: {
          agreed_amount: number | null
          allocations: Json
          archived_at: string | null
          base_currency: string
          collaboration_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          due_at: string | null
          expected_amount: number | null
          fx_rate: number
          fx_source: string | null
          hourly_rate: number | null
          id: string
          incurred_amount: number | null
          incurred_at: string | null
          kind: string
          labor_minutes: number | null
          measurement_basis: string | null
          payments: Json
          plan_id: string | null
          ref: number
          row_version: number
          source_ref: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agreed_amount?: number | null
          allocations?: Json
          archived_at?: string | null
          base_currency?: string
          collaboration_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          due_at?: string | null
          expected_amount?: number | null
          fx_rate?: number
          fx_source?: string | null
          hourly_rate?: number | null
          id?: string
          incurred_amount?: number | null
          incurred_at?: string | null
          kind: string
          labor_minutes?: number | null
          measurement_basis?: string | null
          payments?: Json
          plan_id?: string | null
          ref?: never
          row_version?: number
          source_ref?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agreed_amount?: number | null
          allocations?: Json
          archived_at?: string | null
          base_currency?: string
          collaboration_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          due_at?: string | null
          expected_amount?: number | null
          fx_rate?: number
          fx_source?: string | null
          hourly_rate?: number | null
          id?: string
          incurred_amount?: number | null
          incurred_at?: string | null
          kind?: string
          labor_minutes?: number | null
          measurement_basis?: string | null
          payments?: Json
          plan_id?: string | null
          ref?: never
          row_version?: number
          source_ref?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_costs_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_collaborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_costs_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_costs_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_costs_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_costs_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_costs_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_costs_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_costs_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_costs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "gtm_plan_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_costs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "gtm_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_creators: {
        Row: {
          activity_regions: string[]
          archived_at: string | null
          contact_restriction_source: string | null
          contacts: Json
          content_topics: string[]
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          do_not_contact: boolean
          id: string
          languages: string[]
          name: string
          notes: string | null
          outreach_score: number | null
          owner_id: string | null
          ref: number
          row_version: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_regions?: string[]
          archived_at?: string | null
          contact_restriction_source?: string | null
          contacts?: Json
          content_topics?: string[]
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          do_not_contact?: boolean
          id?: string
          languages?: string[]
          name: string
          notes?: string | null
          outreach_score?: number | null
          owner_id?: string | null
          ref?: never
          row_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_regions?: string[]
          archived_at?: string | null
          contact_restriction_source?: string | null
          contacts?: Json
          content_topics?: string[]
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          do_not_contact?: boolean
          id?: string
          languages?: string[]
          name?: string
          notes?: string | null
          outreach_score?: number | null
          owner_id?: string | null
          ref?: never
          row_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      gtm_formats: {
        Row: {
          archived_at: string | null
          caption_template: string | null
          cold_outreach_angle: string | null
          created_at: string
          created_by: string | null
          default_campaign_id: string | null
          default_outreach_template_id: string | null
          description: string | null
          example_links: string[]
          examples: Json
          guide_ref: string | null
          guide_version: string | null
          hook: string | null
          id: string
          kill_rule: string | null
          name: string
          owner_id: string | null
          ref: number
          replicate_rule: string | null
          required_moment: string | null
          row_version: number
          shot_sequence: string | null
          status: string
          target_creator_profile: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          caption_template?: string | null
          cold_outreach_angle?: string | null
          created_at?: string
          created_by?: string | null
          default_campaign_id?: string | null
          default_outreach_template_id?: string | null
          description?: string | null
          example_links?: string[]
          examples?: Json
          guide_ref?: string | null
          guide_version?: string | null
          hook?: string | null
          id?: string
          kill_rule?: string | null
          name: string
          owner_id?: string | null
          ref?: never
          replicate_rule?: string | null
          required_moment?: string | null
          row_version?: number
          shot_sequence?: string | null
          status?: string
          target_creator_profile?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          caption_template?: string | null
          cold_outreach_angle?: string | null
          created_at?: string
          created_by?: string | null
          default_campaign_id?: string | null
          default_outreach_template_id?: string | null
          description?: string | null
          example_links?: string[]
          examples?: Json
          guide_ref?: string | null
          guide_version?: string | null
          hook?: string | null
          id?: string
          kill_rule?: string | null
          name?: string
          owner_id?: string | null
          ref?: never
          replicate_rule?: string | null
          required_moment?: string | null
          row_version?: number
          shot_sequence?: string | null
          status?: string
          target_creator_profile?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_formats_default_campaign_id_fkey"
            columns: ["default_campaign_id"]
            isOneToOne: false
            referencedRelation: "gtm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_formats_default_outreach_template_id_fkey"
            columns: ["default_outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["outreach_template_id"]
          },
          {
            foreignKeyName: "gtm_formats_default_outreach_template_id_fkey"
            columns: ["default_outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_template_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_formats_default_outreach_template_id_fkey"
            columns: ["default_outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_metric_snapshots: {
        Row: {
          account_id: string | null
          archived_at: string | null
          as_of: string
          collected_at: string
          content_id: string | null
          created_at: string
          created_by: string | null
          definition_version: string
          id: string
          metric: string
          missing_reason: string | null
          period_end: string | null
          period_start: string | null
          ref: number
          retention_until: string | null
          row_version: number
          source_ref: string
          unit: string
          updated_at: string
          updated_by: string | null
          value: number | null
          value_kind: string
        }
        Insert: {
          account_id?: string | null
          archived_at?: string | null
          as_of: string
          collected_at?: string
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          definition_version: string
          id?: string
          metric: string
          missing_reason?: string | null
          period_end?: string | null
          period_start?: string | null
          ref?: never
          retention_until?: string | null
          row_version?: number
          source_ref: string
          unit: string
          updated_at?: string
          updated_by?: string | null
          value?: number | null
          value_kind?: string
        }
        Update: {
          account_id?: string | null
          archived_at?: string | null
          as_of?: string
          collected_at?: string
          content_id?: string | null
          created_at?: string
          created_by?: string | null
          definition_version?: string
          id?: string
          metric?: string
          missing_reason?: string | null
          period_end?: string | null
          period_start?: string | null
          ref?: never
          retention_until?: string | null
          row_version?: number
          source_ref?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
          value?: number | null
          value_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "gtm_metric_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gtm_account_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_metric_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gtm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_metric_snapshots_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "gtm_content_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_metric_snapshots_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "gtm_contents"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_outreach_dispatches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          attempt_count: number
          body: string
          collaboration_id: string | null
          compensation_snapshot: Json
          compensation_strategy_id: string | null
          connection_ref: string | null
          created_at: string
          created_by: string | null
          creator_id: string
          draft_activity_id: string | null
          email_references: string | null
          estimated_cost: number | null
          estimated_views: number | null
          failed_at: string | null
          first_attempt_at: string | null
          id: string
          in_reply_to: string | null
          last_error: string | null
          next_attempt_at: string | null
          outreach_template_id: string | null
          personalization_evidence: string | null
          prepare_input_hash: string
          prepare_request_id: string
          provider: string | null
          provider_message_id: string | null
          provider_rfc_message_id: string | null
          provider_thread_id: string | null
          recipient_email: string
          ref: number
          replied_at: string | null
          reply_to_activity_id: string | null
          review_note: string | null
          rfc_message_id: string
          row_version: number
          scheduled_at: string | null
          selection_reason: string
          send_request_id: string
          sender_email: string
          sending_started_at: string | null
          sent_at: string | null
          status: string
          subject: string
          template_version: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          attempt_count?: number
          body: string
          collaboration_id?: string | null
          compensation_snapshot?: Json
          compensation_strategy_id?: string | null
          connection_ref?: string | null
          created_at?: string
          created_by?: string | null
          creator_id: string
          draft_activity_id?: string | null
          email_references?: string | null
          estimated_cost?: number | null
          estimated_views?: number | null
          failed_at?: string | null
          first_attempt_at?: string | null
          id?: string
          in_reply_to?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          outreach_template_id?: string | null
          personalization_evidence?: string | null
          prepare_input_hash: string
          prepare_request_id: string
          provider?: string | null
          provider_message_id?: string | null
          provider_rfc_message_id?: string | null
          provider_thread_id?: string | null
          recipient_email: string
          ref?: never
          replied_at?: string | null
          reply_to_activity_id?: string | null
          review_note?: string | null
          rfc_message_id: string
          row_version?: number
          scheduled_at?: string | null
          selection_reason: string
          send_request_id?: string
          sender_email: string
          sending_started_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_version: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          attempt_count?: number
          body?: string
          collaboration_id?: string | null
          compensation_snapshot?: Json
          compensation_strategy_id?: string | null
          connection_ref?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string
          draft_activity_id?: string | null
          email_references?: string | null
          estimated_cost?: number | null
          estimated_views?: number | null
          failed_at?: string | null
          first_attempt_at?: string | null
          id?: string
          in_reply_to?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          outreach_template_id?: string | null
          personalization_evidence?: string | null
          prepare_input_hash?: string
          prepare_request_id?: string
          provider?: string | null
          provider_message_id?: string | null
          provider_rfc_message_id?: string | null
          provider_thread_id?: string | null
          recipient_email?: string
          ref?: never
          replied_at?: string | null
          reply_to_activity_id?: string | null
          review_note?: string | null
          rfc_message_id?: string
          row_version?: number
          scheduled_at?: string | null
          selection_reason?: string
          send_request_id?: string
          sender_email?: string
          sending_started_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_outreach_dispatches_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_collaborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_compensation_strategy_id_fkey"
            columns: ["compensation_strategy_id"]
            isOneToOne: false
            referencedRelation: "gtm_compensation_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_compensation_strategy_id_fkey"
            columns: ["compensation_strategy_id"]
            isOneToOne: false
            referencedRelation: "gtm_compensation_strategy_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_draft_activity_id_fkey"
            columns: ["draft_activity_id"]
            isOneToOne: false
            referencedRelation: "gtm_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_draft_activity_id_fkey"
            columns: ["draft_activity_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_outreach_template_id_fkey"
            columns: ["outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["outreach_template_id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_outreach_template_id_fkey"
            columns: ["outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_template_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_outreach_template_id_fkey"
            columns: ["outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_reply_to_activity_id_fkey"
            columns: ["reply_to_activity_id"]
            isOneToOne: false
            referencedRelation: "gtm_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_outreach_dispatches_reply_to_activity_id_fkey"
            columns: ["reply_to_activity_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_outreach_mailboxes: {
        Row: {
          created_at: string
          email: string
          history_id: string | null
          last_error: string | null
          last_synced_at: string | null
          notification_error: string | null
          notification_lease_id: string | null
          notification_lease_until: string | null
          provider: string
          updated_at: string
          watch_expiration: string | null
        }
        Insert: {
          created_at?: string
          email: string
          history_id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          notification_error?: string | null
          notification_lease_id?: string | null
          notification_lease_until?: string | null
          provider?: string
          updated_at?: string
          watch_expiration?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          history_id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          notification_error?: string | null
          notification_lease_id?: string | null
          notification_lease_until?: string | null
          provider?: string
          updated_at?: string
          watch_expiration?: string | null
        }
        Relationships: []
      }
      gtm_outreach_templates: {
        Row: {
          archived_at: string | null
          ask: string | null
          campaign_id: string | null
          channel: string
          created_at: string
          created_by: string | null
          follow_up_template: string | null
          id: string
          language: string | null
          link_refs: string[]
          name: string
          offer_structure: string | null
          opening_template: string
          owner_id: string | null
          ref: number
          row_version: number
          status: string
          subject_template: string | null
          target_creator_profile: string | null
          template_version: string | null
          updated_at: string
          updated_by: string | null
          usage_notes: string | null
          value_proposition: string | null
        }
        Insert: {
          archived_at?: string | null
          ask?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          follow_up_template?: string | null
          id?: string
          language?: string | null
          link_refs?: string[]
          name: string
          offer_structure?: string | null
          opening_template: string
          owner_id?: string | null
          ref?: never
          row_version?: number
          status?: string
          subject_template?: string | null
          target_creator_profile?: string | null
          template_version?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_notes?: string | null
          value_proposition?: string | null
        }
        Update: {
          archived_at?: string | null
          ask?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          follow_up_template?: string | null
          id?: string
          language?: string | null
          link_refs?: string[]
          name?: string
          offer_structure?: string | null
          opening_template?: string
          owner_id?: string | null
          ref?: never
          row_version?: number
          status?: string
          subject_template?: string | null
          target_creator_profile?: string | null
          template_version?: string | null
          updated_at?: string
          updated_by?: string | null
          usage_notes?: string | null
          value_proposition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_outreach_templates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "gtm_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_plans: {
        Row: {
          action_items: Json
          archived_at: string | null
          brief: string | null
          cash_budget: number | null
          contingency: number
          created_at: string
          created_by: string | null
          currency: string
          end_at: string | null
          goal_metric: string | null
          goal_value: number | null
          id: string
          labor_budget_minutes: number | null
          metric_version: string | null
          name: string
          owner_id: string | null
          plan_document_ref: string | null
          plan_version: string | null
          ref: number
          row_version: number
          start_at: string | null
          status: string
          target_audience: string | null
          target_market: string | null
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action_items?: Json
          archived_at?: string | null
          brief?: string | null
          cash_budget?: number | null
          contingency?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          end_at?: string | null
          goal_metric?: string | null
          goal_value?: number | null
          id?: string
          labor_budget_minutes?: number | null
          metric_version?: string | null
          name: string
          owner_id?: string | null
          plan_document_ref?: string | null
          plan_version?: string | null
          ref?: never
          row_version?: number
          start_at?: string | null
          status?: string
          target_audience?: string | null
          target_market?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action_items?: Json
          archived_at?: string | null
          brief?: string | null
          cash_budget?: number | null
          contingency?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          end_at?: string | null
          goal_metric?: string | null
          goal_value?: number | null
          id?: string
          labor_budget_minutes?: number | null
          metric_version?: string | null
          name?: string
          owner_id?: string | null
          plan_document_ref?: string | null
          plan_version?: string | null
          ref?: never
          row_version?: number
          start_at?: string | null
          status?: string
          target_audience?: string | null
          target_market?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      harper_waitlist: {
        Row: {
          abtest: string | null
          created_at: string
          email: string | null
          id: number
          is_mobile: boolean | null
          local_id: string | null
          name: string | null
          text: string | null
          type: number | null
          url: string | null
        }
        Insert: {
          abtest?: string | null
          created_at?: string
          email?: string | null
          id?: number
          is_mobile?: boolean | null
          local_id?: string | null
          name?: string | null
          text?: string | null
          type?: number | null
          url?: string | null
        }
        Update: {
          abtest?: string | null
          created_at?: string
          email?: string | null
          id?: number
          is_mobile?: boolean | null
          local_id?: string | null
          name?: string | null
          text?: string | null
          type?: number | null
          url?: string | null
        }
        Relationships: []
      }
      harper_waitlist_company: {
        Row: {
          access_granted_at: string | null
          additional: string | null
          approval_email_sent_at: string | null
          approval_token: string | null
          approved_at: string | null
          approved_by: string | null
          company: string | null
          company_link: string | null
          created_at: string
          email: string
          is_betatest_agree: boolean
          is_mobile: boolean | null
          is_submit: boolean
          main: string | null
          name: string | null
          needs: string[] | null
          role: string | null
          size: string | null
          status: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          access_granted_at?: string | null
          additional?: string | null
          approval_email_sent_at?: string | null
          approval_token?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company?: string | null
          company_link?: string | null
          created_at?: string
          email: string
          is_betatest_agree?: boolean
          is_mobile?: boolean | null
          is_submit?: boolean
          main?: string | null
          name?: string | null
          needs?: string[] | null
          role?: string | null
          size?: string | null
          status?: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          access_granted_at?: string | null
          additional?: string | null
          approval_email_sent_at?: string | null
          approval_token?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company?: string | null
          company_link?: string | null
          created_at?: string
          email?: string
          is_betatest_agree?: boolean
          is_mobile?: boolean | null
          is_submit?: boolean
          main?: string | null
          name?: string | null
          needs?: string[] | null
          role?: string | null
          size?: string | null
          status?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harper_waitlist_company_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      homepage: {
        Row: {
          bio: string | null
          created_at: string
          id: number
          page_type: string | null
          related_links: string | null
          url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: number
          page_type?: string | null
          related_links?: string | null
          url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: number
          page_type?: string | null
          related_links?: string | null
          url?: string | null
        }
        Relationships: []
      }
      internal_role_matching_run_memory: {
        Row: {
          content: string
          created_at: string
          role_id: string
          run_id: string
        }
        Insert: {
          content: string
          created_at?: string
          role_id: string
          run_id: string
        }
        Update: {
          content?: string
          created_at?: string
          role_id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_role_matching_run_memory_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      jobposting_company_identity: {
        Row: {
          company_db_id: number | null
          company_name: string | null
          company_workspace_id: string
          confidence: number
          created_at: string
          evidence: Json
          first_seen_at: string
          id: number
          last_seen_at: string
          provider: string
          provider_company_id: string | null
          provider_company_url: string | null
          updated_at: string
        }
        Insert: {
          company_db_id?: number | null
          company_name?: string | null
          company_workspace_id: string
          confidence?: number
          created_at?: string
          evidence?: Json
          first_seen_at?: string
          id?: number
          last_seen_at?: string
          provider: string
          provider_company_id?: string | null
          provider_company_url?: string | null
          updated_at?: string
        }
        Update: {
          company_db_id?: number | null
          company_name?: string | null
          company_workspace_id?: string
          confidence?: number
          created_at?: string
          evidence?: Json
          first_seen_at?: string
          id?: number
          last_seen_at?: string
          provider?: string
          provider_company_id?: string | null
          provider_company_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobposting_company_identity_company_db_id_fkey"
            columns: ["company_db_id"]
            isOneToOne: false
            referencedRelation: "company_db"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobposting_company_identity_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      jobposting_company_status: {
        Row: {
          company_db_id: number | null
          company_workspace_id: string | null
          created_at: string
          evidence: Json
          hiring_status: string
          id: number
          last_checked_at: string
          lifecycle_status: string
          updated_at: string
        }
        Insert: {
          company_db_id?: number | null
          company_workspace_id?: string | null
          created_at?: string
          evidence?: Json
          hiring_status?: string
          id?: number
          last_checked_at?: string
          lifecycle_status?: string
          updated_at?: string
        }
        Update: {
          company_db_id?: number | null
          company_workspace_id?: string | null
          created_at?: string
          evidence?: Json
          hiring_status?: string
          id?: number
          last_checked_at?: string
          lifecycle_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobposting_company_status_company_db_id_fkey"
            columns: ["company_db_id"]
            isOneToOne: false
            referencedRelation: "company_db"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobposting_company_status_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      jobposting_crawl_log: {
        Row: {
          company_db_id: number | null
          company_workspace_id: string | null
          created_at: string
          discovered_role_count: number
          error_message: string | null
          fetched_at: string
          final_url: string | null
          http_status: number | null
          id: number
          ingestion_run_id: string | null
          metadata: Json
          page_alive: boolean | null
          role_inserted_count: number
          role_updated_count: number
          run_type: string
          source_kind: string
          source_url: string
          status: string
        }
        Insert: {
          company_db_id?: number | null
          company_workspace_id?: string | null
          created_at?: string
          discovered_role_count?: number
          error_message?: string | null
          fetched_at?: string
          final_url?: string | null
          http_status?: number | null
          id?: number
          ingestion_run_id?: string | null
          metadata?: Json
          page_alive?: boolean | null
          role_inserted_count?: number
          role_updated_count?: number
          run_type: string
          source_kind: string
          source_url: string
          status: string
        }
        Update: {
          company_db_id?: number | null
          company_workspace_id?: string | null
          created_at?: string
          discovered_role_count?: number
          error_message?: string | null
          fetched_at?: string
          final_url?: string | null
          http_status?: number | null
          id?: number
          ingestion_run_id?: string | null
          metadata?: Json
          page_alive?: boolean | null
          role_inserted_count?: number
          role_updated_count?: number
          run_type?: string
          source_kind?: string
          source_url?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobposting_crawl_log_company_db_id_fkey"
            columns: ["company_db_id"]
            isOneToOne: false
            referencedRelation: "company_db"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobposting_crawl_log_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "jobposting_crawl_log_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_ingestion_run"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs_companies_sources: {
        Row: {
          company_workspace_id: string | null
          created_at: string
          first_seen_at: string
          id: number
          last_seen_at: string
          linkedin_name: string | null
          linkedin_url: string | null
          source_metadata: Json
          updated_at: string
          vc_canonical_company_id: string | null
          vc_company_name: string | null
          wanted_company_name: string | null
          wanted_company_url: string | null
          zighang_company_name: string | null
          zighang_company_url: string | null
        }
        Insert: {
          company_workspace_id?: string | null
          created_at?: string
          first_seen_at?: string
          id?: number
          last_seen_at?: string
          linkedin_name?: string | null
          linkedin_url?: string | null
          source_metadata?: Json
          updated_at?: string
          vc_canonical_company_id?: string | null
          vc_company_name?: string | null
          wanted_company_name?: string | null
          wanted_company_url?: string | null
          zighang_company_name?: string | null
          zighang_company_url?: string | null
        }
        Update: {
          company_workspace_id?: string | null
          created_at?: string
          first_seen_at?: string
          id?: number
          last_seen_at?: string
          linkedin_name?: string | null
          linkedin_url?: string | null
          source_metadata?: Json
          updated_at?: string
          vc_canonical_company_id?: string | null
          vc_company_name?: string | null
          wanted_company_name?: string | null
          wanted_company_url?: string | null
          zighang_company_name?: string | null
          zighang_company_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_companies_sources_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      landing_logs: {
        Row: {
          abtest_type: string | null
          country_lang: string | null
          created_at: string
          id: number
          is_mobile: boolean | null
          local_id: string | null
          type: string | null
        }
        Insert: {
          abtest_type?: string | null
          country_lang?: string | null
          created_at?: string
          id?: number
          is_mobile?: boolean | null
          local_id?: string | null
          type?: string | null
        }
        Update: {
          abtest_type?: string | null
          country_lang?: string | null
          created_at?: string
          id?: number
          is_mobile?: boolean | null
          local_id?: string | null
          type?: string | null
        }
        Relationships: []
      }
      legal_document_acceptances: {
        Row: {
          acceptance_type: string
          accepted_at: string
          context: Json
          context_key: string
          created_at: string
          document_effective_date: string | null
          document_locale: string
          document_sha256: string
          document_slug: string
          document_title: string
          document_version: string
          id: string
          source: string
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          acceptance_type: string
          accepted_at?: string
          context?: Json
          context_key?: string
          created_at?: string
          document_effective_date?: string | null
          document_locale: string
          document_sha256: string
          document_slug: string
          document_title: string
          document_version: string
          id?: string
          source: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          acceptance_type?: string
          accepted_at?: string
          context?: Json
          context_key?: string
          created_at?: string
          document_effective_date?: string | null
          document_locale?: string
          document_sha256?: string
          document_slug?: string
          document_title?: string
          document_version?: string
          id?: string
          source?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      link_previews: {
        Row: {
          description: string | null
          fetched_at: string
          published_at: string | null
          title: string | null
          url: string
        }
        Insert: {
          description?: string | null
          fetched_at?: string
          published_at?: string | null
          title?: string | null
          url: string
        }
        Update: {
          description?: string | null
          fetched_at?: string
          published_at?: string | null
          title?: string | null
          url?: string
        }
        Relationships: []
      }
      linkedin_job_snapshots: {
        Row: {
          apply_starters: number | null
          created_at: string
          id: string
          job_slug: string | null
          linkedin_job_id: string | null
          posted_date: string | null
          project: string | null
          snapshot_date: string
          status: string
          title: string
          views: number | null
        }
        Insert: {
          apply_starters?: number | null
          created_at?: string
          id?: string
          job_slug?: string | null
          linkedin_job_id?: string | null
          posted_date?: string | null
          project?: string | null
          snapshot_date?: string
          status?: string
          title: string
          views?: number | null
        }
        Update: {
          apply_starters?: number | null
          created_at?: string
          id?: string
          job_slug?: string | null
          linkedin_job_id?: string | null
          posted_date?: string | null
          project?: string | null
          snapshot_date?: string
          status?: string
          title?: string
          views?: number | null
        }
        Relationships: []
      }
      llm_logs: {
        Row: {
          cost_status: string
          created_at: string
          estimated_cost_usd: number
          id: number
          meta: Json
          model: string
          source: string
          user_id: string | null
        }
        Insert: {
          cost_status?: string
          created_at?: string
          estimated_cost_usd?: number
          id?: number
          meta?: Json
          model: string
          source: string
          user_id?: string | null
        }
        Update: {
          cost_status?: string
          created_at?: string
          estimated_cost_usd?: number
          id?: number
          meta?: Json
          model?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      logs: {
        Row: {
          created_at: string
          id: number
          is_mobile: boolean | null
          meta_data: Json | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          is_mobile?: boolean | null
          meta_data?: Json | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          is_mobile?: boolean | null
          meta_data?: Json | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      meeting_availability: {
        Row: {
          company_user_id: string
          company_workspace_id: string
          date_overrides: Json
          timezone: string
          updated_at: string
          version: number
          weekly_rules: Json
        }
        Insert: {
          company_user_id: string
          company_workspace_id: string
          date_overrides?: Json
          timezone: string
          updated_at?: string
          version?: number
          weekly_rules?: Json
        }
        Update: {
          company_user_id?: string
          company_workspace_id?: string
          date_overrides?: Json
          timezone?: string
          updated_at?: string
          version?: number
          weekly_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "meeting_availability_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_availability_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      meeting_schedule_calendar_events: {
        Row: {
          attempts: number
          calendar_url: string | null
          conference_url: string | null
          created_at: string
          external_event_id: string | null
          last_error: string | null
          organizer_company_user_id: string
          provider: string
          schedule_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          calendar_url?: string | null
          conference_url?: string | null
          created_at?: string
          external_event_id?: string | null
          last_error?: string | null
          organizer_company_user_id: string
          provider?: string
          schedule_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          calendar_url?: string | null
          conference_url?: string | null
          created_at?: string
          external_event_id?: string | null
          last_error?: string | null
          organizer_company_user_id?: string
          provider?: string
          schedule_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_schedule_calendar_events_organizer_company_user_id_fkey"
            columns: ["organizer_company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_schedule_calendar_events_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: true
            referencedRelation: "meeting_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_schedule_rounds: {
        Row: {
          additional_message: Json | null
          candidate_options: Json | null
          delivery_queue_id: string | null
          draft_blocker: string | null
          id: string
          invitation_expires_at: string | null
          invitation_snapshot: Json | null
          meeting_config_snapshot: Json
          public_token_hash: string | null
          round_number: number
          schedule_id: string
          selection_snapshot: Json | null
          source_company_message_id: number
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          additional_message?: Json | null
          candidate_options?: Json | null
          delivery_queue_id?: string | null
          draft_blocker?: string | null
          id?: string
          invitation_expires_at?: string | null
          invitation_snapshot?: Json | null
          meeting_config_snapshot: Json
          public_token_hash?: string | null
          round_number?: number
          schedule_id: string
          selection_snapshot?: Json | null
          source_company_message_id: number
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          additional_message?: Json | null
          candidate_options?: Json | null
          delivery_queue_id?: string | null
          draft_blocker?: string | null
          id?: string
          invitation_expires_at?: string | null
          invitation_snapshot?: Json | null
          meeting_config_snapshot?: Json
          public_token_hash?: string | null
          round_number?: number
          schedule_id?: string
          selection_snapshot?: Json | null
          source_company_message_id?: number
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_schedule_rounds_delivery_queue_id_fkey"
            columns: ["delivery_queue_id"]
            isOneToOne: false
            referencedRelation: "contact_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedule_rounds_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "meeting_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedule_rounds_source_company_message_id_fkey"
            columns: ["source_company_message_id"]
            isOneToOne: false
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_schedules: {
        Row: {
          active_round_id: string | null
          company_attendees: Json
          company_workspace_id: string
          confirmed_end_at: string | null
          confirmed_start_at: string | null
          duration_minutes: number
          id: string
          idempotency_key: string
          organizer_company_user_id: string
          recommendation_id: string
          role_id: string
          status: string
          talent_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          active_round_id?: string | null
          company_attendees?: Json
          company_workspace_id: string
          confirmed_end_at?: string | null
          confirmed_start_at?: string | null
          duration_minutes?: number
          id?: string
          idempotency_key: string
          organizer_company_user_id: string
          recommendation_id: string
          role_id: string
          status?: string
          talent_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          active_round_id?: string | null
          company_attendees?: Json
          company_workspace_id?: string
          confirmed_end_at?: string | null
          confirmed_start_at?: string | null
          duration_minutes?: number
          id?: string
          idempotency_key?: string
          organizer_company_user_id?: string
          recommendation_id?: string
          role_id?: string
          status?: string
          talent_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_schedules_active_round_id_fkey"
            columns: ["id", "active_round_id"]
            isOneToOne: false
            referencedRelation: "meeting_schedule_rounds"
            referencedColumns: ["schedule_id", "id"]
          },
          {
            foreignKeyName: "meeting_schedules_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "meeting_schedules_organizer_company_user_id_fkey"
            columns: ["organizer_company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_schedules_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedules_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_schedules_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "meeting_schedules_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      messages: {
        Row: {
          candid_id: string | null
          content: string | null
          created_at: string
          id: number
          latency: number | null
          query_id: string | null
          role: number | null
          user_id: string | null
        }
        Insert: {
          candid_id?: string | null
          content?: string | null
          created_at?: string
          id?: number
          latency?: number | null
          query_id?: string | null
          role?: number | null
          user_id?: string | null
        }
        Update: {
          candid_id?: string | null
          content?: string | null
          created_at?: string
          id?: number
          latency?: number | null
          query_id?: string | null
          role?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["query_id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      official_job_events: {
        Row: {
          anonymous_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          job_slug: string | null
          metadata: Json
          official_job_id: string | null
          path: string | null
          referrer: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          anonymous_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          job_slug?: string | null
          metadata?: Json
          official_job_id?: string | null
          path?: string | null
          referrer?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          anonymous_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          job_slug?: string | null
          metadata?: Json
          official_job_id?: string | null
          path?: string | null
          referrer?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "official_job_events_official_job_id_fkey"
            columns: ["official_job_id"]
            isOneToOne: false
            referencedRelation: "official_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      official_jobs: {
        Row: {
          ashby_job_posting_id: string | null
          company_description_markdown: string
          company_logo_url: string | null
          company_name: string
          company_website_url: string | null
          compensation: string | null
          created_at: string
          display_order: number
          employment_type: string | null
          id: string
          is_on_linkedin: boolean | null
          is_published: boolean
          location: string
          published_at: string | null
          role_description_markdown: string
          role_id: string | null
          role_title: string
          seniority: string | null
          short_description: string
          slug: string
          source_company_name: string | null
          updated_at: string
          vertical: string
        }
        Insert: {
          ashby_job_posting_id?: string | null
          company_description_markdown?: string
          company_logo_url?: string | null
          company_name: string
          company_website_url?: string | null
          compensation?: string | null
          created_at?: string
          display_order?: number
          employment_type?: string | null
          id?: string
          is_on_linkedin?: boolean | null
          is_published?: boolean
          location: string
          published_at?: string | null
          role_description_markdown?: string
          role_id?: string | null
          role_title: string
          seniority?: string | null
          short_description?: string
          slug: string
          source_company_name?: string | null
          updated_at?: string
          vertical: string
        }
        Update: {
          ashby_job_posting_id?: string | null
          company_description_markdown?: string
          company_logo_url?: string | null
          company_name?: string
          company_website_url?: string | null
          compensation?: string | null
          created_at?: string
          display_order?: number
          employment_type?: string | null
          id?: string
          is_on_linkedin?: boolean | null
          is_published?: boolean
          location?: string
          published_at?: string | null
          role_description_markdown?: string
          role_id?: string | null
          role_title?: string
          seniority?: string | null
          short_description?: string
          slug?: string
          source_company_name?: string | null
          updated_at?: string
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_jobs_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      opportunity_discovery_run: {
        Row: {
          behavior_context_version: number | null
          completed_at: string | null
          context_metrics: Json
          context_variant: string
          conversation_id: string | null
          coverage: Json
          created_at: string
          dedupe_key: string | null
          elapsed_seconds: number | null
          error_message: string | null
          id: string
          last_progress_at: string | null
          lease_heartbeat_at: string | null
          lease_token: string | null
          message: string | null
          not_before: string
          query_plan: Json
          run_mode: string
          settings_snapshot: Json
          started_at: string | null
          status: string
          talent_id: string | null
          target_recommendation_count: number
          trigger: string
          trigger_payload: Json
          updated_at: string
          user_brief: Json
        }
        Insert: {
          behavior_context_version?: number | null
          completed_at?: string | null
          context_metrics?: Json
          context_variant?: string
          conversation_id?: string | null
          coverage?: Json
          created_at?: string
          dedupe_key?: string | null
          elapsed_seconds?: number | null
          error_message?: string | null
          id?: string
          last_progress_at?: string | null
          lease_heartbeat_at?: string | null
          lease_token?: string | null
          message?: string | null
          not_before?: string
          query_plan?: Json
          run_mode?: string
          settings_snapshot?: Json
          started_at?: string | null
          status?: string
          talent_id?: string | null
          target_recommendation_count?: number
          trigger: string
          trigger_payload?: Json
          updated_at?: string
          user_brief?: Json
        }
        Update: {
          behavior_context_version?: number | null
          completed_at?: string | null
          context_metrics?: Json
          context_variant?: string
          conversation_id?: string | null
          coverage?: Json
          created_at?: string
          dedupe_key?: string | null
          elapsed_seconds?: number | null
          error_message?: string | null
          id?: string
          last_progress_at?: string | null
          lease_heartbeat_at?: string | null
          lease_token?: string | null
          message?: string | null
          not_before?: string
          query_plan?: Json
          run_mode?: string
          settings_snapshot?: Json
          started_at?: string | null
          status?: string
          talent_id?: string | null
          target_recommendation_count?: number
          trigger?: string
          trigger_payload?: Json
          updated_at?: string
          user_brief?: Json
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_discovery_run_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_discovery_run_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      opportunity_ingestion_run: {
        Row: {
          completed_at: string | null
          coverage: Json
          created_at: string
          error_message: string | null
          from_date: string | null
          id: string
          numbers: Json | null
          source_provider: string | null
          source_scope: Json
          started_at: string | null
          status: string
          to_date: string | null
          trigger: string
          updated_at: string
          workflow_name: string | null
          workflow_run_attempt: number | null
          workflow_run_id: string | null
          workflow_run_url: string | null
        }
        Insert: {
          completed_at?: string | null
          coverage?: Json
          created_at?: string
          error_message?: string | null
          from_date?: string | null
          id?: string
          numbers?: Json | null
          source_provider?: string | null
          source_scope?: Json
          started_at?: string | null
          status?: string
          to_date?: string | null
          trigger?: string
          updated_at?: string
          workflow_name?: string | null
          workflow_run_attempt?: number | null
          workflow_run_id?: string | null
          workflow_run_url?: string | null
        }
        Update: {
          completed_at?: string | null
          coverage?: Json
          created_at?: string
          error_message?: string | null
          from_date?: string | null
          id?: string
          numbers?: Json | null
          source_provider?: string | null
          source_scope?: Json
          started_at?: string | null
          status?: string
          to_date?: string | null
          trigger?: string
          updated_at?: string
          workflow_name?: string | null
          workflow_run_attempt?: number | null
          workflow_run_id?: string | null
          workflow_run_url?: string | null
        }
        Relationships: []
      }
      opportunity_scheduler_checks: {
        Row: {
          check_kind: string
          check_payload: Json
          checked_at: string
          conversation_id: string | null
          created_at: string
          dedupe_key: string | null
          discovery_run_id: string | null
          id: string
          skip_reasons: string[]
          status: string
          talent_id: string
          updated_at: string
        }
        Insert: {
          check_kind?: string
          check_payload?: Json
          checked_at?: string
          conversation_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          discovery_run_id?: string | null
          id?: string
          skip_reasons?: string[]
          status?: string
          talent_id: string
          updated_at?: string
        }
        Update: {
          check_kind?: string
          check_payload?: Json
          checked_at?: string
          conversation_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          discovery_run_id?: string | null
          id?: string
          skip_reasons?: string[]
          status?: string
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_scheduler_checks_discovery_run_id_fkey"
            columns: ["discovery_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_scheduler_state: {
        Row: {
          next_check_at: string
          talent_id: string
        }
        Insert: {
          next_check_at: string
          talent_id: string
        }
        Update: {
          next_check_at?: string
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_scheduler_state_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: true
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      opportunity_source_document: {
        Row: {
          content_hash: string | null
          created_at: string
          expires_at: string | null
          fetched_at: string
          id: string
          metadata: Json
          provider: string
          raw_text_summary: string | null
          raw_title: string | null
          source_type: string
          source_url: string
          status: string
          updated_at: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          id?: string
          metadata?: Json
          provider: string
          raw_text_summary?: string | null
          raw_title?: string | null
          source_type?: string
          source_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          id?: string
          metadata?: Json
          provider?: string
          raw_text_summary?: string | null
          raw_title?: string | null
          source_type?: string
          source_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      opportunity_source_registry: {
        Row: {
          allowed_access_mode: string
          base_url: string
          company_archetype_tags: string[]
          company_workspace_id: string | null
          created_at: string
          created_from_run_id: string | null
          default_ttl_hours: number
          demand_score: number
          enabled: boolean
          id: string
          keyword_tags: string[]
          last_checked_at: string | null
          last_error: string | null
          last_success_at: string | null
          location_tags: string[]
          next_refresh_at: string | null
          parser_type: string | null
          priority: number
          provider: string
          rate_limit_per_minute: number | null
          refresh_interval_hours: number
          role_family_tags: string[]
          search_url_template: string | null
          updated_at: string
        }
        Insert: {
          allowed_access_mode?: string
          base_url: string
          company_archetype_tags?: string[]
          company_workspace_id?: string | null
          created_at?: string
          created_from_run_id?: string | null
          default_ttl_hours?: number
          demand_score?: number
          enabled?: boolean
          id?: string
          keyword_tags?: string[]
          last_checked_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          location_tags?: string[]
          next_refresh_at?: string | null
          parser_type?: string | null
          priority?: number
          provider: string
          rate_limit_per_minute?: number | null
          refresh_interval_hours?: number
          role_family_tags?: string[]
          search_url_template?: string | null
          updated_at?: string
        }
        Update: {
          allowed_access_mode?: string
          base_url?: string
          company_archetype_tags?: string[]
          company_workspace_id?: string | null
          created_at?: string
          created_from_run_id?: string | null
          default_ttl_hours?: number
          demand_score?: number
          enabled?: boolean
          id?: string
          keyword_tags?: string[]
          last_checked_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          location_tags?: string[]
          next_refresh_at?: string | null
          parser_type?: string | null
          priority?: number
          provider?: string
          rate_limit_per_minute?: number | null
          refresh_interval_hours?: number
          role_family_tags?: string[]
          search_url_template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_source_registry_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "opportunity_source_registry_created_from_run_id_fkey"
            columns: ["created_from_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_matching_role_stages: {
        Row: {
          id: string
          label: string
          meeting_candidate_message: string | null
          meeting_duration_minutes: number | null
          meeting_purpose: string | null
          role_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          label: string
          meeting_candidate_message?: string | null
          meeting_duration_minutes?: number | null
          meeting_purpose?: string | null
          role_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          label?: string
          meeting_candidate_message?: string | null
          meeting_duration_minutes?: number | null
          meeting_purpose?: string | null
          role_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "ops_matching_role_stages_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      org_intro_email_threads: {
        Row: {
          capture_address: string
          company_workspace_id: string
          created_at: string
          id: string
          last_message_at: string | null
          message_count: number
          outbound_message_id: string
          participant_emails: string[]
          recommendation_id: string
          role_id: string
          status: string
          talent_id: string
          updated_at: string
        }
        Insert: {
          capture_address: string
          company_workspace_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          outbound_message_id: string
          participant_emails: string[]
          recommendation_id: string
          role_id: string
          status?: string
          talent_id: string
          updated_at?: string
        }
        Update: {
          capture_address?: string
          company_workspace_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          outbound_message_id?: string
          participant_emails?: string[]
          recommendation_id?: string
          role_id?: string
          status?: string
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_intro_email_threads_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "org_intro_email_threads_outbound_message_id_fkey"
            columns: ["outbound_message_id"]
            isOneToOne: true
            referencedRelation: "career_email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_intro_email_threads_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_intro_email_threads_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_intro_email_threads_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "org_intro_email_threads_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      papers: {
        Row: {
          canonical_key: string | null
          cited_by_scholar_link: string | null
          created_at: string
          id: string
          pub_year: number | null
          published_at: string | null
          scholar_link: string | null
          title: string
          total_citations: number
          year_citations: Json
        }
        Insert: {
          canonical_key?: string | null
          cited_by_scholar_link?: string | null
          created_at?: string
          id?: string
          pub_year?: number | null
          published_at?: string | null
          scholar_link?: string | null
          title: string
          total_citations?: number
          year_citations?: Json
        }
        Update: {
          canonical_key?: string | null
          cited_by_scholar_link?: string | null
          created_at?: string
          id?: string
          pub_year?: number | null
          published_at?: string | null
          scholar_link?: string | null
          title?: string
          total_citations?: number
          year_citations?: Json
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount_krw: number
          approved_at: string | null
          attempt_key: string
          created_at: string
          failure_code: string | null
          failure_message: string | null
          id: number
          order_id: string
          payment_id: number | null
          payment_key: string | null
          plan_id: string | null
          provider: string
          raw_response: Json | null
          reason: string
          receipt_url: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_krw: number
          approved_at?: string | null
          attempt_key: string
          created_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: number
          order_id: string
          payment_id?: number | null
          payment_key?: string | null
          plan_id?: string | null
          provider: string
          raw_response?: Json | null
          reason: string
          receipt_url?: string | null
          status: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_krw?: number
          approved_at?: string | null
          attempt_key?: string
          created_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: number
          order_id?: string
          payment_id?: number | null
          payment_key?: string | null
          plan_id?: string | null
          provider?: string
          raw_response?: Json | null
          reason?: string
          receipt_url?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "payment_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payments: {
        Row: {
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          card_company: string | null
          card_number_masked: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          grace_ends_at: string | null
          id: number
          ls_customer_id: string | null
          ls_subscription_id: string | null
          next_charge_at: string | null
          plan_id: string | null
          provider: string | null
          provider_status: string | null
          retry_count: number | null
          retry_next_at: string | null
          toss_billing_key: string | null
          toss_customer_key: string | null
          toss_last_order_id: string | null
          toss_last_payment_key: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          card_company?: string | null
          card_number_masked?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_ends_at?: string | null
          id?: number
          ls_customer_id?: string | null
          ls_subscription_id?: string | null
          next_charge_at?: string | null
          plan_id?: string | null
          provider?: string | null
          provider_status?: string | null
          retry_count?: number | null
          retry_next_at?: string | null
          toss_billing_key?: string | null
          toss_customer_key?: string | null
          toss_last_order_id?: string | null
          toss_last_payment_key?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          card_company?: string | null
          card_number_masked?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_ends_at?: string | null
          id?: number
          ls_customer_id?: string | null
          ls_subscription_id?: string | null
          next_charge_at?: string | null
          plan_id?: string | null
          provider?: string | null
          provider_status?: string | null
          retry_count?: number | null
          retry_next_at?: string | null
          toss_billing_key?: string | null
          toss_customer_key?: string | null
          toss_last_order_id?: string | null
          toss_last_payment_key?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          credit: number
          cycle: number
          display_name: string | null
          ls_variant_id: string | null
          name: string | null
          plan_id: string
          price_krw: number | null
        }
        Insert: {
          created_at?: string
          credit?: number
          cycle?: number
          display_name?: string | null
          ls_variant_id?: string | null
          name?: string | null
          plan_id?: string
          price_krw?: number | null
        }
        Update: {
          created_at?: string
          credit?: number
          cycle?: number
          display_name?: string | null
          ls_variant_id?: string | null
          name?: string | null
          plan_id?: string
          price_krw?: number | null
        }
        Relationships: []
      }
      profile_shares: {
        Row: {
          candid_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          include_chat: boolean
          revoked_at: string | null
          token: string
        }
        Insert: {
          candid_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          include_chat?: boolean
          revoked_at?: string | null
          token: string
        }
        Update: {
          candid_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          include_chat?: boolean
          revoked_at?: string | null
          token?: string
        }
        Relationships: []
      }
      publications: {
        Row: {
          candid_id: string | null
          citation_num: number | null
          created_at: string
          id: number
          link: string | null
          published_at: string | null
          title: string | null
        }
        Insert: {
          candid_id?: string | null
          citation_num?: number | null
          created_at?: string
          id?: number
          link?: string | null
          published_at?: string | null
          title?: string | null
        }
        Update: {
          candid_id?: string | null
          citation_num?: number | null
          created_at?: string
          id?: number
          link?: string | null
          published_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publications_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
      }
      queries: {
        Row: {
          created_at: string
          is_deleted: boolean
          query: string | null
          query_id: string
          query_keyword: string | null
          raw_input_text: string | null
          type: number
          user_id: string
        }
        Insert: {
          created_at?: string
          is_deleted?: boolean
          query?: string | null
          query_id?: string
          query_keyword?: string | null
          raw_input_text?: string | null
          type?: number
          user_id: string
        }
        Update: {
          created_at?: string
          is_deleted?: boolean
          query?: string | null
          query_id?: string
          query_keyword?: string | null
          raw_input_text?: string | null
          type?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      request: {
        Row: {
          candid_id: string | null
          created_at: string
          id: number
          status: number
          text: string | null
          user_id: string | null
        }
        Insert: {
          candid_id?: string | null
          created_at?: string
          id?: number
          status?: number
          text?: string | null
          user_id?: string | null
        }
        Update: {
          candid_id?: string | null
          created_at?: string
          id?: number
          status?: number
          text?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      run_variants: {
        Row: {
          created_at: string
          error: string | null
          id: number
          latency_ms: number | null
          llm_sql_latency: number | null
          result_count: number | null
          run_id: string
          source_type: number
          sql_query: string | null
          status: string
          variant: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: never
          latency_ms?: number | null
          llm_sql_latency?: number | null
          result_count?: number | null
          run_id: string
          source_type?: number
          sql_query?: string | null
          status?: string
          variant: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: never
          latency_ms?: number | null
          llm_sql_latency?: number | null
          result_count?: number | null
          run_id?: string
          source_type?: number
          sql_query?: string | null
          status?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_variants_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          backend_pid: number | null
          created_at: string
          criteria: string[] | null
          feedback: number
          id: string
          latency: number | null
          limit_num: number
          locale: string
          logs: Json | null
          message_id: number | null
          query_id: string | null
          query_text: string | null
          search_settings: Json | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          backend_pid?: number | null
          created_at?: string
          criteria?: string[] | null
          feedback?: number
          id?: string
          latency?: number | null
          limit_num?: number
          locale?: string
          logs?: Json | null
          message_id?: number | null
          query_id?: string | null
          query_text?: string | null
          search_settings?: Json | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          backend_pid?: number | null
          created_at?: string
          criteria?: string[] | null
          feedback?: number
          id?: string
          latency?: number | null
          limit_num?: number
          locale?: string
          logs?: Json | null
          message_id?: number | null
          query_id?: string | null
          query_text?: string | null
          search_settings?: Json | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "queries"
            referencedColumns: ["query_id"]
          },
          {
            foreignKeyName: "runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      runs_pages: {
        Row: {
          candidate_ids: Json[] | null
          created_at: string
          id: number
          page_idx: number | null
          run_id: string | null
          seen_page: number
          total_candidates: number | null
        }
        Insert: {
          candidate_ids?: Json[] | null
          created_at?: string
          id?: number
          page_idx?: number | null
          run_id?: string | null
          seen_page?: number
          total_candidates?: number | null
        }
        Update: {
          candidate_ids?: Json[] | null
          created_at?: string
          id?: number
          page_idx?: number | null
          run_id?: string | null
          seen_page?: number
          total_candidates?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_pages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scholar_contributions: {
        Row: {
          created_at: string
          paper_id: string
          scholar_profile_id: string
        }
        Insert: {
          created_at?: string
          paper_id: string
          scholar_profile_id: string
        }
        Update: {
          created_at?: string
          paper_id?: string
          scholar_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scholar_contributions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scholar_contributions_scholar_profile_id_fkey"
            columns: ["scholar_profile_id"]
            isOneToOne: false
            referencedRelation: "scholar_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      scholar_profile: {
        Row: {
          affiliation: string | null
          candid_id: string | null
          created_at: string
          email: string | null
          h_index: number
          homepage_link: string | null
          id: string
          name: string
          profile_image_url: string | null
          scholar_url: string
          scholar_user_id: string
          search_text: string
          topics: string
          total_citations_num: number
          year_citations: Json
        }
        Insert: {
          affiliation?: string | null
          candid_id?: string | null
          created_at?: string
          email?: string | null
          h_index?: number
          homepage_link?: string | null
          id?: string
          name: string
          profile_image_url?: string | null
          scholar_url: string
          scholar_user_id: string
          search_text?: string
          topics?: string
          total_citations_num?: number
          year_citations?: Json
        }
        Update: {
          affiliation?: string | null
          candid_id?: string | null
          created_at?: string
          email?: string | null
          h_index?: number
          homepage_link?: string | null
          id?: string
          name?: string
          profile_image_url?: string | null
          scholar_url?: string
          scholar_user_id?: string
          search_text?: string
          topics?: string
          total_citations_num?: number
          year_citations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scholar_profile_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: true
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
      }
      scraped_additional_links: {
        Row: {
          candid_id: string
          created_at: string
          links: Json | null
        }
        Insert: {
          candid_id?: string
          created_at?: string
          links?: Json | null
        }
        Update: {
          candid_id?: string
          created_at?: string
          links?: Json | null
        }
        Relationships: []
      }
      service_answer_examples: {
        Row: {
          answer_example_text: string
          audience: string
          created_at: string
          created_by: string | null
          embedding: string
          embedding_model: string
          enabled: boolean
          id: string
          notes: string | null
          tags: string[]
          updated_at: string
          updated_by: string | null
          user_example_hash: string
          user_example_text: string
        }
        Insert: {
          answer_example_text: string
          audience: string
          created_at?: string
          created_by?: string | null
          embedding: string
          embedding_model?: string
          enabled?: boolean
          id?: string
          notes?: string | null
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          user_example_hash: string
          user_example_text: string
        }
        Update: {
          answer_example_text?: string
          audience?: string
          created_at?: string
          created_by?: string | null
          embedding?: string
          embedding_model?: string
          enabled?: boolean
          id?: string
          notes?: string | null
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          user_example_hash?: string
          user_example_text?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          is_exclude_shortlist: boolean | null
          is_korean: boolean | null
          is_years_exp_enabled: boolean | null
          max_years_exp: number | null
          min_years_exp: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          is_exclude_shortlist?: boolean | null
          is_korean?: boolean | null
          is_years_exp_enabled?: boolean | null
          max_years_exp?: number | null
          min_years_exp?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          is_exclude_shortlist?: boolean | null
          is_korean?: boolean | null
          is_years_exp_enabled?: boolean | null
          max_years_exp?: number | null
          min_years_exp?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      shortlist_memo: {
        Row: {
          candid_id: string
          created_at: string
          id: number
          memo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          candid_id: string
          created_at?: string
          id?: number
          memo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          candid_id?: string
          created_at?: string
          id?: number
          memo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shortlist_memo_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortlist_memo_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      slack_reply_jobs: {
        Row: {
          attempt_count: number
          batched_prompt: string | null
          batched_slack_files: Json
          choice_source_job_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          prompt: string
          queue_dispatch_attempt_count: number
          queue_dispatch_status: string
          queue_dispatched_at: string | null
          queue_last_error: string | null
          queue_next_attempt_at: string
          queue_source: string | null
          response_message_id: number | null
          response_proposal_id: string | null
          response_text: string | null
          selected_choice_at: string | null
          selected_choice_by_slack_user_id: string | null
          selected_choice_index: number | null
          selected_choice_label: string | null
          selected_choice_message: string | null
          slack_event_id: string
          slack_files: Json
          slack_message_ts: string
          slack_response_ts: string | null
          slack_user_id: string | null
          status: string
          thread_id: string
          trigger_kind: string
          updated_at: string
          user_message_id: number | null
          worker_target: string
        }
        Insert: {
          attempt_count?: number
          batched_prompt?: string | null
          batched_slack_files?: Json
          choice_source_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          prompt: string
          queue_dispatch_attempt_count?: number
          queue_dispatch_status?: string
          queue_dispatched_at?: string | null
          queue_last_error?: string | null
          queue_next_attempt_at?: string
          queue_source?: string | null
          response_message_id?: number | null
          response_proposal_id?: string | null
          response_text?: string | null
          selected_choice_at?: string | null
          selected_choice_by_slack_user_id?: string | null
          selected_choice_index?: number | null
          selected_choice_label?: string | null
          selected_choice_message?: string | null
          slack_event_id: string
          slack_files?: Json
          slack_message_ts: string
          slack_response_ts?: string | null
          slack_user_id?: string | null
          status?: string
          thread_id: string
          trigger_kind: string
          updated_at?: string
          user_message_id?: number | null
          worker_target?: string
        }
        Update: {
          attempt_count?: number
          batched_prompt?: string | null
          batched_slack_files?: Json
          choice_source_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          prompt?: string
          queue_dispatch_attempt_count?: number
          queue_dispatch_status?: string
          queue_dispatched_at?: string | null
          queue_last_error?: string | null
          queue_next_attempt_at?: string
          queue_source?: string | null
          response_message_id?: number | null
          response_proposal_id?: string | null
          response_text?: string | null
          selected_choice_at?: string | null
          selected_choice_by_slack_user_id?: string | null
          selected_choice_index?: number | null
          selected_choice_label?: string | null
          selected_choice_message?: string | null
          slack_event_id?: string
          slack_files?: Json
          slack_message_ts?: string
          slack_response_ts?: string | null
          slack_user_id?: string | null
          status?: string
          thread_id?: string
          trigger_kind?: string
          updated_at?: string
          user_message_id?: number | null
          worker_target?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_reply_jobs_choice_source_job_id_fkey"
            columns: ["choice_source_job_id"]
            isOneToOne: false
            referencedRelation: "slack_reply_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_reply_jobs_response_message_id_fkey"
            columns: ["response_message_id"]
            isOneToOne: false
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_reply_jobs_response_proposal_id_fkey"
            columns: ["response_proposal_id"]
            isOneToOne: false
            referencedRelation: "company_agent_update_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_reply_jobs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "company_slack_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_reply_jobs_user_message_id_fkey"
            columns: ["user_message_id"]
            isOneToOne: true
            referencedRelation: "company_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      summary: {
        Row: {
          candid_id: string | null
          created_at: string
          id: number
          text: string | null
        }
        Insert: {
          candid_id?: string | null
          created_at?: string
          id?: number
          text?: string | null
        }
        Update: {
          candid_id?: string | null
          created_at?: string
          id?: number
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "summary_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
      }
      synthesized_summary: {
        Row: {
          candid_id: string | null
          created_at: string
          id: number
          run_id: string | null
          text: string | null
        }
        Insert: {
          candid_id?: string | null
          created_at?: string
          id?: number
          run_id?: string | null
          text?: string | null
        }
        Update: {
          candid_id?: string | null
          created_at?: string
          id?: number
          run_id?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "synthesized_summary_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synthesized_summary_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_activity_events: {
        Row: {
          changed_domains: string[]
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          impact_level: string
          message_id: number | null
          source: string
          summary: string
          talent_id: string
        }
        Insert: {
          changed_domains?: string[]
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          impact_level?: string
          message_id?: number | null
          source?: string
          summary: string
          talent_id: string
        }
        Update: {
          changed_domains?: string[]
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          impact_level?: string
          message_id?: number | null
          source?: string
          summary?: string
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_activity_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_activity_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_activity_events_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_behavior_context_changes: {
        Row: {
          change_summary: string
          changed_fields: string[]
          created_at: string
          id: number
          idempotency_key: string
          occurred_at: string
          operation: string
          source_id: string
          source_type: string
          talent_id: string
        }
        Insert: {
          change_summary?: string
          changed_fields?: string[]
          created_at?: string
          id?: never
          idempotency_key: string
          occurred_at?: string
          operation: string
          source_id: string
          source_type: string
          talent_id: string
        }
        Update: {
          change_summary?: string
          changed_fields?: string[]
          created_at?: string
          id?: never
          idempotency_key?: string
          occurred_at?: string
          operation?: string
          source_id?: string
          source_type?: string
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_behavior_context_changes_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_behavior_contexts: {
        Row: {
          builder_version: string
          context_hash: string
          context_text: string
          context_version: number
          created_at: string
          last_changed_at: string | null
          last_consumed_change_id: number
          last_evaluated_at: string | null
          talent_id: string
          updated_at: string
        }
        Insert: {
          builder_version?: string
          context_hash?: string
          context_text?: string
          context_version?: number
          created_at?: string
          last_changed_at?: string | null
          last_consumed_change_id?: number
          last_evaluated_at?: string | null
          talent_id: string
          updated_at?: string
        }
        Update: {
          builder_version?: string
          context_hash?: string
          context_text?: string
          context_version?: number
          created_at?: string
          last_changed_at?: string | null
          last_consumed_change_id?: number
          last_evaluated_at?: string | null
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_behavior_contexts_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: true
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_calls: {
        Row: {
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          last_active_at: string
          started_at: string
          state: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          last_active_at?: string
          started_at?: string
          state?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_active_at?: string
          started_at?: string
          state?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_company_follow: {
        Row: {
          company_db_id: number
          company_workspace_id: string | null
          conversation_id: string | null
          created_at: string
          discovery_channel_summary: string | null
          followed_at: string
          id: string
          source: string
          talent_id: string
          tracking_summary: string | null
          unfollowed_at: string | null
          updated_at: string
        }
        Insert: {
          company_db_id: number
          company_workspace_id?: string | null
          conversation_id?: string | null
          created_at?: string
          discovery_channel_summary?: string | null
          followed_at?: string
          id?: string
          source?: string
          talent_id: string
          tracking_summary?: string | null
          unfollowed_at?: string | null
          updated_at?: string
        }
        Update: {
          company_db_id?: number
          company_workspace_id?: string | null
          conversation_id?: string | null
          created_at?: string
          discovery_channel_summary?: string | null
          followed_at?: string
          id?: string
          source?: string
          talent_id?: string
          tracking_summary?: string | null
          unfollowed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_company_follow_company_db_id_fkey"
            columns: ["company_db_id"]
            isOneToOne: false
            referencedRelation: "company_db"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_company_follow_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
          {
            foreignKeyName: "talent_company_follow_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_company_follow_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_context_write_requests: {
        Row: {
          created_at: string
          request_id: string
          response: Json | null
          talent_id: string
        }
        Insert: {
          created_at?: string
          request_id: string
          response?: Json | null
          talent_id: string
        }
        Update: {
          created_at?: string
          request_id?: string
          response?: Json | null
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_context_write_requests_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_contexts: {
        Row: {
          collection: string
          content: string
          created_at: string
          deleted_at: string | null
          embedding: string | null
          embedding_content_hash: string | null
          embedding_model: string | null
          embedding_updated_at: string | null
          id: number
          importance: number | null
          key: string | null
          label: string | null
          ref: number
          revision: number
          source_refs: Json
          talent_id: string
          updated_at: string
        }
        Insert: {
          collection: string
          content: string
          created_at?: string
          deleted_at?: string | null
          embedding?: string | null
          embedding_content_hash?: string | null
          embedding_model?: string | null
          embedding_updated_at?: string | null
          id?: number
          importance?: number | null
          key?: string | null
          label?: string | null
          ref: number
          revision?: number
          source_refs?: Json
          talent_id: string
          updated_at?: string
        }
        Update: {
          collection?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          embedding?: string | null
          embedding_content_hash?: string | null
          embedding_model?: string | null
          embedding_updated_at?: string | null
          id?: number
          importance?: number | null
          key?: string | null
          label?: string | null
          ref?: number
          revision?: number
          source_refs?: Json
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_contexts_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_conversation_summaries: {
        Row: {
          conversation_id: string
          created_at: string
          from_message_id: number | null
          id: string
          message_count: number
          segment_summary: string
          source_char_count: number
          summary_json: Json
          summary_text: string
          talent_id: string
          to_message_id: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          from_message_id?: number | null
          id?: string
          message_count?: number
          segment_summary?: string
          source_char_count?: number
          summary_json?: Json
          summary_text?: string
          talent_id: string
          to_message_id: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          from_message_id?: number | null
          id?: string
          message_count?: number
          segment_summary?: string
          source_char_count?: number
          summary_json?: Json
          summary_text?: string
          talent_id?: string
          to_message_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "talent_conversation_summaries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_conversation_summaries_from_message_id_fkey"
            columns: ["from_message_id"]
            isOneToOne: false
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_conversation_summaries_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "talent_conversation_summaries_to_message_id_fkey"
            columns: ["to_message_id"]
            isOneToOne: false
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_conversations: {
        Row: {
          career_coaching_activity_message_id: number | null
          created_at: string
          id: string
          profile_ingestion_error: string | null
          profile_ingestion_status: string | null
          profile_ingestion_updated_at: string | null
          relief_nudge_sent: boolean
          stage: string
          updated_at: string
          user_id: string
        }
        Insert: {
          career_coaching_activity_message_id?: number | null
          created_at?: string
          id?: string
          profile_ingestion_error?: string | null
          profile_ingestion_status?: string | null
          profile_ingestion_updated_at?: string | null
          relief_nudge_sent?: boolean
          stage?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          career_coaching_activity_message_id?: number | null
          created_at?: string
          id?: string
          profile_ingestion_error?: string | null
          profile_ingestion_status?: string | null
          profile_ingestion_updated_at?: string | null
          relief_nudge_sent?: boolean
          stage?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_conversations_career_coaching_activity_message_id_fkey"
            columns: ["career_coaching_activity_message_id"]
            isOneToOne: false
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_documents: {
        Row: {
          content_sha256: string | null
          content_type: string | null
          created_at: string
          extracted_text: string | null
          file_name: string
          id: string
          is_deleted: boolean
          is_primary: boolean
          is_public: boolean
          kind: string
          origin_id: string | null
          origin_type: string | null
          revision: number
          size_bytes: number | null
          storage_path: string | null
          structured_content: Json | null
          talent_id: string
          updated_at: string
        }
        Insert: {
          content_sha256?: string | null
          content_type?: string | null
          created_at?: string
          extracted_text?: string | null
          file_name: string
          id?: string
          is_deleted?: boolean
          is_primary?: boolean
          is_public?: boolean
          kind?: string
          origin_id?: string | null
          origin_type?: string | null
          revision?: number
          size_bytes?: number | null
          storage_path?: string | null
          structured_content?: Json | null
          talent_id: string
          updated_at?: string
        }
        Update: {
          content_sha256?: string | null
          content_type?: string | null
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          id?: string
          is_deleted?: boolean
          is_primary?: boolean
          is_public?: boolean
          kind?: string
          origin_id?: string | null
          origin_type?: string | null
          revision?: number
          size_bytes?: number | null
          storage_path?: string | null
          structured_content?: Json | null
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_documents_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_educations: {
        Row: {
          created_at: string
          degree: string | null
          description: string | null
          end_date: string | null
          field: string | null
          id: number
          memo: string | null
          school: string | null
          start_date: string | null
          talent_id: string
          url: string | null
        }
        Insert: {
          created_at?: string
          degree?: string | null
          description?: string | null
          end_date?: string | null
          field?: string | null
          id?: number
          memo?: string | null
          school?: string | null
          start_date?: string | null
          talent_id: string
          url?: string | null
        }
        Update: {
          created_at?: string
          degree?: string | null
          description?: string | null
          end_date?: string | null
          field?: string | null
          id?: number
          memo?: string | null
          school?: string | null
          start_date?: string | null
          talent_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_educations_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_experiences: {
        Row: {
          company_id: string | null
          company_link: string | null
          company_location: string | null
          company_logo: string | null
          company_name: string | null
          created_at: string
          description: string | null
          employment_type: string | null
          end_date: string | null
          id: number
          memo: string | null
          months: number | null
          role: string | null
          start_date: string | null
          talent_id: string
        }
        Insert: {
          company_id?: string | null
          company_link?: string | null
          company_location?: string | null
          company_logo?: string | null
          company_name?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: number
          memo?: string | null
          months?: number | null
          role?: string | null
          start_date?: string | null
          talent_id: string
        }
        Update: {
          company_id?: string | null
          company_link?: string | null
          company_location?: string | null
          company_logo?: string | null
          company_name?: string | null
          created_at?: string
          description?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: number
          memo?: string | null
          months?: number | null
          role?: string | null
          start_date?: string | null
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_experiences_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_external_fit: {
        Row: {
          behavior_context_version: number | null
          created_at: string
          evaluations: Json
          meta: Json
          role_id: string
          talent_id: string
        }
        Insert: {
          behavior_context_version?: number | null
          created_at?: string
          evaluations?: Json
          meta?: Json
          role_id: string
          talent_id: string
        }
        Update: {
          behavior_context_version?: number | null
          created_at?: string
          evaluations?: Json
          meta?: Json
          role_id?: string
          talent_id?: string
        }
        Relationships: []
      }
      talent_extras: {
        Row: {
          content: Json
          talent_id: string
        }
        Insert: {
          content?: Json
          talent_id: string
        }
        Update: {
          content?: Json
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_extras_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: true
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_insights: {
        Row: {
          content: Json | null
          created_at: string
          id: number
          last_updated_at: string | null
          talent_id: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string
          id?: number
          last_updated_at?: string | null
          talent_id?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string
          id?: number
          last_updated_at?: string | null
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_insights_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: true
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_integrations: {
        Row: {
          composio_connected_account_id: string
          created_at: string
          provider: string
          status: string
          talent_id: string
          updated_at: string
        }
        Insert: {
          composio_connected_account_id: string
          created_at?: string
          provider: string
          status?: string
          talent_id: string
          updated_at?: string
        }
        Update: {
          composio_connected_account_id?: string
          created_at?: string
          provider?: string
          status?: string
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_integrations_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          id: number
          is_mobile: boolean | null
          message_type: string
          payload: Json | null
          role: string
          thinking_logs: Json
          user_id: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: number
          is_mobile?: boolean | null
          message_type?: string
          payload?: Json | null
          role: string
          thinking_logs?: Json
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: number
          is_mobile?: boolean | null
          message_type?: string
          payload?: Json | null
          role?: string
          thinking_logs?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_network_referral_attributions: {
        Row: {
          hired_at: string | null
          paid_at: string | null
          referred_user_id: string
          token: string
        }
        Insert: {
          hired_at?: string | null
          paid_at?: string | null
          referred_user_id: string
          token: string
        }
        Update: {
          hired_at?: string | null
          paid_at?: string | null
          referred_user_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_network_referral_attributions_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "talent_network_referral_attributions_token_fkey"
            columns: ["token"]
            isOneToOne: false
            referencedRelation: "talent_network_referral_links"
            referencedColumns: ["token"]
          },
        ]
      }
      talent_network_referral_links: {
        Row: {
          created_at: string
          referrer_user_id: string
          token: string
          visit_count: number
        }
        Insert: {
          created_at?: string
          referrer_user_id: string
          token: string
          visit_count?: number
        }
        Update: {
          created_at?: string
          referrer_user_id?: string
          token?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "talent_network_referral_links_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_opportunity_chat_preview: {
        Row: {
          assistant_message_id: number
          conversation_id: string
          created_at: string
          discovery_run_id: string
          id: string
          rank: number
          recommendation_id: string
        }
        Insert: {
          assistant_message_id: number
          conversation_id: string
          created_at?: string
          discovery_run_id: string
          id?: string
          rank: number
          recommendation_id: string
        }
        Update: {
          assistant_message_id?: number
          conversation_id?: string
          created_at?: string
          discovery_run_id?: string
          id?: string
          rank?: number
          recommendation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_chat_preview_assistant_message_id_fkey"
            columns: ["assistant_message_id"]
            isOneToOne: false
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_chat_preview_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_chat_preview_discovery_run_id_fkey"
            columns: ["discovery_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_chat_preview_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_chat_preview_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_opportunity_delivery: {
        Row: {
          channel: string
          created_at: string
          discovery_run_id: string
          error_message: string | null
          id: string
          payload: Json
          sent_at: string | null
          status: string
          talent_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          discovery_run_id: string
          error_message?: string | null
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          talent_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          discovery_run_id?: string
          error_message?: string | null
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_delivery_discovery_run_id_fkey"
            columns: ["discovery_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_delivery_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_opportunity_fit: {
        Row: {
          behavior_context_version: number | null
          candidate_fit: string | null
          candidate_reason: string | null
          company_criteria_evaluations: Json | null
          company_fit: string | null
          company_reason: string | null
          company_side_evaluation_metadata: Json | null
          created_at: string
          evaluated_stage: number | null
          evaluation_started_at: string | null
          expires_at: string | null
          fit_contract_version: string | null
          history: Json | null
          human_label: string | null
          human_reason: string | null
          human_reviewed_at: string | null
          human_reviewed_by: string | null
          id: string
          input_fingerprint: string | null
          kind: string | null
          label: string | null
          last_evaluated_at: string
          missing_info: string | null
          model_manifest: Json | null
          opportunity_id: string
          reason: string
          recommend: boolean
          reevaluation_checked_at: string | null
          reevaluation_criteria: Json | null
          role_fit: string | null
          score: number | null
          source_versions: Json | null
          stage_one_result: string | null
          talent_id: string
        }
        Insert: {
          behavior_context_version?: number | null
          candidate_fit?: string | null
          candidate_reason?: string | null
          company_criteria_evaluations?: Json | null
          company_fit?: string | null
          company_reason?: string | null
          company_side_evaluation_metadata?: Json | null
          created_at?: string
          evaluated_stage?: number | null
          evaluation_started_at?: string | null
          expires_at?: string | null
          fit_contract_version?: string | null
          history?: Json | null
          human_label?: string | null
          human_reason?: string | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          id?: string
          input_fingerprint?: string | null
          kind?: string | null
          label?: string | null
          last_evaluated_at?: string
          missing_info?: string | null
          model_manifest?: Json | null
          opportunity_id: string
          reason?: string
          recommend?: boolean
          reevaluation_checked_at?: string | null
          reevaluation_criteria?: Json | null
          role_fit?: string | null
          score?: number | null
          source_versions?: Json | null
          stage_one_result?: string | null
          talent_id: string
        }
        Update: {
          behavior_context_version?: number | null
          candidate_fit?: string | null
          candidate_reason?: string | null
          company_criteria_evaluations?: Json | null
          company_fit?: string | null
          company_reason?: string | null
          company_side_evaluation_metadata?: Json | null
          created_at?: string
          evaluated_stage?: number | null
          evaluation_started_at?: string | null
          expires_at?: string | null
          fit_contract_version?: string | null
          history?: Json | null
          human_label?: string | null
          human_reason?: string | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          id?: string
          input_fingerprint?: string | null
          kind?: string | null
          label?: string | null
          last_evaluated_at?: string
          missing_info?: string | null
          model_manifest?: Json | null
          opportunity_id?: string
          reason?: string
          recommend?: boolean
          reevaluation_checked_at?: string | null
          reevaluation_criteria?: Json | null
          role_fit?: string | null
          score?: number | null
          source_versions?: Json | null
          stage_one_result?: string | null
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_fit_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "talent_opportunity_fit_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_opportunity_matching_review: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          criteria_evaluations: Json
          decision: string
          discovery_run_id: string | null
          final_fit: string | null
          harper_note: string | null
          id: string
          input_fingerprint: string
          introduction: string | null
          not_before: string
          opportunity_id: string
          presentation_fingerprint: string | null
          priority_request_id: string | null
          reason: string
          recommendation_id: string | null
          reviewed_at: string
          run_id: string | null
          selection_fingerprint: string | null
          source_discovery_run_id: string | null
          talent_id: string
          tldr: string | null
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          criteria_evaluations?: Json
          decision: string
          discovery_run_id?: string | null
          final_fit?: string | null
          harper_note?: string | null
          id?: string
          input_fingerprint: string
          introduction?: string | null
          not_before?: string
          opportunity_id: string
          presentation_fingerprint?: string | null
          priority_request_id?: string | null
          reason: string
          recommendation_id?: string | null
          reviewed_at?: string
          run_id?: string | null
          selection_fingerprint?: string | null
          source_discovery_run_id?: string | null
          talent_id: string
          tldr?: string | null
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          criteria_evaluations?: Json
          decision?: string
          discovery_run_id?: string | null
          final_fit?: string | null
          harper_note?: string | null
          id?: string
          input_fingerprint?: string
          introduction?: string | null
          not_before?: string
          opportunity_id?: string
          presentation_fingerprint?: string | null
          priority_request_id?: string | null
          reason?: string
          recommendation_id?: string | null
          reviewed_at?: string
          run_id?: string | null
          selection_fingerprint?: string | null
          source_discovery_run_id?: string | null
          talent_id?: string
          tldr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_matching_review_discovery_run_id_fkey"
            columns: ["discovery_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_matching_review_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "talent_opportunity_matching_review_priority_request_id_fkey"
            columns: ["priority_request_id"]
            isOneToOne: false
            referencedRelation: "talent_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_matching_review_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_matching_review_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_matching_review_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "company_first_search_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_matching_review_source_discovery_run_id_fkey"
            columns: ["source_discovery_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_matching_review_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_opportunity_recommendation: {
        Row: {
          clicked_at: string | null
          created_at: string
          discovery_run_id: string | null
          dismissed_at: string | null
          email_acceptance_confirmation: Json
          evidence: Json
          external_experiment_run_id: string | null
          feedback: string | null
          feedback_at: string | null
          feedback_reason: string | null
          fit_reasons: Json
          fit_summary: string | null
          id: string
          kind: string
          model_version: string | null
          opportunity_type: string
          preference_fit: Json
          processed_stage: string | null
          rank: number | null
          recommended_at: string
          role_id: string
          saved_stage: string | null
          score: number | null
          talent_id: string
          talent_memo: string | null
          tradeoffs: Json
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string
          discovery_run_id?: string | null
          dismissed_at?: string | null
          email_acceptance_confirmation?: Json
          evidence?: Json
          external_experiment_run_id?: string | null
          feedback?: string | null
          feedback_at?: string | null
          feedback_reason?: string | null
          fit_reasons?: Json
          fit_summary?: string | null
          id?: string
          kind?: string
          model_version?: string | null
          opportunity_type?: string
          preference_fit?: Json
          processed_stage?: string | null
          rank?: number | null
          recommended_at?: string
          role_id: string
          saved_stage?: string | null
          score?: number | null
          talent_id: string
          talent_memo?: string | null
          tradeoffs?: Json
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          clicked_at?: string | null
          created_at?: string
          discovery_run_id?: string | null
          dismissed_at?: string | null
          email_acceptance_confirmation?: Json
          evidence?: Json
          external_experiment_run_id?: string | null
          feedback?: string | null
          feedback_at?: string | null
          feedback_reason?: string | null
          fit_reasons?: Json
          fit_summary?: string | null
          id?: string
          kind?: string
          model_version?: string | null
          opportunity_type?: string
          preference_fit?: Json
          processed_stage?: string | null
          rank?: number | null
          recommended_at?: string
          role_id?: string
          saved_stage?: string | null
          score?: number | null
          talent_id?: string
          talent_memo?: string | null
          tradeoffs?: Json
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_recommendati_external_experiment_run_id_fkey"
            columns: ["external_experiment_run_id"]
            isOneToOne: false
            referencedRelation: "external_recommendation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_recommendation_discovery_run_fkey"
            columns: ["discovery_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_recommendation_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "talent_opportunity_recommendation_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_opportunity_tag: {
        Row: {
          created_at: string
          id: string
          opportunity_id: string | null
          tag: string
          talent_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          opportunity_id?: string | null
          tag: string
          talent_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          opportunity_id?: string | null
          tag?: string
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_tag_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "talent_opportunity_tag_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_ops_profile_memos: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          talent_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          talent_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          talent_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_ops_profile_memos_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_profile_search_embeddings: {
        Row: {
          content_fingerprint: string
          embedding: number[]
          embedding_model: string
          talent_id: string
          updated_at: string
        }
        Insert: {
          content_fingerprint: string
          embedding: number[]
          embedding_model: string
          talent_id: string
          updated_at?: string
        }
        Update: {
          content_fingerprint?: string
          embedding?: number[]
          embedding_model?: string
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_profile_search_embeddings_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: true
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_progress: {
        Row: {
          company_user_id: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json
          open_to_company: boolean
          open_to_talent: boolean
          recommendation_id: string | null
          role_id: string
          talent_id: string
          text: string
          user_id: string | null
        }
        Insert: {
          company_user_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          open_to_company?: boolean
          open_to_talent?: boolean
          recommendation_id?: string | null
          role_id: string
          talent_id: string
          text: string
          user_id?: string | null
        }
        Update: {
          company_user_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          open_to_company?: boolean
          open_to_talent?: boolean
          recommendation_id?: string | null
          role_id?: string
          talent_id?: string
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_progress_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "talent_progress_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_progress_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_progress_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "talent_progress_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_referral_application: {
        Row: {
          amount: string | null
          created_at: string
          hired_at: string | null
          id: string
          memo: string | null
          recommendation_id: string | null
          referred_user_id: string
          reward_due_at: string | null
          reward_paid: boolean
          reward_paid_at: string | null
          role_id: string
          settlement_completed_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: string | null
          created_at?: string
          hired_at?: string | null
          id?: string
          memo?: string | null
          recommendation_id?: string | null
          referred_user_id: string
          reward_due_at?: string | null
          reward_paid?: boolean
          reward_paid_at?: string | null
          role_id: string
          settlement_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: string | null
          created_at?: string
          hired_at?: string | null
          id?: string
          memo?: string | null
          recommendation_id?: string | null
          referred_user_id?: string
          reward_due_at?: string | null
          reward_paid?: boolean
          reward_paid_at?: string | null
          role_id?: string
          settlement_completed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_referral_application_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_referral_application_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_referral_application_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "talent_referral_application_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      talent_referral_payout_information: {
        Row: {
          access_token_expires_at: string | null
          access_token_hash: string | null
          accuracy_confirmed_at: string | null
          address_ciphertext: string | null
          bank_account_holder_ciphertext: string | null
          bank_account_number_ciphertext: string | null
          bank_name: string | null
          business_registration_number_ciphertext: string | null
          created_at: string
          id: string
          is_korean_tax_resident: boolean | null
          legal_name_ciphertext: string | null
          notification_history: Json
          phone_ciphertext: string | null
          privacy_consent_version: string | null
          privacy_consented_at: string | null
          referral_application_id: string
          referrer_user_id: string
          resident_registration_number_ciphertext: string | null
          submitted_at: string | null
          tax_entity_type: string | null
          updated_at: string
        }
        Insert: {
          access_token_expires_at?: string | null
          access_token_hash?: string | null
          accuracy_confirmed_at?: string | null
          address_ciphertext?: string | null
          bank_account_holder_ciphertext?: string | null
          bank_account_number_ciphertext?: string | null
          bank_name?: string | null
          business_registration_number_ciphertext?: string | null
          created_at?: string
          id?: string
          is_korean_tax_resident?: boolean | null
          legal_name_ciphertext?: string | null
          notification_history?: Json
          phone_ciphertext?: string | null
          privacy_consent_version?: string | null
          privacy_consented_at?: string | null
          referral_application_id: string
          referrer_user_id: string
          resident_registration_number_ciphertext?: string | null
          submitted_at?: string | null
          tax_entity_type?: string | null
          updated_at?: string
        }
        Update: {
          access_token_expires_at?: string | null
          access_token_hash?: string | null
          accuracy_confirmed_at?: string | null
          address_ciphertext?: string | null
          bank_account_holder_ciphertext?: string | null
          bank_account_number_ciphertext?: string | null
          bank_name?: string | null
          business_registration_number_ciphertext?: string | null
          created_at?: string
          id?: string
          is_korean_tax_resident?: boolean | null
          legal_name_ciphertext?: string | null
          notification_history?: Json
          phone_ciphertext?: string | null
          privacy_consent_version?: string | null
          privacy_consented_at?: string | null
          referral_application_id?: string
          referrer_user_id?: string
          resident_registration_number_ciphertext?: string | null
          submitted_at?: string | null
          tax_entity_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_referral_payout_information_referral_application_id_fkey"
            columns: ["referral_application_id"]
            isOneToOne: true
            referencedRelation: "talent_referral_application"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_referral_payout_information_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_role_activity: {
        Row: {
          content: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json
          recommendation_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          recommendation_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          recommendation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_role_activity_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_effective_opportunity_recommendations_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_role_activity_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "talent_opportunity_recommendation"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_setting: {
        Row: {
          blocked_companies: string[]
          created_at: string
          engagement_types: string[]
          external_search_default: Json | null
          get_external_recommendation: boolean
          get_internal_recommendation: boolean
          is_onboarding_done: boolean
          periodic_interval_days: number
          preferred_locale: string
          profile_visibility: string
          recommendation_batch_size: number
          recommendation_source_conversation_id: string | null
          setting_locale: string | null
          status: string
          status_updated_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_companies?: string[]
          created_at?: string
          engagement_types?: string[]
          external_search_default?: Json | null
          get_external_recommendation?: boolean
          get_internal_recommendation?: boolean
          is_onboarding_done?: boolean
          periodic_interval_days?: number
          preferred_locale?: string
          profile_visibility?: string
          recommendation_batch_size?: number
          recommendation_source_conversation_id?: string | null
          setting_locale?: string | null
          status?: string
          status_updated_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_companies?: string[]
          created_at?: string
          engagement_types?: string[]
          external_search_default?: Json | null
          get_external_recommendation?: boolean
          get_internal_recommendation?: boolean
          is_onboarding_done?: boolean
          periodic_interval_days?: number
          preferred_locale?: string
          profile_visibility?: string
          recommendation_batch_size?: number
          recommendation_source_conversation_id?: string | null
          setting_locale?: string | null
          status?: string
          status_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_setting_recommendation_source_conversation_id_fkey"
            columns: ["recommendation_source_conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_setting_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_simulate_application: {
        Row: {
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          last_activity_at: string
          message_id: number
          payload: Json
          revision: number
          role_ref: string
          start_offer_message_id: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          ended_at?: string | null
          id: string
          last_activity_at?: string
          message_id: number
          payload: Json
          revision?: number
          role_ref: string
          start_offer_message_id: number
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          message_id?: number
          payload?: Json
          revision?: number
          role_ref?: string
          start_offer_message_id?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_simulate_application_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "talent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_simulate_application_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_simulate_application_start_offer_message_id_fkey"
            columns: ["start_offer_message_id"]
            isOneToOne: true
            referencedRelation: "talent_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_simulate_application_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_users: {
        Row: {
          bio: string | null
          created_at: string
          current_location: string | null
          deleted_at: string | null
          deletion_reason_code: string | null
          deletion_reason_detail: string | null
          email: string | null
          headline: string | null
          last_logined_at: string | null
          location: string | null
          name: string | null
          phone_number: string | null
          profile_picture: string | null
          resume_file_name: string | null
          resume_links: string[]
          resume_storage_path: string | null
          resume_text: string | null
          search_text: string
          search_tsv: unknown
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          current_location?: string | null
          deleted_at?: string | null
          deletion_reason_code?: string | null
          deletion_reason_detail?: string | null
          email?: string | null
          headline?: string | null
          last_logined_at?: string | null
          location?: string | null
          name?: string | null
          phone_number?: string | null
          profile_picture?: string | null
          resume_file_name?: string | null
          resume_links?: string[]
          resume_storage_path?: string | null
          resume_text?: string | null
          search_text?: string
          search_tsv?: unknown
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          current_location?: string | null
          deleted_at?: string | null
          deletion_reason_code?: string | null
          deletion_reason_detail?: string | null
          email?: string | null
          headline?: string | null
          last_logined_at?: string | null
          location?: string | null
          name?: string | null
          phone_number?: string | null
          profile_picture?: string | null
          resume_file_name?: string | null
          resume_links?: string[]
          resume_storage_path?: string | null
          resume_text?: string | null
          search_text?: string
          search_tsv?: unknown
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      translation_entries: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          locale: string
          namespace: string
          status: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          locale: string
          namespace?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          locale?: string
          namespace?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      unlock_profile: {
        Row: {
          candid_id: string | null
          company_user_id: string | null
          created_at: string
          id: number
        }
        Insert: {
          candid_id?: string | null
          company_user_id?: string | null
          created_at?: string
          id?: number
        }
        Update: {
          candid_id?: string | null
          company_user_id?: string | null
          created_at?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "reveal_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reveal_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_announcement_receipts: {
        Row: {
          announcement_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worker_runtime_settings: {
        Row: {
          company_first: Json
          created_at: string
          found_threshold: number
          name: string
          rerank_batch_size: number
          review_candidate_limit: number
          summary_concurrency: number
          updated_at: string
          variant_candidate_limit: number
        }
        Insert: {
          company_first?: Json
          created_at?: string
          found_threshold: number
          name: string
          rerank_batch_size: number
          review_candidate_limit: number
          summary_concurrency: number
          updated_at?: string
          variant_candidate_limit: number
        }
        Update: {
          company_first?: Json
          created_at?: string
          found_threshold?: number
          name?: string
          rerank_batch_size?: number
          review_candidate_limit?: number
          summary_concurrency?: number
          updated_at?: string
          variant_candidate_limit?: number
        }
        Relationships: []
      }
    }
    Views: {
      company_workspace_agents: {
        Row: {
          assigned_role_id: string | null
          billing_interval: string | null
          cancel_at: string | null
          company_workspace_id: string | null
          created_at: string | null
          current_period_end: string | null
          ended_at: string | null
          id: string | null
          revision: number | null
          started_at: string | null
          status: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_role_id?: string | null
          billing_interval?: string | null
          cancel_at?: string | null
          company_workspace_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          ended_at?: string | null
          id?: string | null
          revision?: number | null
          started_at?: string | null
          status?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_role_id?: string | null
          billing_interval?: string | null
          cancel_at?: string | null
          company_workspace_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          ended_at?: string | null
          id?: string | null
          revision?: number | null
          started_at?: string | null
          status?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_workspace_slots_assigned_role_id_fkey"
            columns: ["assigned_role_id"]
            isOneToOne: true
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "company_workspace_slots_company_workspace_id_fkey"
            columns: ["company_workspace_id"]
            isOneToOne: false
            referencedRelation: "company_workspace"
            referencedColumns: ["company_workspace_id"]
          },
        ]
      }
      gtm_account_overview: {
        Row: {
          archived_at: string | null
          as_of: string | null
          audience_evidence: Json | null
          audience_summary: string | null
          collected_at: string | null
          content_count_365d: number | null
          content_count_as_of: string | null
          content_count_source_ref: string | null
          created_at: string | null
          created_by: string | null
          creator_id: string | null
          data_status: string | null
          external_id: string | null
          follower_count: number | null
          followers_as_of: string | null
          followers_source_ref: string | null
          handle: string | null
          id: string | null
          last_post_at: string | null
          owner_kind: string | null
          platform: string | null
          profile_metrics_as_of: string | null
          profile_url: string | null
          provider_scope: string | null
          ref: number | null
          refresh_fields: string[] | null
          row_version: number | null
          source_ref: string | null
          updated_at: string | null
          updated_by: string | null
          valid_until: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["creator_id"]
          },
        ]
      }
      gtm_compensation_strategy_sheet_v1: {
        Row: {
          amount_per_unit: number | null
          archived_at: string | null
          assigned_content_count: number | null
          base_fee: number | null
          calculation_summary: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          id: string | null
          is_recommended: boolean | null
          measurement_window_days: number | null
          name: string | null
          notes: string | null
          pricing_model: string | null
          recommendation_reason: string | null
          recommended_at: string | null
          recommended_label: string | null
          ref: number | null
          row_version: number | null
          settled_content_count: number | null
          status: string | null
          updated_at: string | null
          version: number | null
          views_per_unit: number | null
        }
        Relationships: []
      }
      gtm_connected_creator_sheet_v1: {
        Row: {
          account_count: number | null
          account_summary: string | null
          activity_regions: string[] | null
          agreed_collaboration_count: number | null
          archived_at: string | null
          audience_summary: string | null
          closed_collaboration_count: number | null
          collaboration_count: number | null
          collaboration_history_summary: string | null
          contact_restriction_source: string | null
          contact_summary: string | null
          contacts: Json | null
          content_count_365d: number | null
          content_history_summary: string | null
          content_topics: string[] | null
          country: string | null
          created_at: string | null
          created_by: string | null
          current_collaboration_due_at: string | null
          current_collaboration_id: string | null
          current_collaboration_ref: number | null
          current_collaboration_status: string | null
          current_collaboration_title: string | null
          data_status: string | null
          description: string | null
          do_not_contact: boolean | null
          has_contact_method: boolean | null
          id: string | null
          incomplete_cost_items: number | null
          languages: string[] | null
          last_contact_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_published_at: string | null
          latest_direction: string | null
          latest_direction_at: string | null
          latest_direction_reason: string | null
          latest_post_at: string | null
          lifetime_committed_cash: number | null
          lifetime_incurred_cost: number | null
          lifetime_net_paid: number | null
          name: string | null
          next_action: string | null
          next_action_due_at: string | null
          notes: string | null
          outreach_status: string | null
          owner_id: string | null
          platforms: string[] | null
          profile_metrics_as_of: string | null
          published_content_count: number | null
          ref: number | null
          refresh_fields: string[] | null
          refresh_fields_text: string | null
          relationship_cost_currency: string | null
          relationship_status: string | null
          row_version: number | null
          sheet_current_plan_name: string | null
          sheet_current_plan_ref: number | null
          sheet_first_outreach_at: string | null
          sheet_first_reply_at: string | null
          sheet_has_relationship_history: boolean | null
          sheet_primary_email: string | null
          sheet_primary_handle: string | null
          sheet_primary_platform: string | null
          sheet_primary_profile_url: string | null
          total_followers: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: []
      }
      gtm_content_sheet_v1: {
        Row: {
          account_id: string | null
          account_ref: number | null
          archived_at: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_ref: number | null
          collaboration_id: string | null
          collaboration_ref: number | null
          collaboration_title: string | null
          comments: number | null
          comments_non_author: number | null
          compensation_amount_per_unit: number | null
          compensation_base_fee: number | null
          compensation_cost_id: string | null
          compensation_cost_ref: number | null
          compensation_currency: string | null
          compensation_measurement_window_days: number | null
          compensation_pricing_model: string | null
          compensation_strategy_id: string | null
          compensation_strategy_name: string | null
          compensation_strategy_ref: number | null
          compensation_views_per_unit: number | null
          creator_id: string | null
          creator_name: string | null
          creator_ref: number | null
          estimated_payable: number | null
          finalized_payable: number | null
          format_id: string | null
          format_name: string | null
          format_ref: number | null
          handle: string | null
          id: string | null
          likes: number | null
          paid_amount: number | null
          performance_conclusion: string | null
          plan_id: string | null
          plan_name: string | null
          plan_ref: number | null
          platform: string | null
          platform_metrics_as_of: string | null
          platform_metrics_due_at: string | null
          platform_metrics_finalized_at: string | null
          platform_metrics_last_collected_at: string | null
          platform_metrics_last_error: string | null
          post_url: string | null
          production_status: string | null
          publish_status: string | null
          published_at: string | null
          ref: number | null
          row_version: number | null
          settlement_status: string | null
          title: string | null
          views: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_contents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gtm_account_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gtm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "gtm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_collaborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["current_collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["collaboration_id"]
          },
          {
            foreignKeyName: "gtm_contents_compensation_cost_id_fkey"
            columns: ["compensation_cost_id"]
            isOneToOne: false
            referencedRelation: "gtm_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_compensation_strategy_id_fkey"
            columns: ["compensation_strategy_id"]
            isOneToOne: false
            referencedRelation: "gtm_compensation_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_compensation_strategy_id_fkey"
            columns: ["compensation_strategy_id"]
            isOneToOne: false
            referencedRelation: "gtm_compensation_strategy_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_connected_creator_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_directory_sheet_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creator_overview_base_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_contents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_sheet_v1"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "gtm_contents_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "gtm_format_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "gtm_formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "gtm_plan_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_contents_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "gtm_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_cost_plan_amounts: {
        Row: {
          base_currency: string | null
          committed: number | null
          cost_id: string | null
          incomplete: boolean | null
          incurred: number | null
          paid: number | null
          plan_id: string | null
        }
        Relationships: []
      }
      gtm_creator_directory_sheet_base_v1: {
        Row: {
          account_count: number | null
          account_summary: string | null
          activity_regions: string[] | null
          archived_at: string | null
          audience_summary: string | null
          collaboration_count: number | null
          contact_restriction_source: string | null
          contact_summary: string | null
          contacts: Json | null
          content_count_365d: number | null
          content_topics: string[] | null
          country: string | null
          created_at: string | null
          created_by: string | null
          current_collaboration_due_at: string | null
          current_collaboration_id: string | null
          current_collaboration_ref: number | null
          current_collaboration_status: string | null
          current_collaboration_title: string | null
          data_status: string | null
          description: string | null
          do_not_contact: boolean | null
          has_contact_method: boolean | null
          id: string | null
          languages: string[] | null
          last_contact_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_published_at: string | null
          latest_direction: string | null
          latest_direction_at: string | null
          latest_direction_reason: string | null
          latest_post_at: string | null
          name: string | null
          next_action: string | null
          next_action_due_at: string | null
          notes: string | null
          outreach_status: string | null
          owner_id: string | null
          platforms: string[] | null
          profile_metrics_as_of: string | null
          published_content_count: number | null
          ref: number | null
          refresh_fields: string[] | null
          refresh_fields_text: string | null
          row_version: number | null
          sheet_current_plan_name: string | null
          sheet_current_plan_ref: number | null
          sheet_first_outreach_at: string | null
          sheet_first_reply_at: string | null
          sheet_has_relationship_history: boolean | null
          sheet_primary_email: string | null
          sheet_primary_handle: string | null
          sheet_primary_platform: string | null
          sheet_primary_profile_url: string | null
          total_followers: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: []
      }
      gtm_creator_directory_sheet_v1: {
        Row: {
          account_count: number | null
          account_summary: string | null
          activity_regions: string[] | null
          archived_at: string | null
          audience_summary: string | null
          collaboration_count: number | null
          contact_restriction_source: string | null
          contact_summary: string | null
          contacts: Json | null
          content_count_365d: number | null
          content_topics: string[] | null
          country: string | null
          created_at: string | null
          created_by: string | null
          current_collaboration_due_at: string | null
          current_collaboration_id: string | null
          current_collaboration_ref: number | null
          current_collaboration_status: string | null
          current_collaboration_title: string | null
          data_status: string | null
          description: string | null
          do_not_contact: boolean | null
          has_contact_method: boolean | null
          id: string | null
          languages: string[] | null
          last_contact_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_published_at: string | null
          latest_direction: string | null
          latest_direction_at: string | null
          latest_direction_reason: string | null
          latest_post_at: string | null
          name: string | null
          next_action: string | null
          next_action_due_at: string | null
          notes: string | null
          outreach_score: number | null
          outreach_status: string | null
          owner_id: string | null
          platforms: string[] | null
          profile_metrics_as_of: string | null
          published_content_count: number | null
          ref: number | null
          refresh_fields: string[] | null
          refresh_fields_text: string | null
          row_version: number | null
          sheet_current_plan_name: string | null
          sheet_current_plan_ref: number | null
          sheet_first_outreach_at: string | null
          sheet_first_reply_at: string | null
          sheet_has_relationship_history: boolean | null
          sheet_primary_email: string | null
          sheet_primary_handle: string | null
          sheet_primary_platform: string | null
          sheet_primary_profile_url: string | null
          total_followers: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: []
      }
      gtm_creator_overview: {
        Row: {
          account_count: number | null
          account_summary: string | null
          activity_regions: string[] | null
          archived_at: string | null
          audience_summary: string | null
          collaboration_count: number | null
          contact_restriction_source: string | null
          contact_summary: string | null
          contacts: Json | null
          content_count_365d: number | null
          content_topics: string[] | null
          country: string | null
          created_at: string | null
          created_by: string | null
          current_collaboration_due_at: string | null
          current_collaboration_id: string | null
          current_collaboration_ref: number | null
          current_collaboration_status: string | null
          current_collaboration_title: string | null
          current_plan_name: string | null
          current_plan_ref: number | null
          data_status: string | null
          description: string | null
          do_not_contact: boolean | null
          first_outreach_at: string | null
          first_reply_at: string | null
          has_contact_method: boolean | null
          id: string | null
          languages: string[] | null
          last_contact_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_published_at: string | null
          latest_direction: string | null
          latest_direction_at: string | null
          latest_direction_reason: string | null
          latest_post_at: string | null
          name: string | null
          next_action: string | null
          next_action_due_at: string | null
          notes: string | null
          outreach_score: number | null
          outreach_status: string | null
          owner_id: string | null
          platforms: string[] | null
          primary_email: string | null
          primary_handle: string | null
          primary_platform: string | null
          primary_profile_url: string | null
          profile_metrics_as_of: string | null
          published_content_count: number | null
          ref: number | null
          refresh_fields: string[] | null
          refresh_fields_text: string | null
          row_version: number | null
          total_followers: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: []
      }
      gtm_creator_overview_base_v1: {
        Row: {
          account_count: number | null
          account_summary: string | null
          activity_regions: string[] | null
          archived_at: string | null
          audience_summary: string | null
          collaboration_count: number | null
          contact_restriction_source: string | null
          contact_summary: string | null
          contacts: Json | null
          content_count_365d: number | null
          content_topics: string[] | null
          country: string | null
          created_at: string | null
          created_by: string | null
          current_collaboration_due_at: string | null
          current_collaboration_id: string | null
          current_collaboration_ref: number | null
          current_collaboration_status: string | null
          current_collaboration_title: string | null
          current_plan_name: string | null
          current_plan_ref: number | null
          data_status: string | null
          description: string | null
          do_not_contact: boolean | null
          first_outreach_at: string | null
          first_reply_at: string | null
          has_contact_method: boolean | null
          id: string | null
          languages: string[] | null
          last_contact_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_published_at: string | null
          latest_direction: string | null
          latest_direction_at: string | null
          latest_direction_reason: string | null
          latest_post_at: string | null
          name: string | null
          next_action: string | null
          next_action_due_at: string | null
          notes: string | null
          outreach_status: string | null
          owner_id: string | null
          platforms: string[] | null
          primary_email: string | null
          primary_handle: string | null
          primary_platform: string | null
          primary_profile_url: string | null
          profile_metrics_as_of: string | null
          published_content_count: number | null
          ref: number | null
          refresh_fields: string[] | null
          refresh_fields_text: string | null
          row_version: number | null
          total_followers: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: []
      }
      gtm_format_overview: {
        Row: {
          archived_at: string | null
          caption_template: string | null
          cold_outreach_angle: string | null
          content_use_count: number | null
          created_at: string | null
          created_by: string | null
          default_campaign_id: string | null
          default_campaign_name: string | null
          default_campaign_ref: number | null
          default_outreach_template_id: string | null
          default_outreach_template_name: string | null
          default_outreach_template_ref: number | null
          description: string | null
          example_links: string[] | null
          examples: Json | null
          guide_ref: string | null
          guide_version: string | null
          hook: string | null
          id: string | null
          kill_rule: string | null
          last_published_at: string | null
          name: string | null
          owner_id: string | null
          published_content_count: number | null
          ref: number | null
          replicate_rule: string | null
          required_moment: string | null
          row_version: number | null
          shot_sequence: string | null
          status: string | null
          target_creator_profile: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_formats_default_campaign_id_fkey"
            columns: ["default_campaign_id"]
            isOneToOne: false
            referencedRelation: "gtm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_formats_default_outreach_template_id_fkey"
            columns: ["default_outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_review_sheet_v1"
            referencedColumns: ["outreach_template_id"]
          },
          {
            foreignKeyName: "gtm_formats_default_outreach_template_id_fkey"
            columns: ["default_outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_template_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtm_formats_default_outreach_template_id_fkey"
            columns: ["default_outreach_template_id"]
            isOneToOne: false
            referencedRelation: "gtm_outreach_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_outreach_review_sheet_v1: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          attempt_count: number | null
          body: string | null
          collaboration_id: string | null
          collaboration_ref: number | null
          collaboration_title: string | null
          compensation_currency: string | null
          compensation_strategy_name: string | null
          compensation_strategy_ref: number | null
          created_at: string | null
          created_by: string | null
          creator_id: string | null
          creator_name: string | null
          creator_ref: number | null
          estimated_cost: number | null
          estimated_views: number | null
          id: string | null
          last_error: string | null
          outreach_template_id: string | null
          outreach_template_name: string | null
          outreach_template_ref: number | null
          personalization_evidence: string | null
          plan_name: string | null
          plan_ref: number | null
          primary_handle: string | null
          primary_platform: string | null
          primary_profile_url: string | null
          provider_message_id: string | null
          provider_thread_id: string | null
          recipient_email: string | null
          ref: number | null
          replied_at: string | null
          review_action: string | null
          review_note: string | null
          row_version: number | null
          scheduled_at: string | null
          selection_reason: string | null
          sender_email: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
          template_version: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      gtm_outreach_sheet_v1: {
        Row: {
          archived_at: string | null
          body: string | null
          channel: string | null
          collaboration_id: string | null
          collaboration_ref: number | null
          collaboration_title: string | null
          connection_ref: string | null
          counterparty: string | null
          created_at: string | null
          created_by: string | null
          creator_id: string | null
          creator_name: string | null
          creator_outreach_status: string | null
          creator_ref: number | null
          delivery_diagnostic: string | null
          delivery_status: string | null
          direction: string | null
          external_id: string | null
          id: string | null
          kind: string | null
          manual_destination: string | null
          next_action: string | null
          next_action_due_at: string | null
          occurred_at: string | null
          outreach_template_name: string | null
          outreach_template_ref: number | null
          plan_name: string | null
          plan_ref: number | null
          primary_handle: string | null
          primary_platform: string | null
          provider: string | null
          publication_candidate_content_ref: number | null
          publication_candidate_tracking_ready: boolean | null
          publication_verification_required: boolean | null
          ref: number | null
          reply_mentioned_urls: Json | null
          reply_summary: string | null
          reply_type: string | null
          row_version: number | null
          source_ref: string | null
          subject: string | null
          thread_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      gtm_outreach_template_overview: {
        Row: {
          archived_at: string | null
          ask: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_ref: number | null
          channel: string | null
          created_at: string | null
          created_by: string | null
          default_format_count: number | null
          default_format_summary: string | null
          draft_count: number | null
          follow_up_template: string | null
          id: string | null
          language: string | null
          last_reply_at: string | null
          last_sent_at: string | null
          link_refs: string[] | null
          name: string | null
          offer_structure: string | null
          opening_template: string | null
          owner_id: string | null
          ref: number | null
          replied_thread_count: number | null
          response_rate: number | null
          row_version: number | null
          sent_count: number | null
          sent_thread_count: number | null
          status: string | null
          subject_template: string | null
          target_creator_profile: string | null
          template_version: string | null
          updated_at: string | null
          updated_by: string | null
          usage_notes: string | null
          value_proposition: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtm_outreach_templates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "gtm_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      gtm_plan_summary: {
        Row: {
          action_items: Json | null
          archived_at: string | null
          available_cash: number | null
          brief: string | null
          cash_budget: number | null
          committed_cash: number | null
          contingency: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          end_at: string | null
          goal_metric: string | null
          goal_value: number | null
          id: string | null
          incomplete_cost_items: number | null
          incurred_cost: number | null
          labor_budget_minutes: number | null
          metric_version: string | null
          name: string | null
          net_paid: number | null
          owner_id: string | null
          plan_document_ref: string | null
          plan_version: string | null
          ref: number | null
          row_version: number | null
          start_at: string | null
          status: string | null
          target_audience: string | null
          target_market: string | null
          timezone: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: []
      }
      gtm_today: {
        Row: {
          action: string | null
          action_id: string | null
          due_at: string | null
          entity: string | null
          entity_id: string | null
          owner_id: string | null
          ref: number | null
          row_version: number | null
          status: string | null
          title: string | null
        }
        Relationships: []
      }
      talent_effective_opportunity_recommendations_v1: {
        Row: {
          clicked_at: string | null
          created_at: string | null
          discovery_run_id: string | null
          dismissed_at: string | null
          email_acceptance_confirmation: Json | null
          evidence: Json | null
          feedback: string | null
          feedback_at: string | null
          feedback_reason: string | null
          fit_reasons: Json | null
          fit_summary: string | null
          id: string | null
          kind: string | null
          model_version: string | null
          opportunity_type: string | null
          preference_fit: Json | null
          processed_stage: string | null
          rank: number | null
          recommended_at: string | null
          role_id: string | null
          saved_stage: string | null
          score: number | null
          talent_id: string | null
          talent_memo: string | null
          tradeoffs: Json | null
          updated_at: string | null
          viewed_at: string | null
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string | null
          discovery_run_id?: string | null
          dismissed_at?: string | null
          email_acceptance_confirmation?: Json | null
          evidence?: Json | null
          feedback?: string | null
          feedback_at?: string | null
          feedback_reason?: string | null
          fit_reasons?: Json | null
          fit_summary?: string | null
          id?: string | null
          kind?: string | null
          model_version?: string | null
          opportunity_type?: string | null
          preference_fit?: Json | null
          processed_stage?: string | null
          rank?: number | null
          recommended_at?: string | null
          role_id?: string | null
          saved_stage?: string | null
          score?: number | null
          talent_id?: string | null
          talent_memo?: string | null
          tradeoffs?: Json | null
          updated_at?: string | null
          viewed_at?: string | null
        }
        Update: {
          clicked_at?: string | null
          created_at?: string | null
          discovery_run_id?: string | null
          dismissed_at?: string | null
          email_acceptance_confirmation?: Json | null
          evidence?: Json | null
          feedback?: string | null
          feedback_at?: string | null
          feedback_reason?: string | null
          fit_reasons?: Json | null
          fit_summary?: string | null
          id?: string | null
          kind?: string | null
          model_version?: string | null
          opportunity_type?: string | null
          preference_fit?: Json | null
          processed_stage?: string | null
          rank?: number | null
          recommended_at?: string | null
          role_id?: string | null
          saved_stage?: string | null
          score?: number | null
          talent_id?: string | null
          talent_memo?: string | null
          tradeoffs?: Json | null
          updated_at?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_recommendation_discovery_run_fkey"
            columns: ["discovery_run_id"]
            isOneToOne: false
            referencedRelation: "opportunity_discovery_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_opportunity_recommendation_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "talent_opportunity_recommendation_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_role_fit_with_selection_v1: {
        Row: {
          behavior_context_version: number | null
          candidate_fit: string | null
          candidate_reason: string | null
          candidate_visible: boolean | null
          company_criteria_evaluations: Json | null
          company_fit: string | null
          company_reason: string | null
          company_side_evaluation_metadata: Json | null
          created_at: string | null
          evaluated_stage: number | null
          evaluation_started_at: string | null
          expires_at: string | null
          fit_contract_version: string | null
          history: Json | null
          human_label: string | null
          human_reason: string | null
          human_reviewed_at: string | null
          human_reviewed_by: string | null
          id: string | null
          input_fingerprint: string | null
          kind: string | null
          label: string | null
          last_evaluated_at: string | null
          missing_info: string | null
          model_manifest: Json | null
          opportunity_id: string | null
          priority_review_recommendable: boolean | null
          reason: string | null
          recommend: boolean | null
          reevaluation_checked_at: string | null
          reevaluation_criteria: Json | null
          role_fit: string | null
          score: number | null
          source_versions: Json | null
          stage_one_result: string | null
          talent_id: string | null
        }
        Insert: {
          behavior_context_version?: number | null
          candidate_fit?: string | null
          candidate_reason?: string | null
          candidate_visible?: never
          company_criteria_evaluations?: Json | null
          company_fit?: string | null
          company_reason?: string | null
          company_side_evaluation_metadata?: Json | null
          created_at?: string | null
          evaluated_stage?: number | null
          evaluation_started_at?: string | null
          expires_at?: string | null
          fit_contract_version?: string | null
          history?: Json | null
          human_label?: string | null
          human_reason?: string | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          id?: string | null
          input_fingerprint?: string | null
          kind?: string | null
          label?: string | null
          last_evaluated_at?: string | null
          missing_info?: string | null
          model_manifest?: Json | null
          opportunity_id?: string | null
          priority_review_recommendable?: never
          reason?: string | null
          recommend?: boolean | null
          reevaluation_checked_at?: string | null
          reevaluation_criteria?: Json | null
          role_fit?: string | null
          score?: number | null
          source_versions?: Json | null
          stage_one_result?: string | null
          talent_id?: string | null
        }
        Update: {
          behavior_context_version?: number | null
          candidate_fit?: string | null
          candidate_reason?: string | null
          candidate_visible?: never
          company_criteria_evaluations?: Json | null
          company_fit?: string | null
          company_reason?: string | null
          company_side_evaluation_metadata?: Json | null
          created_at?: string | null
          evaluated_stage?: number | null
          evaluation_started_at?: string | null
          expires_at?: string | null
          fit_contract_version?: string | null
          history?: Json | null
          human_label?: string | null
          human_reason?: string | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          id?: string | null
          input_fingerprint?: string | null
          kind?: string | null
          label?: string | null
          last_evaluated_at?: string | null
          missing_info?: string | null
          model_manifest?: Json | null
          opportunity_id?: string | null
          priority_review_recommendable?: never
          reason?: string | null
          recommend?: boolean | null
          reevaluation_checked_at?: string | null
          reevaluation_criteria?: Json | null
          role_fit?: string | null
          score?: number | null
          source_versions?: Json | null
          stage_one_result?: string | null
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_fit_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "talent_opportunity_fit_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      delete_company_workspace_v1: {
        Args: {
          p_workspace: string
          p_actor: string
          p_confirmation_name: string
          p_stripe_customer: string | null
          p_billing_checkout: Json | null
        }
        Returns: undefined
      }
      claim_workspace_signup_notification_v1: {
        Args: { p_workspace: string }
        Returns: Json
      }
      accept_talent_internal_role_recommendation_v1: {
        Args: {
          p_context?: Json
          p_email_acceptance_confirmation?: Json
          p_feedback_reason?: string
          p_recommendation_id: string
          p_source_role_id?: string
          p_talent_id: string
        }
        Returns: Json
      }
      accept_talent_internal_role_recommendation_v2: {
        Args: {
          p_context?: Json
          p_email_acceptance_confirmation?: Json
          p_expected_updated_at?: string
          p_feedback_reason?: string
          p_recommendation_id: string
          p_source_role_id?: string
          p_talent_id: string
        }
        Returns: Json
      }
      accepted_role_pair_is_available_v1: {
        Args: { p_recommendation_id: string }
        Returns: boolean
      }
      activate_slack_company_agent_update_proposal_v1: {
        Args: {
          p_proposal_id: string
          p_slack_bot_user_id: string
          p_slack_message_ts: string
        }
        Returns: Json
      }
      append_talent_role_memo_activity_v1: {
        Args: {
          p_content: string
          p_recommendation_id: string
          p_talent_id: string
        }
        Returns: string
      }
      apply_company_data_changes_internal_v1: {
        Args: {
          p_changes: Json
          p_event_content: string
          p_source: string
          p_sync_company_db: boolean
          p_workspace_id: string
        }
        Returns: Json
      }
      apply_company_data_changes_v1: {
        Args: {
          p_changes: Json
          p_event_content: string
          p_source: string
          p_workspace_id: string
        }
        Returns: Json
      }
      apply_company_role_calibration_feedback_v1: {
        Args: {
          p_calibration_id: string
          p_expected_calibration_updated_at: string
          p_expected_request: string
          p_finish: boolean
          p_hiring_brief: string
          p_reviewed_by: string
          p_reviews: Json
          p_role_id: string
          p_source_message_id: number
          p_workspace_id: string
        }
        Returns: Json
      }
      archive_ended_internal_opportunities_for_talent: {
        Args: { p_locale?: string; p_talent_id: string }
        Returns: number
      }
      can_access_candidate_profile: {
        Args: { target_candid_id: string }
        Returns: boolean
      }
      cancel_company_talent_request_v1: {
        Args: {
          p_request_id: string
          p_role_id: string
          p_talent_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      candid_with_github: {
        Args: never
        Returns: {
          bio: string | null
          created_at: string
          email: string | null
          fts: unknown
          headline: string | null
          id: string
          is_duplicated_old: boolean
          is_korean: boolean
          is_linkedin_deprecated: boolean
          is_selective: boolean
          last_updated_at: string | null
          linkedin_url: string | null
          links: string[] | null
          location: string | null
          name: string | null
          profile_picture: string | null
          summary: string | null
          total_exp_months: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "candid"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      candidate_reengagement_request_is_current_v1: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      change_company_talent_request_v1: {
        Args: {
          p_action: string
          p_request_id: string
          p_role_id: string
          p_talent_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      change_internal_talent_opportunity_decision:
        | {
            Args: {
              p_action: string
              p_changed_at?: string
              p_recommendation_id: string
              p_talent_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_action: string
              p_changed_at: string
              p_reason: string
              p_recommendation_id: string
              p_talent_id: string
            }
            Returns: string
          }
      change_internal_talent_opportunity_decision_v2: {
        Args: {
          p_action: string
          p_changed_at?: string
          p_reason?: string
          p_recommendation_id: string
          p_talent_id: string
        }
        Returns: string
      }
      claim_career_email_onboarding_lead: {
        Args: {
          onboarding_lead_id: string
          target_email?: string
          target_name?: string
          target_profile_picture?: string
          target_user_id: string
        }
        Returns: boolean
      }
      claim_career_email_onboarding_reviews: {
        Args: {
          batch_size?: number
          max_attempts?: number
          stale_after_seconds?: number
          worker_id: string
        }
        Returns: {
          abtest_type: string
          calendar_cta_sent_at: string | null
          calendar_url: string | null
          conversation_id: string | null
          converted_at: string | null
          converted_user_id: string | null
          country_lang: string | null
          created_at: string
          display_name: string | null
          email: string
          first_email_resend_id: string | null
          first_email_sent_at: string | null
          first_inbound_at: string | null
          id: string
          is_mobile: boolean | null
          last_error: string | null
          local_id: string | null
          metadata: Json
          normalized_email: string
          page_path: string | null
          paused_at: string | null
          profile_ingested_at: string | null
          profile_links: string[]
          profile_received_at: string | null
          reply_alias: string | null
          resume_text: string | null
          review_attempts: number
          review_email_resend_id: string | null
          review_locked_at: string | null
          review_locked_by: string | null
          source: string | null
          status: string
          step: string
          talent_id: string | null
          updated_at: string
          variant: string
        }[]
        SetofOptions: {
          from: "*"
          to: "career_email_onboarding_leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_company_agent_web_action_v1: {
        Args: {
          p_job_id: string
          p_max_attempts?: number
          p_stale_after_seconds?: number
          p_worker_id: string
        }
        Returns: {
          action_context: Json
          action_name: string
          actor_user_id: string | null
          anchor_message_id: number
          attempt_count: number
          company_workspace_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          progress_message_id: number | null
          queue_dispatch_attempt_count: number
          queue_dispatch_status: string
          queue_dispatched_at: string | null
          queue_last_error: string | null
          queue_next_attempt_at: string
          role_id: string | null
          status: string
          terminal_message_id: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "company_agent_web_action_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_company_context_run_v1: {
        Args: { p_role_id?: string; p_runner: string }
        Returns: {
          available_at: string
          id: string
          result: Json
          role_id: string
          status: string
          trigger_reason: string
        }[]
        SetofOptions: {
          from: "*"
          to: "company_context_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_company_role_calibration_v1: {
        Args: { p_runner: string }
        Returns: {
          available_at: string
          company_workspace_id: string
          created_at: string
          id: string
          payload: Json
          role_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "company_role_calibrations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_contact_queue_jobs: {
        Args: {
          batch_size?: number
          max_attempts?: number
          stale_after_seconds?: number
          worker_id: string
        }
        Returns: {
          attempts: number
          cancelled_at: string | null
          company_talent_relay_id: string | null
          company_talent_request_id: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          recommendation_id: string | null
          resend_email_id: string | null
          role_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "contact_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_daily_external_run: {
        Args: { p_run_id: string; p_token: string }
        Returns: Json
      }
      claim_email_reply_jobs: {
        Args: {
          batch_size?: number
          max_attempts?: number
          stale_after_seconds?: number
          worker_id: string
        }
        Returns: {
          assistant_message_id: number | null
          attempts: number
          conversation_id: string | null
          created_at: string
          id: string
          inbound_event_id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          metadata: Json
          processed_at: string | null
          resend_email_id: string | null
          skip_reason: string | null
          status: string
          talent_id: string | null
          updated_at: string
          user_message_id: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_reply_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_meeting_schedule_calendar_event_v1: {
        Args: { p_schedule_id: string }
        Returns: Json
      }
      claim_post_calibration_company_context_run_v1: {
        Args: { p_runner: string }
        Returns: {
          available_at: string
          id: string
          result: Json
          role_id: string
          status: string
          trigger_reason: string
        }[]
        SetofOptions: {
          from: "*"
          to: "company_context_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_scheduled_company_run_v1: {
        Args: { p_batch_run_id: string; p_runner: string }
        Returns: {
          available_at: string
          id: string
          result: Json
          role_id: string
          status: string
          trigger_reason: string
        }[]
        SetofOptions: {
          from: "*"
          to: "company_context_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_slack_reply_job_v3: {
        Args: {
          p_job_id: string
          p_max_concurrency?: number
          p_max_retry_count?: number
          p_stale_after_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          batched_prompt: string | null
          batched_slack_files: Json
          choice_source_job_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          prompt: string
          queue_dispatch_attempt_count: number
          queue_dispatch_status: string
          queue_dispatched_at: string | null
          queue_last_error: string | null
          queue_next_attempt_at: string
          queue_source: string | null
          response_message_id: number | null
          response_proposal_id: string | null
          response_text: string | null
          selected_choice_at: string | null
          selected_choice_by_slack_user_id: string | null
          selected_choice_index: number | null
          selected_choice_label: string | null
          selected_choice_message: string | null
          slack_event_id: string
          slack_files: Json
          slack_message_ts: string
          slack_response_ts: string | null
          slack_user_id: string | null
          status: string
          thread_id: string
          trigger_kind: string
          updated_at: string
          user_message_id: number | null
          worker_target: string
        }[]
        SetofOptions: {
          from: "*"
          to: "slack_reply_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_slack_reply_jobs: {
        Args: {
          p_batch_size?: number
          p_max_retry_count?: number
          p_stale_after_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          batched_prompt: string | null
          batched_slack_files: Json
          choice_source_job_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          prompt: string
          queue_dispatch_attempt_count: number
          queue_dispatch_status: string
          queue_dispatched_at: string | null
          queue_last_error: string | null
          queue_next_attempt_at: string
          queue_source: string | null
          response_message_id: number | null
          response_proposal_id: string | null
          response_text: string | null
          selected_choice_at: string | null
          selected_choice_by_slack_user_id: string | null
          selected_choice_index: number | null
          selected_choice_label: string | null
          selected_choice_message: string | null
          slack_event_id: string
          slack_files: Json
          slack_message_ts: string
          slack_response_ts: string | null
          slack_user_id: string | null
          status: string
          thread_id: string
          trigger_kind: string
          updated_at: string
          user_message_id: number | null
          worker_target: string
        }[]
        SetofOptions: {
          from: "*"
          to: "slack_reply_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_slack_reply_jobs_v2: {
        Args: {
          p_batch_size?: number
          p_max_retry_count?: number
          p_stale_after_seconds?: number
          p_worker_id: string
          p_worker_target: string
        }
        Returns: {
          attempt_count: number
          batched_prompt: string | null
          batched_slack_files: Json
          choice_source_job_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          prompt: string
          queue_dispatch_attempt_count: number
          queue_dispatch_status: string
          queue_dispatched_at: string | null
          queue_last_error: string | null
          queue_next_attempt_at: string
          queue_source: string | null
          response_message_id: number | null
          response_proposal_id: string | null
          response_text: string | null
          selected_choice_at: string | null
          selected_choice_by_slack_user_id: string | null
          selected_choice_index: number | null
          selected_choice_label: string | null
          selected_choice_message: string | null
          slack_event_id: string
          slack_files: Json
          slack_message_ts: string
          slack_response_ts: string | null
          slack_user_id: string | null
          status: string
          thread_id: string
          trigger_kind: string
          updated_at: string
          user_message_id: number | null
          worker_target: string
        }[]
        SetofOptions: {
          from: "*"
          to: "slack_reply_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_talent_user_email_alias: {
        Args: {
          source_email: string
          target_email?: string
          target_name?: string
          target_profile_picture?: string
          target_user_id: string
        }
        Returns: boolean
      }
      commit_internal_process_closure_notice_v1: {
        Args: {
          p_metadata?: Json
          p_recommendation_id: string
          p_talent_id: string
          p_text: string
          p_user_id: string
        }
        Returns: boolean
      }
      company_data_change_current_value_v1: {
        Args: { p_key: string; p_role_id?: string; p_workspace_id: string }
        Returns: Json
      }
      company_first_outbox_is_deliverable_v1: {
        Args: { p_outbox_id: string }
        Returns: boolean
      }
      company_first_pair_is_available_v1: {
        Args: { p_role_id: string; p_talent_id: string }
        Returns: boolean
      }
      company_intro_role_allows_talent_v1: {
        Args: { p_information: Json; p_talent_id: string }
        Returns: boolean
      }
      company_role_is_calibration_eligible_v1: {
        Args: { p_now?: string; p_role_id: string }
        Returns: boolean
      }
      company_talent_pair_is_contactable_v1: {
        Args: {
          p_recommendation_id: string
          p_role_id: string
          p_talent_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      company_talent_request_stage_is_pending_v1: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      company_talent_request_target_is_active_v1: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      complete_company_role_creation_v1: {
        Args: { p_role_id: string; p_workspace_id: string }
        Returns: boolean
      }
      complete_external_recommendation_run: {
        Args: { p_lease_token?: string; p_rows: Json; p_run_id: string }
        Returns: Json
      }
      confirm_internal_candidate_from_contact_v1: {
        Args: {
          p_actor_email: string
          p_actor_user_id: string
          p_metadata: Json
          p_recommendation_id: string
          p_relay_id: string
          p_role_id: string
          p_stage: string
          p_talent_id: string
          p_text: string
        }
        Returns: boolean
      }
      confirm_internal_candidate_reengagement_v1: {
        Args: {
          p_actor_email: string
          p_actor_user_id: string
          p_metadata: Json
          p_recommendation_id: string
          p_role_id: string
          p_stage: string
          p_talent_id: string
          p_text: string
        }
        Returns: boolean
      }
      count_crm_email_broadcast_recipients: {
        Args: { p_onboarding_done_only?: boolean; p_preferred_locale?: string }
        Returns: number
      }
      create_company_talent_relay_v1: {
        Args: {
          p_document_id?: string
          p_relay_content: string
          p_request_id: string
          p_source_message_id: number
          p_talent_id: string
        }
        Returns: Json
      }
      create_company_talent_relay_v2: {
        Args: {
          p_document_id?: string
          p_recommendation_id: string
          p_relay_content: string
          p_request_id?: string
          p_source_message_id: number
          p_talent_id: string
        }
        Returns: Json
      }
      create_company_team_role_v1: {
        Args: {
          p_actor: string
          p_information?: Json
          p_name: string
          p_role: string
          p_workspace: string
        }
        Returns: string
      }
      create_email_inbound_event_and_job_v1: {
        Args: {
          p_cc_addresses: string[]
          p_from_email: string
          p_job_kind: string
          p_job_metadata: Json
          p_message_id: string
          p_provider: string
          p_provider_email_id: string
          p_provider_event_id: string
          p_received_at: string
          p_subject: string
          p_to_addresses: string[]
        }
        Returns: Json
      }
      create_meeting_schedule_draft_v1: {
        Args: {
          p_additional_message: Json
          p_company_attendees: Json
          p_company_workspace_id: string
          p_draft_blocker: string
          p_duration_minutes: number
          p_idempotency_key: string
          p_meeting_config_snapshot: Json
          p_organizer_company_user_id: string
          p_recommendation_id: string
          p_role_id: string
          p_source_company_message_id: number
          p_talent_id: string
          p_title: string
        }
        Returns: Json
      }
      current_talent_recommendation_for_talent_v1: {
        Args: { p_recommendation_id: string; p_talent_id: string }
        Returns: string
      }
      current_talent_recommendation_id_v1: {
        Args: { p_recommendation_id: string }
        Returns: string
      }
      decide_company_intro_request_v1: {
        Args: {
          p_decision: string
          p_email_acceptance_confirmation?: Json
          p_feedback_reason?: string
          p_recommendation_id: string
          p_talent_id: string
        }
        Returns: Json
      }
      decide_company_intro_request_v2: {
        Args: {
          p_decision: string
          p_email_acceptance_confirmation?: Json
          p_expected_updated_at?: string
          p_feedback_reason?: string
          p_recommendation_id: string
          p_talent_id: string
        }
        Returns: Json
      }
      deduct_user_credits: {
        Args: { amount_to_deduct: number }
        Returns: number
      }
      enqueue_career_job_posting_discovery_run: {
        Args: {
          p_conversation_id: string
          p_dedupe_key: string
          p_fingerprint: string
          p_settings_snapshot?: Json
          p_talent_id: string
          p_target_recommendation_count: number
          p_trigger_payload: Json
        }
        Returns: Json
      }
      enqueue_company_agent_web_action_v1: {
        Args: {
          p_action_context: Json
          p_action_name: string
          p_actor_user_id: string
          p_company_workspace_id: string
          p_conversation_id: string
          p_idempotency_key: string
          p_role_id: string
        }
        Returns: {
          created: boolean
          job_id: string
        }[]
      }
      enqueue_company_context_run_v1: {
        Args: {
          p_available_at?: string
          p_role_id: string
          p_trigger_reason: string
        }
        Returns: string
      }
      enqueue_company_matching_search_v1: {
        Args: {
          p_company_user_id: string
          p_company_workspace_id: string
          p_role_id: string
        }
        Returns: Json
      }
      enqueue_company_role_calibration_v1: {
        Args: { p_available_at?: string; p_role_id: string }
        Returns: string
      }
      enqueue_company_talent_request_v1:
        | {
            Args: {
              p_expects_document: boolean
              p_recommendation_id: string
              p_request_context: string
              p_role_id: string
              p_source_company_message_id: number
              p_talent_id: string
              p_workspace_id: string
            }
            Returns: {
              approved_at: string | null
              company_workspace_id: string
              contact_kind: string
              contact_purpose: string
              created_at: string
              delivery_body: string | null
              delivery_subject: string | null
              document_id: string | null
              draft_revision: number
              expects_document: boolean
              expires_at: string
              id: string
              in_reply_to_company_talent_relay_id: string | null
              intent: string
              recommendation_id: string
              request_context: string
              response_disposition: string | null
              resume_stage: string | null
              role_id: string
              source_company_message_id: number
              talent_id: string
              talent_source_message_id: number | null
              updated_at: string
              workflow_status: string
            }
            SetofOptions: {
              from: "*"
              to: "company_talent_requests"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_delivery_mode: string
              p_expects_document: boolean
              p_recommendation_id: string
              p_request_context: string
              p_role_id: string
              p_source_company_message_id: number
              p_talent_id: string
              p_workspace_id: string
            }
            Returns: {
              approved_at: string | null
              company_workspace_id: string
              contact_kind: string
              contact_purpose: string
              created_at: string
              delivery_body: string | null
              delivery_subject: string | null
              document_id: string | null
              draft_revision: number
              expects_document: boolean
              expires_at: string
              id: string
              in_reply_to_company_talent_relay_id: string | null
              intent: string
              recommendation_id: string
              request_context: string
              response_disposition: string | null
              resume_stage: string | null
              role_id: string
              source_company_message_id: number
              talent_id: string
              talent_source_message_id: number | null
              updated_at: string
              workflow_status: string
            }
            SetofOptions: {
              from: "*"
              to: "company_talent_requests"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      enqueue_company_update_v1: {
        Args: {
          p_event_key: string
          p_facts: Json
          p_purpose: string
          p_role_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      enqueue_due_company_context_runs_v1: {
        Args: { p_now?: string }
        Returns: number
      }
      enqueue_post_calibration_company_context_run_v1: {
        Args: { p_calibration_id: string }
        Returns: string
      }
      enqueue_post_calibration_company_matching_run_v1: {
        Args: { p_calibration_id: string }
        Returns: string
      }
      enqueue_scheduled_company_runs_v1: {
        Args: { p_batch_run_id: string; p_scheduled_for: string }
        Returns: {
          outcome: string
          role_id: string
          run_id: string
        }[]
      }
      enqueue_slack_button_choice_v1: {
        Args: {
          p_action_ts: string
          p_choice_index: number
          p_choice_label: string
          p_choice_message: string
          p_slack_channel_id: string
          p_slack_team_id: string
          p_slack_user_id: string
          p_source_job_id: string
          p_source_message_ts: string
        }
        Returns: Json
      }
      enqueue_slack_reply_job_v1: {
        Args: {
          p_prompt: string
          p_slack_event_id: string
          p_slack_message_ts: string
          p_slack_user_id: string
          p_thread_id: string
          p_trigger_kind: string
        }
        Returns: Json
      }
      enqueue_slack_reply_job_v2: {
        Args: {
          p_prompt: string
          p_slack_event_id: string
          p_slack_files?: Json
          p_slack_message_ts: string
          p_slack_user_id: string
          p_thread_id: string
          p_trigger_kind: string
        }
        Returns: Json
      }
      execute_raw_sql: {
        Args: {
          limit_num: number
          offset_num: number
          page_idx: number
          sql_query: string
        }
        Returns: Json[]
      }
      expire_talent_career_coaching_activity: {
        Args: {
          p_activity_message_id: number
          p_conversation_id: string
          p_user_id: string
        }
        Returns: {
          content: string
          conversation_id: string | null
          created_at: string
          id: number
          is_mobile: boolean | null
          message_type: string
          payload: Json | null
          role: string
          thinking_logs: Json
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "talent_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_company_role_calibration_v1: {
        Args: { p_calibration_id: string; p_error: string }
        Returns: {
          available_at: string
          company_workspace_id: string
          created_at: string
          id: string
          payload: Json
          role_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "company_role_calibrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fetch_career_recent_info_v1: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_limit?: number
          p_since?: string
          p_talent_id: string
        }
        Returns: {
          body: string
          company_name: string
          event_id: string
          kind: string
          occurred_at: string
          role_id: string
          role_name: string
        }[]
      }
      finalize_company_talent_delivery_v1: {
        Args: {
          p_request_id: string
          p_slack_bot_user_id?: string
          p_slack_message_ts?: string
        }
        Returns: Json
      }
      finalize_company_talent_relay_delivery_v1: {
        Args: {
          p_relay_id: string
          p_slack_bot_user_id?: string
          p_slack_message_ts?: string
        }
        Returns: Json
      }
      finalize_company_talent_resume_relay_v1: {
        Args: {
          p_content_type: string
          p_extracted_text: string
          p_file_name: string
          p_relay_content: string
          p_request_id: string
          p_size_bytes: number
          p_source_message_id: number
          p_storage_path: string
          p_talent_id: string
        }
        Returns: Json
      }
      finalize_slack_company_agent_reply_v1: {
        Args: {
          p_job_id: string
          p_slack_bot_user_id: string
          p_slack_message_ts: string
        }
        Returns: Json
      }
      finalize_talent_onboarding_submission_v1: {
        Args: {
          p_conversation_id: string
          p_is_mobile?: boolean
          p_kickoff_content: string
          p_pending_question_content: string
          p_profile_submit_content: string
          p_user_id: string
        }
        Returns: Json
      }
      finalize_talent_resume_upload_v1: {
        Args: {
          p_content_type: string
          p_conversation_id: string
          p_extracted_text: string
          p_file_name: string
          p_request_id: string
          p_size_bytes: number
          p_storage_path: string
          p_talent_id: string
        }
        Returns: Json
      }
      finish_company_context_run_v1: {
        Args: { p_result?: Json; p_run_id: string; p_status: string }
        Returns: {
          available_at: string
          id: string
          result: Json
          role_id: string
          status: string
          trigger_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "company_context_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_company_role_calibration_v1: {
        Args: {
          p_calibration_id: string
          p_expected_calibration_updated_at: string
          p_expected_company_updated_at: string
          p_expected_internal_role_updated_at: string
          p_expected_role_updated_at: string
          p_profiles: Json
          p_source: Json
          p_summary: string
        }
        Returns: {
          available_at: string
          company_workspace_id: string
          created_at: string
          id: string
          payload: Json
          role_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "company_role_calibrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_ops_talent_action_logs_v1: {
        Args: {
          p_days?: number
          p_group?: string
          p_view?: string
          p_weeks?: number
        }
        Returns: Json
      }
      get_ops_talent_metrics_conversion_v1: {
        Args: {
          p_excluded_email_terms?: string[]
          p_from: string
          p_interval?: string
          p_to: string
        }
        Returns: Json
      }
      get_ops_talent_metrics_engagement_v1: {
        Args: {
          p_excluded_email_terms?: string[]
          p_from: string
          p_interval?: string
          p_to: string
        }
        Returns: Json
      }
      get_ops_talent_metrics_retention_v1: {
        Args: {
          p_excluded_email_terms?: string[]
          p_from: string
          p_interval?: string
          p_to: string
        }
        Returns: Json
      }
      get_ops_talent_metrics_v1: {
        Args: {
          p_excluded_email_terms?: string[]
          p_from: string
          p_interval?: string
          p_to: string
        }
        Returns: Json
      }
      get_ops_talent_metrics_v2: {
        Args: {
          p_excluded_email_terms?: string[]
          p_from: string
          p_interval?: string
          p_to: string
        }
        Returns: Json
      }
      gtm_check_budgets: { Args: { p_cost_id: string }; Returns: undefined }
      gtm_compensation_amount: {
        Args: { p_snapshot: Json; p_views: number }
        Returns: number
      }
      gtm_finalize_content_compensation: {
        Args: { p_content_id: string }
        Returns: Json
      }
      gtm_net_paid: { Args: { p_payments: Json }; Returns: number }
      gtm_outreach_claim_notifications: {
        Args: { p_lease_id: string; p_mailbox: string }
        Returns: Json
      }
      gtm_outreach_ingest_gmail_delivery_failure: {
        Args: {
          p_diagnostic_code?: string
          p_final_recipient?: string
          p_in_reply_to?: string
          p_mailbox: string
          p_message_id: string
          p_received_at?: string
          p_references?: string
          p_rfc_message_id?: string
          p_status?: string
          p_thread_id: string
        }
        Returns: Json
      }
      gtm_outreach_ingest_gmail_reply: {
        Args: {
          p_body: string
          p_from_email: string
          p_in_reply_to?: string
          p_mailbox: string
          p_message_id: string
          p_received_at: string
          p_references?: string
          p_rfc_message_id?: string
          p_subject: string
          p_thread_id: string
          p_to_email: string
        }
        Returns: Json
      }
      gtm_outreach_ingest_resend_delivery_event: {
        Args: {
          p_diagnostic_code: string
          p_event_type: string
          p_occurred_at: string
          p_permanent: boolean
          p_provider_event_id: string
          p_provider_message_id: string
          p_recipient_email: string
        }
        Returns: Json
      }
      gtm_outreach_pending_reply_notifications: {
        Args: { p_limit?: number }
        Returns: Json
      }
      gtm_outreach_record_activity_slack_notification: {
        Args: {
          p_activity_id: string
          p_channel_id: string
          p_slack_ts?: string
        }
        Returns: undefined
      }
      gtm_outreach_record_reply_triage: {
        Args: {
          p_mentioned_urls?: Json
          p_model?: string
          p_reply_activity_id: string
          p_summary: string
          p_type: string
        }
        Returns: Json
      }
      gtm_outreach_record_slack_notification: {
        Args: {
          p_channel_id: string
          p_reply_activity_id: string
          p_slack_ts?: string
        }
        Returns: undefined
      }
      gtm_outreach_release_notifications: {
        Args: { p_error?: string; p_lease_id: string; p_mailbox: string }
        Returns: undefined
      }
      gtm_outreach_worker_claim: {
        Args: { p_dispatch_id?: string; p_limit?: number }
        Returns: Json
      }
      gtm_outreach_worker_mark_failed: {
        Args: { p_dispatch_id: string; p_error: string; p_retryable?: boolean }
        Returns: Json
      }
      gtm_outreach_worker_mark_sent: {
        Args: {
          p_dispatch_id: string
          p_provider_message_id: string
          p_provider_thread_id: string
          p_sent_at?: string
        }
        Returns: Json
      }
      gtm_outreach_worker_record_delivery: {
        Args: {
          p_dispatch_id: string
          p_provider: string
          p_provider_message_id: string
          p_rfc_message_id?: string
          p_sent_at?: string
          p_thread_id?: string
        }
        Returns: Json
      }
      gtm_parse_utm: { Args: { p_type: string }; Returns: Json }
      gtm_pending_compensation_notifications: {
        Args: { p_limit?: number }
        Returns: Json
      }
      gtm_performance: { Args: { p_options?: Json }; Returns: Json }
      gtm_record_compensation_slack_notification: {
        Args: { p_channel_id: string; p_cost_id: string; p_slack_ts?: string }
        Returns: undefined
      }
      gtm_url_decode: { Args: { p_value: string }; Returns: string }
      gtm_validate_record: {
        Args: { p_before?: Json; p_entity: string; p_record: Json }
        Returns: undefined
      }
      gtm_workspace: {
        Args: { p_action: string; p_data?: Json }
        Returns: Json
      }
      import_talent_job_link: {
        Args: {
          p_existing_role_id: string
          p_preserve_existing_progress?: boolean
          p_role: Json
          p_saved_stage: string
          p_talent_id: string
          p_workspace: Json
          p_workspace_id: string
        }
        Returns: {
          created_recommendation: boolean
          created_role: boolean
          created_workspace: boolean
          recommendation_id: string
          role_id: string
          role_source_provider: string
          saved_stage: string
        }[]
      }
      internal_opportunity_is_stage_tag: {
        Args: { p_tag: string }
        Returns: boolean
      }
      list_company_agent_slack_threads_v1: {
        Args: {
          p_before_last_message_id?: number
          p_conversation_id: string
          p_limit?: number
          p_max_message_id: number
        }
        Returns: {
          channel_name: string
          first_messages: Json
          last_message_at: string
          last_message_id: number
          message_count: number
          slack_thread_id: string
          thread_started_at: string
        }[]
      }
      list_company_contact_index_v1: {
        Args: {
          p_after?: string
          p_before?: string
          p_company_workspace_id: string
          p_date_basis?: string
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_role_id?: string
          p_talent_id?: string
        }
        Returns: {
          activity_at: string
          company_user_email: string
          company_user_id: string
          company_user_name: string
          confirmed_start_at: string
          created_at: string
          delivery_status: string
          expects_document: boolean
          expires_at: string
          has_response: boolean
          kind: string
          relay_sent_at: string
          relay_status: string
          response_received_at: string
          role_id: string
          role_name: string
          sent_at: string
          source_id: string
          talent_email: string
          talent_id: string
          talent_name: string
          updated_at: string
          workflow_status: string
        }[]
      }
      list_company_contact_index_v2: {
        Args: {
          p_after?: string
          p_before?: string
          p_company_workspace_id: string
          p_date_basis?: string
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_role_id?: string
          p_talent_id?: string
        }
        Returns: {
          activity_at: string
          company_user_email: string
          company_user_id: string
          company_user_name: string
          confirmed_start_at: string
          created_at: string
          delivery_status: string
          expects_document: boolean
          expires_at: string
          has_response: boolean
          kind: string
          relay_sent_at: string
          relay_status: string
          response_received_at: string
          role_id: string
          role_name: string
          sent_at: string
          source_id: string
          talent_email: string
          talent_id: string
          talent_name: string
          updated_at: string
          workflow_status: string
        }[]
      }
      list_company_team_contact_index_v1: {
        Args: {
          p_actor: string
          p_after?: string
          p_before?: string
          p_company_workspace_id: string
          p_date_basis?: string
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_role_id?: string
          p_talent_id?: string
        }
        Returns: {
          activity_at: string
          company_user_email: string
          company_user_id: string
          company_user_name: string
          confirmed_start_at: string
          created_at: string
          delivery_status: string
          expects_document: boolean
          expires_at: string
          has_response: boolean
          kind: string
          relay_sent_at: string
          relay_status: string
          response_received_at: string
          role_id: string
          role_name: string
          sent_at: string
          source_id: string
          talent_email: string
          talent_id: string
          talent_name: string
          updated_at: string
          workflow_status: string
        }[]
      }
      list_crm_email_broadcasts: {
        Args: { p_broadcast_id?: string }
        Returns: {
          cancelled_count: number
          completed_at: string
          created_at: string
          failed_count: number
          html_content: string
          id: string
          name: string
          paused_count: number
          processing_count: number
          queued_at: string
          queued_count: number
          recipient_onboarding_done_only: boolean
          recipient_preferred_locale: string
          scheduled_at: string
          sent_count: number
          status: string
          subject: string
          total_count: number
          updated_at: string
        }[]
      }
      list_translation_entry_groups: {
        Args: {
          p_after_key?: string
          p_limit?: number
          p_min_ko_length?: number
          p_namespace?: string
          p_query?: string
        }
        Returns: {
          description: string
          en: string
          key: string
          ko: string
          updated_at: string
          updated_by: string
        }[]
      }
      lock_company_role_ingest: {
        Args: { target_workspace_id: string }
        Returns: undefined
      }
      manage_company_team_v1: {
        Args: {
          p_action: string
          p_actor: string
          p_members?: string[]
          p_name?: string
          p_roles?: string[]
          p_team?: string
          p_workspace: string
        }
        Returns: string
      }
      mark_company_role_calibration_delivery_v1: {
        Args: {
          p_calibration_id: string
          p_delivered: boolean
          p_error?: string
        }
        Returns: {
          available_at: string
          company_workspace_id: string
          created_at: string
          id: string
          payload: Json
          role_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "company_role_calibrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_service_answer_examples: {
        Args: {
          audience_filter: string
          embedding_model_filter?: string
          match_count?: number
          min_score?: number
          query_embedding: string
        }
        Returns: {
          answer_example_text: string
          id: string
          score: number
          tags: string[]
          user_example_text: string
        }[]
      }
      match_talent_context_memories: {
        Args: {
          p_embedding_model?: string
          p_match_count?: number
          p_query_embedding: string
          p_talent_id: string
        }
        Returns: {
          collection: string
          content: string
          created_at: string
          id: number
          importance: number
          key: string
          label: string
          ref: number
          revision: number
          score: number
          source_refs: Json
          talent_id: string
          updated_at: string
        }[]
      }
      move_company_candidate_to_role_v1: {
        Args: {
          p_company_user_id: string
          p_company_workspace_id: string
          p_source_company_message_id: number
          p_source_role_id: string
          p_talent_id: string
          p_target_role_id: string
          p_target_stage_id: string
        }
        Returns: Json
      }
      move_talent_role_saved_stage_v1: {
        Args: {
          p_recommendation_id: string
          p_record_activity: boolean
          p_saved_stage: string
          p_talent_id: string
        }
        Returns: Json
      }
      mutate_talent_career_coaching_activity: {
        Args: {
          p_action: string
          p_activity_message_id?: number | null
          p_agenda?: Json
          p_channel?: string | null
          p_conversation_id: string
          p_expected_revision?: number | null
          p_idempotency_key?: string | null
          p_planned_minutes?: number | null
          p_suggested_minutes?: number | null
          p_topic?: string | null
          p_user_id: string
        }
        Returns: {
          content: string
          conversation_id: string | null
          created_at: string
          id: number
          is_mobile: boolean | null
          message_type: string
          payload: Json | null
          role: string
          thinking_logs: Json
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "talent_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mutate_talent_contexts: {
        Args: { p_changes: Json; p_request_id: string; p_talent_id: string }
        Returns: Json
      }
      pass_company_intro_v1: {
        Args: {
          p_company_user_id: string
          p_company_workspace_id: string
          p_intro_candidate_id: string
        }
        Returns: Json
      }
      pending_role_title_embeddings: {
        Args: { p_limit?: number }
        Returns: {
          name: string
          role_id: string
        }[]
      }
      present_company_agent_update_proposal_v1: {
        Args: {
          p_message_metadata?: Json
          p_message_type?: string
          p_model?: string
          p_payload: Json
          p_presentation_text: string
          p_preview: string
          p_scope_key: string
          p_slack_thread_id?: string
          p_source: string
          p_summary: string
          p_thinking_logs?: Json
          p_user_message_id: number
          p_workspace_id: string
        }
        Returns: Json
      }
      present_talent_internal_role_recommendation_for_review_v1: {
        Args: {
          p_context?: Json
          p_source_role_id: string
          p_talent_id: string
          p_target_role_id: string
        }
        Returns: Json
      }
      queue_crm_email_broadcast: {
        Args: { p_broadcast_id: string }
        Returns: number
      }
      queue_meeting_schedule_invitation_v1: {
        Args: {
          p_company_workspace_id: string
          p_expected_schedule_version: number
          p_invitation_expires_at: string
          p_invitation_snapshot: Json
          p_public_token_hash: string
          p_queue_payload: Json
          p_schedule_id: string
        }
        Returns: Json
      }
      read_company_candidate_delivery_v1: {
        Args: {
          p_company_workspace_id: string
          p_role_ids: string[]
          p_talent_ids: string[]
        }
        Returns: {
          available_in_app_at: string
          email_sent_at: string
          role_id: string
          talent_id: string
        }[]
      }
      read_company_talent_connections_v1: {
        Args: { p_limit?: number; p_query?: string; p_talent_id: string }
        Returns: Json
      }
      read_talent_contact_history_v1: {
        Args: {
          p_before_id?: string
          p_limit?: number
          p_query?: string
          p_refs?: string[]
          p_talent_id: string
        }
        Returns: Json
      }
      reassociate_company_workspace_db_v1: {
        Args: {
          p_changes: Json
          p_event_content: string
          p_expected_company_db_id: number
          p_target_company_db_id: number
          p_workspace_id: string
        }
        Returns: Json
      }
      reconcile_company_talent_requests_for_stage_v1: {
        Args: { p_role_id: string; p_talent_id: string }
        Returns: undefined
      }
      record_career_email_first_open_v1: {
        Args: { p_opened_at: string; p_resend_email_id: string }
        Returns: number
      }
      record_company_talent_response_v1: {
        Args: {
          p_request_id: string
          p_source_message_id: number
          p_talent_id: string
        }
        Returns: {
          approved_at: string | null
          company_workspace_id: string
          contact_kind: string
          contact_purpose: string
          created_at: string
          delivery_body: string | null
          delivery_subject: string | null
          document_id: string | null
          draft_revision: number
          expects_document: boolean
          expires_at: string
          id: string
          in_reply_to_company_talent_relay_id: string | null
          intent: string
          recommendation_id: string
          request_context: string
          response_disposition: string | null
          resume_stage: string | null
          role_id: string
          source_company_message_id: number
          talent_id: string
          talent_source_message_id: number | null
          updated_at: string
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "company_talent_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_company_talent_response_v2: {
        Args: {
          p_disposition?: string
          p_request_id: string
          p_source_message_id: number
          p_talent_id: string
        }
        Returns: {
          approved_at: string | null
          company_workspace_id: string
          contact_kind: string
          contact_purpose: string
          created_at: string
          delivery_body: string | null
          delivery_subject: string | null
          document_id: string | null
          draft_revision: number
          expects_document: boolean
          expires_at: string
          id: string
          in_reply_to_company_talent_relay_id: string | null
          intent: string
          recommendation_id: string
          request_context: string
          response_disposition: string | null
          resume_stage: string | null
          role_id: string
          source_company_message_id: number
          talent_id: string
          talent_source_message_id: number | null
          updated_at: string
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "company_talent_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_post_calibration_company_notice_v1: {
        Args: {
          p_company_message_id?: number
          p_error?: string
          p_org_status?: string
          p_run_id: string
          p_slack_message_ts?: string
          p_slack_status?: string
          p_status: string
        }
        Returns: Json
      }
      record_talent_network_referral_visit: {
        Args: { p_token: string; p_visitor_user_id?: string }
        Returns: {
          is_self_visit: boolean
          referrer_user_id: string
          token: string
          visit_count: number
        }[]
      }
      request_company_intro_v1: {
        Args: {
          p_company_appeal: string
          p_company_user_id: string
          p_company_workspace_id: string
          p_intro_candidate_id: string
          p_intro_recipient_emails: string[]
          p_next_stage_id: string
        }
        Returns: Json
      }
      request_company_intro_without_billing_v1: {
        Args: {
          p_company_appeal: string
          p_company_user_id: string
          p_company_workspace_id: string
          p_intro_candidate_id: string
          p_intro_recipient_emails: string[]
          p_next_stage_id: string
        }
        Returns: Json
      }
      request_talent_internal_role_reconsideration_v1: {
        Args: {
          p_context?: Json
          p_new_information: string
          p_role_id: string
          p_talent_id: string
        }
        Returns: Json
      }
      resolve_company_agent_update_proposal_v1: {
        Args: {
          p_action: string
          p_current_user_message_id: number
          p_proposal_id: string
          p_scope_key: string
          p_workspace_id: string
        }
        Returns: Json
      }
      retry_post_calibration_company_context_run_v1: {
        Args: { p_available_at: string; p_run_id: string }
        Returns: {
          available_at: string
          id: string
          result: Json
          role_id: string
          status: string
          trigger_reason: string
        }
        SetofOptions: {
          from: "*"
          to: "company_context_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reveal_candidate_profile: {
        Args: { target_candid_id: string }
        Returns: {
          already_revealed: boolean
          new_balance: number
        }[]
      }
      role_matching_slot_type_v1: {
        Args: { p_at?: string; p_role_id: string }
        Returns: string
      }
      rollback_talent_career_coaching_call_start: {
        Args: {
          p_activity_message_id: number
          p_conversation_id: string
          p_expected_revision: number
          p_user_id: string
        }
        Returns: {
          content: string
          conversation_id: string | null
          created_at: string
          id: number
          is_mobile: boolean | null
          message_type: string
          payload: Json | null
          role: string
          thinking_logs: Json
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "talent_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_external_fit_v2: {
        Args: { p_evaluator: string; p_rows: Json; p_talent_id: string }
        Returns: undefined
      }
      save_external_role_summaries_v2: {
        Args: { p_locale: string; p_rows: Json }
        Returns: {
          role_id: string
          summary: Json
        }[]
      }
      external_role_salary_satisfaction: {
        Args: { p_min: number | null; p_max: number | null; p_currency: string | null; p_period: string | null; p_target_krw: number | null }
        Returns: number
      }
      save_external_role_salary_predictions: {
        Args: { p_rows: Json }
        Returns: { role_id: string; salary_min: number; salary_max: number }[]
      }
      save_role_title_embeddings: { Args: { p_rows: Json }; Returns: number }
      schedule_company_talent_request_v1: {
        Args: {
          p_delivery_mode: string
          p_expected_revision: number
          p_request_id: string
          p_role_id: string
          p_talent_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      search_external_roles_v2: { Args: { p_sql: string }; Returns: Json[] }
      search_external_roles_filter_first: { Args: { p_sql: string }; Returns: Json[] }
      send_company_talent_contact_v1: {
        Args: {
          p_body: string
          p_recommendation_id: string
          p_request_context: string
          p_request_id: string
          p_role_id: string
          p_source_company_message_id: number
          p_subject: string
          p_talent_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      send_company_talent_contact_v2: {
        Args: {
          p_body: string
          p_contact_purpose: string
          p_recommendation_id: string
          p_request_context: string
          p_request_id: string
          p_role_id: string
          p_source_company_message_id: number
          p_subject: string
          p_talent_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      send_company_talent_relay_reply_v1: {
        Args: {
          p_body: string
          p_relay_id: string
          p_request_context: string
          p_source_company_message_id: number
          p_subject: string
          p_workspace_id: string
        }
        Returns: Json
      }
      send_company_talent_relay_reply_v2: {
        Args: {
          p_body: string
          p_contact_purpose: string
          p_relay_id: string
          p_request_context: string
          p_source_company_message_id: number
          p_subject: string
          p_workspace_id: string
        }
        Returns: Json
      }
      set_company_member_team_v1: {
        Args: {
          p_actor: string
          p_scope: string
          p_team?: string
          p_user: string
          p_workspace: string
        }
        Returns: undefined
      }
      set_company_member_teams_v2: {
        Args: {
          p_actor: string
          p_scope: string
          p_teams?: string[]
          p_user: string
          p_workspace: string
        }
        Returns: undefined
      }
      set_crm_email_broadcast_paused: {
        Args: { p_broadcast_id: string; p_paused: boolean }
        Returns: undefined
      }
      set_google_calendar_busy_block_blocking_v1: {
        Args: {
          p_busy_block_id: string
          p_company_user_id: string
          p_is_blocking: boolean
        }
        Returns: Json
      }
      set_slack_agent_worker_target_v1: {
        Args: {
          p_company_workspace_id?: string
          p_slack_channel_id?: string
          p_worker_target: string
        }
        Returns: Json
      }
      set_talent_internal_role_recommendation_before_company_share_v1: {
        Args: {
          p_accept?: boolean
          p_context?: Json
          p_source_role_id: string
          p_talent_id: string
          p_target_role_id: string
        }
        Returns: Json
      }
      set_timeout_and_execute_raw_sql: {
        Args: {
          limit_num: number
          offset_num: number
          page_idx: number
          sql_query: string
        }
        Returns: Json[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stop_internal_connection_from_confirmation_email: {
        Args: {
          p_contact_queue_id: string
          p_email_acceptance_confirmation: Json
          p_progress_metadata: Json
          p_progress_text: string
          p_recipient_response: Json
          p_recommendation_id: string
          p_role_id: string
          p_stopped_at: string
          p_talent_id: string
        }
        Returns: string
      }
      stop_run_worker: { Args: { target_run_id: string }; Returns: undefined }
      store_company_talent_relay_body_v1: {
        Args: { p_body: string; p_request_id: string }
        Returns: {
          approved_at: string | null
          company_workspace_id: string
          contact_kind: string
          contact_purpose: string
          created_at: string
          delivery_body: string | null
          delivery_subject: string | null
          document_id: string | null
          draft_revision: number
          expects_document: boolean
          expires_at: string
          id: string
          in_reply_to_company_talent_relay_id: string | null
          intent: string
          recommendation_id: string
          request_context: string
          response_disposition: string | null
          resume_stage: string | null
          role_id: string
          source_company_message_id: number
          talent_id: string
          talent_source_message_id: number | null
          updated_at: string
          workflow_status: string
        }
        SetofOptions: {
          from: "*"
          to: "company_talent_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      store_company_talent_relay_body_v2: {
        Args: { p_body: string; p_relay_id: string }
        Returns: Json
      }
      submit_meeting_schedule_options_v1: {
        Args: {
          p_candidate_options: Json
          p_confirmed_end_at: string
          p_confirmed_start_at: string
          p_expected_availability_version: number
          p_public_token_hash: string
          p_selection_snapshot: Json
        }
        Returns: Json
      }
      summarize_company_contact_index_v1: {
        Args: {
          p_as_of: string
          p_company_workspace_id: string
          p_window_start: string
        }
        Returns: {
          all_response_contact_count: number
          all_sent_count: number
          as_of: string
          recent_active_draft_count: number
          recent_response_contact_count: number
          recent_sent_count: number
          window_start: string
        }[]
      }
      summarize_company_team_contacts_v1: {
        Args: {
          p_actor: string
          p_as_of: string
          p_company_workspace_id: string
          p_window_start: string
        }
        Returns: Json
      }
      talent_first_pair_is_available_v1: {
        Args: { p_role_id: string; p_talent_id: string }
        Returns: boolean
      }
      talent_internal_role_is_candidate_visible_v1: {
        Args: {
          p_fit: Database["public"]["Tables"]["talent_opportunity_fit"]["Row"]
        }
        Returns: boolean
      }
      talent_internal_role_priority_review_is_recommendable_v1: {
        Args: {
          p_fit: Database["public"]["Tables"]["talent_opportunity_fit"]["Row"]
        }
        Returns: boolean
      }
      talent_internal_role_reconsideration_is_pending_v1: {
        Args: {
          p_fit: Database["public"]["Tables"]["talent_opportunity_fit"]["Row"]
        }
        Returns: boolean
      }
      try_enqueue_talent_behavior_context_change: {
        Args: {
          p_change_summary?: string
          p_changed_fields: string[]
          p_idempotency_key: string
          p_occurred_at: string
          p_operation: string
          p_source_id: string
          p_source_type: string
          p_talent_id: string
        }
        Returns: undefined
      }
      update_company_internal_role_criteria_v1: {
        Args: {
          p_criteria: Json
          p_event_content: string
          p_expected_criteria: Json
          p_role_id: string
          p_source: string
          p_workspace_id: string
        }
        Returns: Json
      }
      update_meeting_schedule_draft_v1: {
        Args: {
          p_additional_message: Json
          p_company_attendees: Json
          p_company_workspace_id: string
          p_duration_minutes: number
          p_expected_version: number
          p_meeting_config_snapshot: Json
          p_schedule_id: string
          p_title: string
        }
        Returns: Json
      }
      update_repo_ids: { Args: never; Returns: undefined }
      update_talent_role_feedback_v1: {
        Args: {
          p_feedback: string
          p_feedback_at: string
          p_feedback_reason: string
          p_recommendation_id: string
          p_saved_stage: string
          p_talent_id: string
        }
        Returns: Json
      }
      update_talent_role_feedback_v2: {
        Args: {
          p_expected_updated_at?: string
          p_feedback: string
          p_feedback_at: string
          p_feedback_reason: string
          p_recommendation_id: string
          p_saved_stage: string
          p_source?: string
          p_talent_id: string
        }
        Returns: Json
      }
      upsert_google_calendar_busy_blocks_v1: {
        Args: {
          p_blocks: Json
          p_company_user_id: string
          p_connected_account_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: Json
      }
      upsert_talent_document_by_hash_v1: {
        Args: {
          p_content_sha256: string
          p_content_type: string
          p_file_name: string
          p_kind: string
          p_size_bytes: number
          p_storage_path: string
          p_talent_id: string
        }
        Returns: Json
      }
      validate_company_data_change_value_strict_v1: {
        Args: { p_key: string; p_source: string; p_value: Json }
        Returns: undefined
      }
      validate_company_data_change_value_v1: {
        Args: { p_key: string; p_source: string; p_value: Json }
        Returns: undefined
      }
      vc_identity_is_operational: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      withdraw_candidate_priority_review_v1: {
        Args: { p_role_id: string; p_source?: Json; p_talent_id: string }
        Returns: Json
      }
      workspace_billing_agent_active_v1:
        | {
            Args: {
              p_agent: Database["public"]["Views"]["company_workspace_agents"]["Row"]
              p_at: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_agent: Database["public"]["Tables"]["company_workspace_slots"]["Row"]
              p_at: string
            }
            Returns: boolean
          }
      workspace_billing_assign_slot_v1: {
        Args: {
          p_revision: number
          p_role: string
          p_slot: string
          p_workspace: string
        }
        Returns: undefined
      }
      workspace_billing_assign_v1: {
        Args: {
          p_agent: string
          p_revision: number
          p_role: string
          p_workspace: string
        }
        Returns: undefined
      }
      workspace_billing_checkout_v1: {
        Args: {
          p_customer?: string
          p_key?: string
          p_session?: string
          p_workspace: string
        }
        Returns: Json
      }
      workspace_billing_checkout_v2: {
        Args: {
          p_customer?: string
          p_intent: Json
          p_key?: string
          p_session?: string
          p_workspace: string
        }
        Returns: Json
      }
      workspace_billing_claim_action_v1: {
        Args: { p_event: string; p_token: string }
        Returns: boolean
      }
      workspace_billing_commit_connection_v1: {
        Args: {
          p_event: string
          p_next_tag: string
          p_progress: Json
          p_stage: string
          p_tags: string[]
          p_token: string
        }
        Returns: undefined
      }
      workspace_billing_complete_action_v1: {
        Args: { p_event: string; p_token: string }
        Returns: boolean
      }
      workspace_billing_debit_v1: {
        Args: {
          p_action: string
          p_actor: string
          p_complete?: boolean
          p_key: string
          p_payload?: Json
          p_role: string
          p_talent: string
          p_workspace: string
        }
        Returns: string
      }
      workspace_billing_enroll_v1: {
        Args: { p_keep_role?: string; p_model: string; p_workspace: string }
        Returns: undefined
      }
      workspace_billing_expire_due_v1: {
        Args: { p_limit?: number }
        Returns: number
      }
      workspace_billing_finish_change_v1: {
        Args: { p_change: string; p_period_end: string; p_workspace: string }
        Returns: boolean
      }
      workspace_billing_free_period_v1: {
        Args: { p_at: string; p_workspace: string }
        Returns: string
      }
      workspace_billing_grant_slots_v1: {
        Args: {
          p_granted_by: string
          p_quantity: number
          p_reason: string
          p_request: string
          p_workspace: string
        }
        Returns: Json
      }
      workspace_billing_prepare_change_v1: {
        Args: {
          p_cancel: boolean
          p_item: string
          p_period_end: string
          p_revision: number
          p_slot: string
          p_workspace: string
        }
        Returns: Json
      }
      workspace_billing_reconcile_at_v1: {
        Args: { p_at: string; p_workspace: string }
        Returns: undefined
      }
      workspace_billing_reconcile_v1: {
        Args: { p_workspace: string }
        Returns: undefined
      }
      workspace_billing_release_action_v1: {
        Args: { p_event: string; p_token: string }
        Returns: undefined
      }
      workspace_billing_slot_active_v1: {
        Args: {
          p_at: string
          p_slot: Database["public"]["Tables"]["company_workspace_slots"]["Row"]
        }
        Returns: boolean
      }
      workspace_billing_summary_v1: {
        Args: { p_workspace: string }
        Returns: Json
      }
      workspace_billing_summary_v2: {
        Args: { p_workspace: string }
        Returns: Json
      }
      workspace_billing_sync_agent_v1: {
        Args: {
          p_expected_revision: number
          p_periods?: Json
          p_snapshot: Json
          p_subscription: string
          p_workspace: string
        }
        Returns: boolean
      }
      workspace_billing_sync_slot_v1: {
        Args: {
          p_expected_revision: number
          p_periods?: Json
          p_snapshot: Json
          p_subscription: string
          p_workspace: string
        }
        Returns: boolean
      }
      workspace_billing_sync_slots_v1: {
        Args: {
          p_expected_revisions: Json
          p_periods?: Json
          p_snapshot: Json
          p_subscription: string
          p_workspace: string
        }
        Returns: boolean
      }
      workspace_signup_begin_v1: {
        Args: {
          p_create?: boolean
          p_domain: string
          p_user: string
          p_review_email: string
          p_review_domain: string | null
        }
        Returns: Json
      }
      workspace_create_additional_v1: {
        Args: {
          p_review_email: string
          p_review_domain: string | null
          p_user: string
          p_source_workspace: string
          p_domain: string
          p_homepage: string
          p_request: string
          p_internal_access?: boolean
        }
        Returns: Json
      }
      workspace_signup_update_v1: {
        Args: {
          p_action: string
          p_user: string
          p_values?: Json
          p_workspace: string
        }
        Returns: Json
      }
      write_application_activity: {
        Args: {
          p_conversation_id: string
          p_key?: string
          p_message_id?: number
          p_offer_id?: number
          p_operation: string
          p_payload?: Json
          p_revision?: number
          p_user_id: string
        }
        Returns: Json
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
