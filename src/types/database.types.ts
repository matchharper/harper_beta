export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      automation: {
        Row: {
          created_at: string;
          id: string;
          is_deleted: boolean | null;
          is_in_progress: boolean | null;
          last_updated_at: string | null;
          title: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_deleted?: boolean | null;
          is_in_progress?: boolean | null;
          last_updated_at?: string | null;
          title?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_deleted?: boolean | null;
          is_in_progress?: boolean | null;
          last_updated_at?: string | null;
          title?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "automation_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      automation_results: {
        Row: {
          automation_id: string | null;
          candid_id: string | null;
          concerns: string | null;
          created_at: string;
          id: number;
          text: string | null;
          user_id: string | null;
        };
        Insert: {
          automation_id?: string | null;
          candid_id?: string | null;
          concerns?: string | null;
          created_at?: string;
          id?: number;
          text?: string | null;
          user_id?: string | null;
        };
        Update: {
          automation_id?: string | null;
          candid_id?: string | null;
          concerns?: string | null;
          created_at?: string;
          id?: number;
          text?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "automation_results_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automation";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_results_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_results_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      billing_sessions: {
        Row: {
          amount_krw: number;
          billing: string;
          created_at: string;
          expires_at: string;
          id: number;
          payment_id: number | null;
          plan_id: string;
          plan_key: string;
          reason: string;
          session_token: string;
          status: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          amount_krw: number;
          billing: string;
          created_at?: string;
          expires_at: string;
          id?: number;
          payment_id?: number | null;
          plan_id: string;
          plan_key: string;
          reason: string;
          session_token: string;
          status?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          amount_krw?: number;
          billing?: string;
          created_at?: string;
          expires_at?: string;
          id?: number;
          payment_id?: number | null;
          plan_id?: string;
          plan_key?: string;
          reason?: string;
          session_token?: string;
          status?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_sessions_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_sessions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["plan_id"];
          },
          {
            foreignKeyName: "billing_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      bookmark_folder: {
        Row: {
          created_at: string;
          id: number;
          is_default: boolean;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          is_default?: boolean;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          is_default?: boolean;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmark_folder_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      bookmark_folder_item: {
        Row: {
          candid_id: string;
          created_at: string;
          folder_id: number;
          id: number;
          user_id: string;
        };
        Insert: {
          candid_id: string;
          created_at?: string;
          folder_id: number;
          id?: number;
          user_id: string;
        };
        Update: {
          candid_id?: string;
          created_at?: string;
          folder_id?: number;
          id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmark_folder_item_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "bookmark_folder";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookmark_folder_item_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      bookmark_folder_share: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string | null;
          folder_id: number;
          id: string;
          revoked_at: string | null;
          token: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at?: string | null;
          folder_id: number;
          id?: string;
          revoked_at?: string | null;
          token: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string | null;
          folder_id?: number;
          id?: string;
          revoked_at?: string | null;
          token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmark_folder_share_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "bookmark_folder_share_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "bookmark_folder";
            referencedColumns: ["id"];
          },
        ];
      };
      bookmark_folder_share_note: {
        Row: {
          candid_id: string;
          created_at: string;
          folder_id: number;
          id: number;
          memo: string;
          updated_at: string;
          viewer_key: string;
          viewer_name: string;
        };
        Insert: {
          candid_id: string;
          created_at?: string;
          folder_id: number;
          id?: number;
          memo: string;
          updated_at?: string;
          viewer_key: string;
          viewer_name?: string;
        };
        Update: {
          candid_id?: string;
          created_at?: string;
          folder_id?: number;
          id?: number;
          memo?: string;
          updated_at?: string;
          viewer_key?: string;
          viewer_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmark_folder_share_note_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookmark_folder_share_note_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "bookmark_folder";
            referencedColumns: ["id"];
          },
        ];
      };
      candid: {
        Row: {
          bio: string | null;
          created_at: string;
          email: string | null;
          fts: unknown;
          headline: string | null;
          id: string;
          is_duplicated_old: boolean;
          is_korean: boolean;
          is_linkedin_deprecated: boolean;
          is_selective: boolean;
          last_updated_at: string | null;
          linkedin_url: string | null;
          links: string[] | null;
          location: string | null;
          name: string | null;
          profile_picture: string | null;
          summary: string | null;
          total_exp_months: number | null;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          email?: string | null;
          fts?: unknown;
          headline?: string | null;
          id?: string;
          is_duplicated_old?: boolean;
          is_korean?: boolean;
          is_linkedin_deprecated?: boolean;
          is_selective?: boolean;
          last_updated_at?: string | null;
          linkedin_url?: string | null;
          links?: string[] | null;
          location?: string | null;
          name?: string | null;
          profile_picture?: string | null;
          summary?: string | null;
          total_exp_months?: number | null;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          email?: string | null;
          fts?: unknown;
          headline?: string | null;
          id?: string;
          is_duplicated_old?: boolean;
          is_korean?: boolean;
          is_linkedin_deprecated?: boolean;
          is_selective?: boolean;
          last_updated_at?: string | null;
          linkedin_url?: string | null;
          links?: string[] | null;
          location?: string | null;
          name?: string | null;
          profile_picture?: string | null;
          summary?: string | null;
          total_exp_months?: number | null;
        };
        Relationships: [];
      };
      candid_id_map: {
        Row: {
          candid_id: string;
          created_at: string;
          identifier: string;
          is_current: boolean;
          is_duplicated: boolean;
          last_updated_at: string;
        };
        Insert: {
          candid_id: string;
          created_at?: string;
          identifier: string;
          is_current?: boolean;
          is_duplicated?: boolean;
          last_updated_at?: string;
        };
        Update: {
          candid_id?: string;
          created_at?: string;
          identifier?: string;
          is_current?: boolean;
          is_duplicated?: boolean;
          last_updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candid_id_map_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
        ];
      };
      candid_links_index: {
        Row: {
          candid_id: string;
          github_links: string | null;
          linkedin_links: string | null;
          scholar_links: string | null;
          updated_at: string | null;
        };
        Insert: {
          candid_id: string;
          github_links?: string | null;
          linkedin_links?: string | null;
          scholar_links?: string | null;
          updated_at?: string | null;
        };
        Update: {
          candid_id?: string;
          github_links?: string | null;
          linkedin_links?: string | null;
          scholar_links?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "candid_links_index_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: true;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_mark: {
        Row: {
          candid_id: string;
          created_at: string;
          id: number;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          candid_id: string;
          created_at?: string;
          id?: number;
          status: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          candid_id?: string;
          created_at?: string;
          id?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_mark_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "candidate_mark_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      career_email_messages: {
        Row: {
          body_text: string | null;
          created_at: string;
          created_by: string | null;
          direction: string;
          from_email: string | null;
          id: string;
          inbound_event_id: string | null;
          mail_type: string;
          metadata: Json;
          occurred_at: string;
          reply_job_id: string | null;
          status: string;
          subject: string | null;
          talent_id: string;
          talent_message_id: number | null;
          to_email: string | null;
        };
        Insert: {
          body_text?: string | null;
          created_at?: string;
          created_by?: string | null;
          direction: string;
          from_email?: string | null;
          id?: string;
          inbound_event_id?: string | null;
          mail_type: string;
          metadata?: Json;
          occurred_at?: string;
          reply_job_id?: string | null;
          status?: string;
          subject?: string | null;
          talent_id: string;
          talent_message_id?: number | null;
          to_email?: string | null;
        };
        Update: {
          body_text?: string | null;
          created_at?: string;
          created_by?: string | null;
          direction?: string;
          from_email?: string | null;
          id?: string;
          inbound_event_id?: string | null;
          mail_type?: string;
          metadata?: Json;
          occurred_at?: string;
          reply_job_id?: string | null;
          status?: string;
          subject?: string | null;
          talent_id?: string;
          talent_message_id?: number | null;
          to_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "career_email_messages_inbound_event_id_fkey";
            columns: ["inbound_event_id"];
            isOneToOne: false;
            referencedRelation: "email_inbound_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "career_email_messages_reply_job_id_fkey";
            columns: ["reply_job_id"];
            isOneToOne: false;
            referencedRelation: "email_reply_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "career_email_messages_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "career_email_messages_talent_message_id_fkey";
            columns: ["talent_message_id"];
            isOneToOne: false;
            referencedRelation: "talent_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      career_email_onboarding_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          lead_id: string | null;
          local_id: string | null;
          metadata: Json;
          normalized_email_hash: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          lead_id?: string | null;
          local_id?: string | null;
          metadata?: Json;
          normalized_email_hash?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          lead_id?: string | null;
          local_id?: string | null;
          metadata?: Json;
          normalized_email_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "career_email_onboarding_events_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "career_email_onboarding_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      career_email_onboarding_leads: {
        Row: {
          abtest_type: string;
          calendar_cta_sent_at: string | null;
          calendar_url: string | null;
          conversation_id: string | null;
          converted_at: string | null;
          converted_user_id: string | null;
          country_lang: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          first_email_resend_id: string | null;
          first_email_sent_at: string | null;
          first_inbound_at: string | null;
          id: string;
          is_mobile: boolean | null;
          last_error: string | null;
          local_id: string | null;
          metadata: Json;
          normalized_email: string;
          page_path: string | null;
          paused_at: string | null;
          profile_ingested_at: string | null;
          profile_links: string[];
          profile_received_at: string | null;
          reply_alias: string | null;
          resume_text: string | null;
          review_attempts: number;
          review_email_resend_id: string | null;
          review_locked_at: string | null;
          review_locked_by: string | null;
          source: string | null;
          status: string;
          step: string;
          talent_id: string | null;
          updated_at: string;
          variant: string;
        };
        Insert: {
          abtest_type?: string;
          calendar_cta_sent_at?: string | null;
          calendar_url?: string | null;
          conversation_id?: string | null;
          converted_at?: string | null;
          converted_user_id?: string | null;
          country_lang?: string | null;
          created_at?: string;
          display_name?: string | null;
          email: string;
          first_email_resend_id?: string | null;
          first_email_sent_at?: string | null;
          first_inbound_at?: string | null;
          id?: string;
          is_mobile?: boolean | null;
          last_error?: string | null;
          local_id?: string | null;
          metadata?: Json;
          normalized_email: string;
          page_path?: string | null;
          paused_at?: string | null;
          profile_ingested_at?: string | null;
          profile_links?: string[];
          profile_received_at?: string | null;
          reply_alias?: string | null;
          resume_text?: string | null;
          review_attempts?: number;
          review_email_resend_id?: string | null;
          review_locked_at?: string | null;
          review_locked_by?: string | null;
          source?: string | null;
          status?: string;
          step?: string;
          talent_id?: string | null;
          updated_at?: string;
          variant?: string;
        };
        Update: {
          abtest_type?: string;
          calendar_cta_sent_at?: string | null;
          calendar_url?: string | null;
          conversation_id?: string | null;
          converted_at?: string | null;
          converted_user_id?: string | null;
          country_lang?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          first_email_resend_id?: string | null;
          first_email_sent_at?: string | null;
          first_inbound_at?: string | null;
          id?: string;
          is_mobile?: boolean | null;
          last_error?: string | null;
          local_id?: string | null;
          metadata?: Json;
          normalized_email?: string;
          page_path?: string | null;
          paused_at?: string | null;
          profile_ingested_at?: string | null;
          profile_links?: string[];
          profile_received_at?: string | null;
          reply_alias?: string | null;
          resume_text?: string | null;
          review_attempts?: number;
          review_email_resend_id?: string | null;
          review_locked_at?: string | null;
          review_locked_by?: string | null;
          source?: string | null;
          status?: string;
          step?: string;
          talent_id?: string | null;
          updated_at?: string;
          variant?: string;
        };
        Relationships: [
          {
            foreignKeyName: "career_email_onboarding_leads_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "career_email_onboarding_leads_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      career_utm_sources: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          source: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          source: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_code: {
        Row: {
          code: string;
          company: string | null;
          count: number;
          created_at: string;
          credit: number;
          domain: string | null;
          id: string;
          limit: number;
          text: string | null;
        };
        Insert: {
          code?: string;
          company?: string | null;
          count?: number;
          created_at?: string;
          credit?: number;
          domain?: string | null;
          id?: string;
          limit?: number;
          text?: string | null;
        };
        Update: {
          code?: string;
          company?: string | null;
          count?: number;
          created_at?: string;
          credit?: number;
          domain?: string | null;
          id?: string;
          limit?: number;
          text?: string | null;
        };
        Relationships: [];
      };
      company_agent_update_proposals: {
        Row: {
          applied_at: string | null;
          created_at: string;
          created_by_user_message_id: number | null;
          expires_at: string;
          id: string;
          message_metadata: Json;
          message_model: string | null;
          message_thinking_logs: Json;
          message_type: string;
          payload: Json | null;
          presentation_text: string | null;
          presented_message_id: number | null;
          preview: string | null;
          scope_key: string;
          slack_thread_id: string | null;
          source: string;
          status: string;
          summary: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          applied_at?: string | null;
          created_at?: string;
          created_by_user_message_id?: number | null;
          expires_at: string;
          id?: string;
          message_metadata?: Json;
          message_model?: string | null;
          message_thinking_logs?: Json;
          message_type: string;
          payload?: Json | null;
          presentation_text?: string | null;
          presented_message_id?: number | null;
          preview?: string | null;
          scope_key: string;
          slack_thread_id?: string | null;
          source: string;
          status?: string;
          summary: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          applied_at?: string | null;
          created_at?: string;
          created_by_user_message_id?: number | null;
          expires_at?: string;
          id?: string;
          message_metadata?: Json;
          message_model?: string | null;
          message_thinking_logs?: Json;
          message_type?: string;
          payload?: Json | null;
          presentation_text?: string | null;
          presented_message_id?: number | null;
          preview?: string | null;
          scope_key?: string;
          slack_thread_id?: string | null;
          source?: string;
          status?: string;
          summary?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_agent_update_proposals_created_by_user_message_id_fkey";
            columns: ["created_by_user_message_id"];
            isOneToOne: false;
            referencedRelation: "company_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_agent_update_proposals_presented_message_id_fkey";
            columns: ["presented_message_id"];
            isOneToOne: false;
            referencedRelation: "company_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_agent_update_proposals_slack_thread_id_fkey";
            columns: ["slack_thread_id"];
            isOneToOne: false;
            referencedRelation: "company_slack_threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_agent_update_proposals_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      company_conversation_summaries: {
        Row: {
          company_workspace_id: string;
          content: string;
          conversation_id: string;
          created_at: string;
          id: number;
          message_count: number;
          metadata: Json;
          model: string | null;
          role_id: string | null;
          source_end_message_id: number;
          source_start_message_id: number;
        };
        Insert: {
          company_workspace_id: string;
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: number;
          message_count: number;
          metadata?: Json;
          model?: string | null;
          role_id?: string | null;
          source_end_message_id: number;
          source_start_message_id: number;
        };
        Update: {
          company_workspace_id?: string;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: number;
          message_count?: number;
          metadata?: Json;
          model?: string | null;
          role_id?: string | null;
          source_end_message_id?: number;
          source_start_message_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "company_conversation_summaries_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_conversation_summaries_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_conversation_summaries_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "company_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_conversation_summaries_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      company_conversations: {
        Row: {
          company_workspace_id: string;
          created_at: string;
          id: string;
          last_message_at: string | null;
          last_message_id: number | null;
          metadata: Json;
          role_id: string | null;
          summary_cursor_message_id: number | null;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          company_workspace_id: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          last_message_id?: number | null;
          metadata?: Json;
          role_id?: string | null;
          summary_cursor_message_id?: number | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          company_workspace_id?: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          last_message_id?: number | null;
          metadata?: Json;
          role_id?: string | null;
          summary_cursor_message_id?: number | null;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_conversations_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_conversations_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_conversations_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      company_data: {
        Row: {
          company_workspace_id: string;
          confidence: number | null;
          created_at: string;
          last_funding_round_description: string | null;
          last_funding_stage: string | null;
          main_investors: string | null;
          search_query: string | null;
          searched_at: string;
          source_payload: Json | null;
          total_funding_raised: string | null;
          updated_at: string;
        };
        Insert: {
          company_workspace_id: string;
          confidence?: number | null;
          created_at?: string;
          last_funding_round_description?: string | null;
          last_funding_stage?: string | null;
          main_investors?: string | null;
          search_query?: string | null;
          searched_at?: string;
          source_payload?: Json | null;
          total_funding_raised?: string | null;
          updated_at?: string;
        };
        Update: {
          company_workspace_id?: string;
          confidence?: number | null;
          created_at?: string;
          last_funding_round_description?: string | null;
          last_funding_stage?: string | null;
          main_investors?: string | null;
          search_query?: string | null;
          searched_at?: string;
          source_payload?: Json | null;
          total_funding_raised?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_data_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: true;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_data_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: true;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      company_db: {
        Row: {
          crunchbase_information: Json | null;
          description: string | null;
          employee_count_range: Json | null;
          founded_year: number | null;
          funding_url: string | null;
          harvestapi_information: Json | null;
          id: number;
          investors: string | null;
          last_crunchbase_updated_at: string | null;
          last_harvestapi_updated_at: string | null;
          last_updated_at: string;
          linkedin_company_id: number | null;
          linkedin_url: string | null;
          location: string | null;
          logo: string | null;
          name: string | null;
          related_links: string[] | null;
          short_description: string | null;
          specialities: string;
          website_url: string | null;
        };
        Insert: {
          crunchbase_information?: Json | null;
          description?: string | null;
          employee_count_range?: Json | null;
          founded_year?: number | null;
          funding_url?: string | null;
          harvestapi_information?: Json | null;
          id?: number;
          investors?: string | null;
          last_crunchbase_updated_at?: string | null;
          last_harvestapi_updated_at?: string | null;
          last_updated_at?: string;
          linkedin_company_id?: number | null;
          linkedin_url?: string | null;
          location?: string | null;
          logo?: string | null;
          name?: string | null;
          related_links?: string[] | null;
          short_description?: string | null;
          specialities?: string;
          website_url?: string | null;
        };
        Update: {
          crunchbase_information?: Json | null;
          description?: string | null;
          employee_count_range?: Json | null;
          founded_year?: number | null;
          funding_url?: string | null;
          harvestapi_information?: Json | null;
          id?: number;
          investors?: string | null;
          last_crunchbase_updated_at?: string | null;
          last_harvestapi_updated_at?: string | null;
          last_updated_at?: string;
          linkedin_company_id?: number | null;
          linkedin_url?: string | null;
          location?: string | null;
          logo?: string | null;
          name?: string | null;
          related_links?: string[] | null;
          short_description?: string | null;
          specialities?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      company_events: {
        Row: {
          content: string;
          created_at: string;
          id: number;
          source: string;
          workspace_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: never;
          source: string;
          workspace_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: never;
          source?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      company_internal_roles: {
        Row: {
          considerations: Json;
          created_at: string;
          is_auto: boolean;
          is_require_linkedin: boolean | null;
          is_require_resume: boolean | null;
          questions: Json | null;
          request: string | null;
          role_id: string;
          updated_at: string;
        };
        Insert: {
          considerations?: Json;
          created_at?: string;
          is_auto?: boolean;
          is_require_linkedin?: boolean | null;
          is_require_resume?: boolean | null;
          questions?: Json | null;
          request?: string | null;
          role_id: string;
          updated_at?: string;
        };
        Update: {
          considerations?: Json;
          created_at?: string;
          is_auto?: boolean;
          is_require_linkedin?: boolean | null;
          is_require_resume?: boolean | null;
          questions?: Json | null;
          request?: string | null;
          role_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_internal_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: true;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      company_messages: {
        Row: {
          company_user_id: string | null;
          company_workspace_id: string;
          content: string;
          conversation_id: string;
          created_at: string;
          id: number;
          mentions: Json;
          message_type: string;
          metadata: Json;
          model: string | null;
          role: string;
          role_id: string | null;
          slack_message_ts: string | null;
          slack_thread_id: string | null;
          slack_user_id: string | null;
          status: string;
          thinking_logs: Json;
        };
        Insert: {
          company_user_id?: string | null;
          company_workspace_id: string;
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: number;
          mentions?: Json;
          message_type?: string;
          metadata?: Json;
          model?: string | null;
          role: string;
          role_id?: string | null;
          slack_message_ts?: string | null;
          slack_thread_id?: string | null;
          slack_user_id?: string | null;
          status?: string;
          thinking_logs?: Json;
        };
        Update: {
          company_user_id?: string | null;
          company_workspace_id?: string;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: number;
          mentions?: Json;
          message_type?: string;
          metadata?: Json;
          model?: string | null;
          role?: string;
          role_id?: string | null;
          slack_message_ts?: string | null;
          slack_thread_id?: string | null;
          slack_user_id?: string | null;
          status?: string;
          thinking_logs?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "company_messages_company_user_id_fkey";
            columns: ["company_user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "company_messages_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_messages_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "company_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_messages_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "company_messages_slack_thread_id_fkey";
            columns: ["slack_thread_id"];
            isOneToOne: false;
            referencedRelation: "company_slack_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      company_memories: {
        Row: {
          company_workspace_id: string;
          content: string;
          created_at: string;
          id: string;
          role_id: string | null;
          updated_at: string;
        };
        Insert: {
          company_workspace_id: string;
          content: string;
          created_at?: string;
          id?: string;
          role_id?: string | null;
          updated_at?: string;
        };
        Update: {
          company_workspace_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          role_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_memories_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_memories_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      company_role_liveness: {
        Row: {
          closed_detected_at: string | null;
          consecutive_missing_count: number;
          deadline_type: string | null;
          last_alive_at: string | null;
          last_detail_checked_at: string | null;
          last_error: string | null;
          last_seen_at: string | null;
          next_check_at: string | null;
          role_id: string;
          source_expires_at: string | null;
          source_external_id: string;
          source_provider: string;
          source_status: string | null;
          updated_at: string;
        };
        Insert: {
          closed_detected_at?: string | null;
          consecutive_missing_count?: number;
          deadline_type?: string | null;
          last_alive_at?: string | null;
          last_detail_checked_at?: string | null;
          last_error?: string | null;
          last_seen_at?: string | null;
          next_check_at?: string | null;
          role_id: string;
          source_expires_at?: string | null;
          source_external_id: string;
          source_provider: string;
          source_status?: string | null;
          updated_at?: string;
        };
        Update: {
          closed_detected_at?: string | null;
          consecutive_missing_count?: number;
          deadline_type?: string | null;
          last_alive_at?: string | null;
          last_detail_checked_at?: string | null;
          last_error?: string | null;
          last_seen_at?: string | null;
          next_check_at?: string | null;
          role_id?: string;
          source_expires_at?: string | null;
          source_external_id?: string;
          source_provider?: string;
          source_status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_role_liveness_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: true;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      company_roles: {
        Row: {
          company_workspace_id: string;
          created_at: string;
          description: string | null;
          description_summary: string | null;
          expired_at: string | null;
          expires_at: string | null;
          external_jd_url: string | null;
          information: Json | null;
          is_expired: boolean;
          location_text: string | null;
          name: string;
          opportunity_search_tsv: unknown;
          posted_at: string | null;
          priority: number | null;
          request: string | null;
          role_id: string;
          salary_currency: string | null;
          salary_max: number | null;
          salary_min: number | null;
          salary_period: string | null;
          salary_range: string | null;
          seniority_level: string | null;
          source_job_id: string | null;
          source_provider: string | null;
          source_type: string;
          status: string;
          summary: Json;
          type: string[];
          updated_at: string;
          work_mode: string | null;
        };
        Insert: {
          company_workspace_id: string;
          created_at?: string;
          description?: string | null;
          description_summary?: string | null;
          expired_at?: string | null;
          expires_at?: string | null;
          external_jd_url?: string | null;
          information?: Json | null;
          is_expired?: boolean;
          location_text?: string | null;
          name: string;
          opportunity_search_tsv?: unknown;
          posted_at?: string | null;
          priority?: number | null;
          request?: string | null;
          role_id?: string;
          salary_currency?: string | null;
          salary_max?: number | null;
          salary_min?: number | null;
          salary_period?: string | null;
          salary_range?: string | null;
          seniority_level?: string | null;
          source_job_id?: string | null;
          source_provider?: string | null;
          source_type?: string;
          status?: string;
          summary?: Json;
          type?: string[];
          updated_at?: string;
          work_mode?: string | null;
        };
        Update: {
          company_workspace_id?: string;
          created_at?: string;
          description?: string | null;
          description_summary?: string | null;
          expired_at?: string | null;
          expires_at?: string | null;
          external_jd_url?: string | null;
          information?: Json | null;
          is_expired?: boolean;
          location_text?: string | null;
          name?: string;
          opportunity_search_tsv?: unknown;
          posted_at?: string | null;
          priority?: number | null;
          request?: string | null;
          role_id?: string;
          salary_currency?: string | null;
          salary_max?: number | null;
          salary_min?: number | null;
          salary_period?: string | null;
          salary_range?: string | null;
          seniority_level?: string | null;
          source_job_id?: string | null;
          source_provider?: string | null;
          source_type?: string;
          status?: string;
          summary?: Json;
          type?: string[];
          updated_at?: string;
          work_mode?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_roles_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_roles_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      company_roles_archive: {
        Row: {
          archived_at: string;
          company_workspace_id: string;
          created_at: string;
          expired_at: string | null;
          expires_at: string | null;
          external_jd_url: string | null;
          name: string;
          posted_at: string | null;
          role_id: string;
          source_job_id: string | null;
          source_provider: string | null;
          updated_at: string;
        };
        Insert: {
          archived_at?: string;
          company_workspace_id: string;
          created_at: string;
          expired_at?: string | null;
          expires_at?: string | null;
          external_jd_url?: string | null;
          name: string;
          posted_at?: string | null;
          role_id: string;
          source_job_id?: string | null;
          source_provider?: string | null;
          updated_at: string;
        };
        Update: {
          archived_at?: string;
          company_workspace_id?: string;
          created_at?: string;
          expired_at?: string | null;
          expires_at?: string | null;
          external_jd_url?: string | null;
          name?: string;
          posted_at?: string | null;
          role_id?: string;
          source_job_id?: string | null;
          source_provider?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_slack_channels: {
        Row: {
          company_workspace_id: string;
          created_at: string;
          default_role_id: string | null;
          id: string;
          is_enabled: boolean;
          is_private: boolean;
          notify_candidate_accepted: boolean;
          notify_candidate_rejected: boolean;
          notify_member_joined: boolean;
          reply_to_harper_threads: boolean;
          respond_to_mentions: boolean;
          slack_channel_id: string;
          slack_channel_name: string | null;
          slack_team_id: string;
          updated_at: string;
          worker_target: string;
        };
        Insert: {
          company_workspace_id: string;
          created_at?: string;
          default_role_id?: string | null;
          id?: string;
          is_enabled?: boolean;
          is_private?: boolean;
          notify_candidate_accepted?: boolean;
          notify_candidate_rejected?: boolean;
          notify_member_joined?: boolean;
          reply_to_harper_threads?: boolean;
          respond_to_mentions?: boolean;
          slack_channel_id: string;
          slack_channel_name?: string | null;
          slack_team_id: string;
          updated_at?: string;
          worker_target?: string;
        };
        Update: {
          company_workspace_id?: string;
          created_at?: string;
          default_role_id?: string | null;
          id?: string;
          is_enabled?: boolean;
          is_private?: boolean;
          notify_candidate_accepted?: boolean;
          notify_candidate_rejected?: boolean;
          notify_member_joined?: boolean;
          reply_to_harper_threads?: boolean;
          respond_to_mentions?: boolean;
          slack_channel_id?: string;
          slack_channel_name?: string | null;
          slack_team_id?: string;
          updated_at?: string;
          worker_target?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_slack_channels_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_slack_integrations";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_slack_channels_default_role_id_fkey";
            columns: ["default_role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      company_slack_integrations: {
        Row: {
          bot_token_ciphertext: string | null;
          company_workspace_id: string;
          connected_at: string;
          created_at: string;
          id: string;
          installed_by_user_id: string | null;
          installed_at: string | null;
          last_error: string | null;
          last_sent_at: string | null;
          notify_candidate_accepted: boolean;
          notify_candidate_rejected: boolean;
          notify_member_joined: boolean;
          scopes: string[];
          slack_app_id: string | null;
          slack_bot_user_id: string | null;
          slack_channel_id: string | null;
          slack_channel_name: string | null;
          slack_team_id: string;
          slack_team_name: string | null;
          status: string;
          updated_at: string;
          webhook_url_ciphertext: string | null;
        };
        Insert: {
          bot_token_ciphertext?: string | null;
          company_workspace_id: string;
          connected_at?: string;
          created_at?: string;
          id?: string;
          installed_by_user_id?: string | null;
          installed_at?: string | null;
          last_error?: string | null;
          last_sent_at?: string | null;
          notify_candidate_accepted?: boolean;
          notify_candidate_rejected?: boolean;
          notify_member_joined?: boolean;
          scopes?: string[];
          slack_app_id?: string | null;
          slack_bot_user_id?: string | null;
          slack_channel_id?: string | null;
          slack_channel_name?: string | null;
          slack_team_id: string;
          slack_team_name?: string | null;
          status?: string;
          updated_at?: string;
          webhook_url_ciphertext?: string | null;
        };
        Update: {
          bot_token_ciphertext?: string | null;
          company_workspace_id?: string;
          connected_at?: string;
          created_at?: string;
          id?: string;
          installed_by_user_id?: string | null;
          installed_at?: string | null;
          last_error?: string | null;
          last_sent_at?: string | null;
          notify_candidate_accepted?: boolean;
          notify_candidate_rejected?: boolean;
          notify_member_joined?: boolean;
          scopes?: string[];
          slack_app_id?: string | null;
          slack_bot_user_id?: string | null;
          slack_channel_id?: string | null;
          slack_channel_name?: string | null;
          slack_team_id?: string;
          slack_team_name?: string | null;
          status?: string;
          updated_at?: string;
          webhook_url_ciphertext?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_slack_integrations_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_slack_integrations_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_slack_integrations_installed_by_user_id_fkey";
            columns: ["installed_by_user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      company_slack_threads: {
        Row: {
          channel_id: string;
          created_at: string;
          created_by_harper: boolean;
          id: string;
          role_id: string | null;
          slack_thread_ts: string;
          updated_at: string;
        };
        Insert: {
          channel_id: string;
          created_at?: string;
          created_by_harper?: boolean;
          id?: string;
          role_id?: string | null;
          slack_thread_ts: string;
          updated_at?: string;
        };
        Update: {
          channel_id?: string;
          created_at?: string;
          created_by_harper?: boolean;
          id?: string;
          role_id?: string | null;
          slack_thread_ts?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_slack_threads_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "company_slack_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_slack_threads_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      company_snapshot: {
        Row: {
          company_db_id: number | null;
          company_name: string;
          content: Json;
          created_at: string;
          id: string;
          status: string;
          updated_at: string;
          workspace_id: string | null;
        };
        Insert: {
          company_db_id?: number | null;
          company_name: string;
          content?: Json;
          created_at?: string;
          id?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Update: {
          company_db_id?: number | null;
          company_name?: string;
          content?: Json;
          created_at?: string;
          id?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_snapshot_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_snapshot_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_snapshot_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      company_talent_requests: {
        Row: {
          company_workspace_id: string;
          created_at: string;
          document_id: string | null;
          expires_at: string;
          expects_document: boolean;
          id: string;
          recommendation_id: string;
          request_context: string;
          role_id: string;
          source_company_message_id: number;
          talent_id: string;
          talent_source_message_id: number | null;
          workflow_status: string;
        };
        Insert: {
          company_workspace_id: string;
          created_at?: string;
          document_id?: string | null;
          expires_at?: string;
          expects_document?: boolean;
          id?: string;
          recommendation_id: string;
          request_context: string;
          role_id: string;
          source_company_message_id: number;
          talent_id: string;
          talent_source_message_id?: number | null;
          workflow_status?: string;
        };
        Update: {
          company_workspace_id?: string;
          created_at?: string;
          document_id?: string | null;
          expires_at?: string;
          expects_document?: boolean;
          id?: string;
          recommendation_id?: string;
          request_context?: string;
          role_id?: string;
          source_company_message_id?: number;
          talent_id?: string;
          talent_source_message_id?: number | null;
          workflow_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_talent_requests_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_talent_requests_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "talent_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_talent_requests_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "talent_opportunity_recommendation";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_talent_requests_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "company_talent_requests_source_company_message_id_fkey";
            columns: ["source_company_message_id"];
            isOneToOne: true;
            referencedRelation: "company_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_talent_requests_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "company_talent_requests_talent_source_message_id_fkey";
            columns: ["talent_source_message_id"];
            isOneToOne: false;
            referencedRelation: "talent_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      company_user_workspace: {
        Row: {
          authority: string;
          company_user_id: string;
          company_workspace_id: string;
          created_at: string;
          id: string;
          role: string | null;
          updated_at: string;
        };
        Insert: {
          authority?: string;
          company_user_id: string;
          company_workspace_id: string;
          created_at?: string;
          id?: string;
          role?: string | null;
          updated_at?: string;
        };
        Update: {
          authority?: string;
          company_user_id?: string;
          company_workspace_id?: string;
          created_at?: string;
          id?: string;
          role?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_user_workspace_company_user_id_fkey";
            columns: ["company_user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "company_user_workspace_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_user_workspace_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      company_users: {
        Row: {
          company: string | null;
          company_description: string | null;
          created_at: string;
          email: string | null;
          is_authenticated: boolean;
          is_custom: boolean;
          location: string | null;
          name: string | null;
          profile_picture: string | null;
          role: string | null;
          user_id: string;
        };
        Insert: {
          company?: string | null;
          company_description?: string | null;
          created_at?: string;
          email?: string | null;
          is_authenticated?: boolean;
          is_custom?: boolean;
          location?: string | null;
          name?: string | null;
          profile_picture?: string | null;
          role?: string | null;
          user_id?: string;
        };
        Update: {
          company?: string | null;
          company_description?: string | null;
          created_at?: string;
          email?: string | null;
          is_authenticated?: boolean;
          is_custom?: boolean;
          location?: string | null;
          name?: string | null;
          profile_picture?: string | null;
          role?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      company_workspace: {
        Row: {
          brief: string | null;
          career_url: string | null;
          company_db_id: number | null;
          company_description: string | null;
          company_name: string;
          company_workspace_id: string;
          created_at: string;
          has_career_page: boolean;
          homepage_url: string | null;
          is_internal: boolean;
          is_scrape_original: boolean;
          linkedin_url: string | null;
          logo_url: string | null;
          pitch: string | null;
          published_name: string | null;
          request: string | null;
          test_score: number;
          updated_at: string;
        };
        Insert: {
          brief?: string | null;
          career_url?: string | null;
          company_db_id?: number | null;
          company_description?: string | null;
          company_name: string;
          company_workspace_id?: string;
          created_at?: string;
          has_career_page?: boolean;
          homepage_url?: string | null;
          is_internal?: boolean;
          is_scrape_original?: boolean;
          linkedin_url?: string | null;
          logo_url?: string | null;
          pitch?: string | null;
          published_name?: string | null;
          request?: string | null;
          test_score?: number;
          updated_at?: string;
        };
        Update: {
          brief?: string | null;
          career_url?: string | null;
          company_db_id?: number | null;
          company_description?: string | null;
          company_name?: string;
          company_workspace_id?: string;
          created_at?: string;
          has_career_page?: boolean;
          homepage_url?: string | null;
          is_internal?: boolean;
          is_scrape_original?: boolean;
          linkedin_url?: string | null;
          logo_url?: string | null;
          pitch?: string | null;
          published_name?: string | null;
          request?: string | null;
          test_score?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_workspace_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
        ];
      };
      company_workspace_invitations: {
        Row: {
          accepted_at: string | null;
          company_workspace_id: string;
          created_at: string;
          email: string;
          invitation_id: string;
          invited_by_user_id: string | null;
          last_sent_at: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          company_workspace_id: string;
          created_at?: string;
          email: string;
          invitation_id?: string;
          invited_by_user_id?: string | null;
          last_sent_at?: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          company_workspace_id?: string;
          created_at?: string;
          email?: string;
          invitation_id?: string;
          invited_by_user_id?: string | null;
          last_sent_at?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_workspace_invitations_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_workspace_invitations_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_workspace_invitations_invited_by_user_id_fkey";
            columns: ["invited_by_user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      company_workspace_merge_audit: {
        Row: {
          duplicate_company_name: string;
          duplicate_homepage_url: string | null;
          duplicate_linkedin_url: string | null;
          duplicate_logo_url: string | null;
          duplicate_role_count: number;
          duplicate_workspace_id: string;
          merged_at: string;
          name_key: string;
          run_id: string;
          target_company_db_id: number;
          target_company_name: string;
          target_homepage_url: string | null;
          target_linkedin_url: string | null;
          target_workspace_id: string;
        };
        Insert: {
          duplicate_company_name: string;
          duplicate_homepage_url?: string | null;
          duplicate_linkedin_url?: string | null;
          duplicate_logo_url?: string | null;
          duplicate_role_count?: number;
          duplicate_workspace_id: string;
          merged_at?: string;
          name_key: string;
          run_id: string;
          target_company_db_id: number;
          target_company_name: string;
          target_homepage_url?: string | null;
          target_linkedin_url?: string | null;
          target_workspace_id: string;
        };
        Update: {
          duplicate_company_name?: string;
          duplicate_homepage_url?: string | null;
          duplicate_linkedin_url?: string | null;
          duplicate_logo_url?: string | null;
          duplicate_role_count?: number;
          duplicate_workspace_id?: string;
          merged_at?: string;
          name_key?: string;
          run_id?: string;
          target_company_db_id?: number;
          target_company_name?: string;
          target_homepage_url?: string | null;
          target_linkedin_url?: string | null;
          target_workspace_id?: string;
        };
        Relationships: [];
      };
      company_workspace_quality_label: {
        Row: {
          company_workspace_id: string;
          created_at: string;
          human_quality_label: number | null;
          human_quality_labeled_at: string | null;
          llm_quality_label: number | null;
          llm_quality_label_reason: string | null;
          llm_quality_label_v2: number | null;
          llm_quality_labeled_at: string | null;
          updated_at: string;
        };
        Insert: {
          company_workspace_id: string;
          created_at?: string;
          human_quality_label?: number | null;
          human_quality_labeled_at?: string | null;
          llm_quality_label?: number | null;
          llm_quality_label_reason?: string | null;
          llm_quality_label_v2?: number | null;
          llm_quality_labeled_at?: string | null;
          updated_at?: string;
        };
        Update: {
          company_workspace_id?: string;
          created_at?: string;
          human_quality_label?: number | null;
          human_quality_labeled_at?: string | null;
          llm_quality_label?: number | null;
          llm_quality_label_reason?: string | null;
          llm_quality_label_v2?: number | null;
          llm_quality_labeled_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_workspace_quality_label_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: true;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_workspace_quality_label_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: true;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      company_workspace_setting: {
        Row: {
          company_workspace_id: string | null;
          created_at: string;
          id: number;
          is_handle_operation: boolean | null;
          is_progressing: boolean | null;
          published_name: string | null;
        };
        Insert: {
          company_workspace_id?: string | null;
          created_at?: string;
          id?: number;
          is_handle_operation?: boolean | null;
          is_progressing?: boolean | null;
          published_name?: string | null;
        };
        Update: {
          company_workspace_id?: string | null;
          created_at?: string;
          id?: number;
          is_handle_operation?: boolean | null;
          is_progressing?: boolean | null;
          published_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_workspace_setting_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "company_workspace_setting_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      connection: {
        Row: {
          candid_id: string | null;
          created_at: string;
          id: number;
          last_updated_at: string;
          text: string | null;
          typed: number | null;
          user_id: string | null;
        };
        Insert: {
          candid_id?: string | null;
          created_at?: string;
          id?: number;
          last_updated_at?: string;
          text?: string | null;
          typed?: number | null;
          user_id?: string | null;
        };
        Update: {
          candid_id?: string | null;
          created_at?: string;
          id?: number;
          last_updated_at?: string;
          text?: string | null;
          typed?: number | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "connection_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      contact_queue: {
        Row: {
          attempts: number;
          cancelled_at: string | null;
          company_talent_request_id: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          payload: Json;
          recommendation_id: string | null;
          resend_email_id: string | null;
          role_id: string | null;
          scheduled_at: string;
          sent_at: string | null;
          status: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          cancelled_at?: string | null;
          company_talent_request_id?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          payload?: Json;
          recommendation_id?: string | null;
          resend_email_id?: string | null;
          role_id?: string | null;
          scheduled_at: string;
          sent_at?: string | null;
          status?: string;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          cancelled_at?: string | null;
          company_talent_request_id?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          payload?: Json;
          recommendation_id?: string | null;
          resend_email_id?: string | null;
          role_id?: string | null;
          scheduled_at?: string;
          sent_at?: string | null;
          status?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_queue_company_talent_request_id_fkey";
            columns: ["company_talent_request_id"];
            isOneToOne: false;
            referencedRelation: "company_talent_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_queue_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "talent_opportunity_recommendation";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_queue_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "contact_queue_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      credits: {
        Row: {
          charged_credit: number | null;
          created_at: string;
          id: number;
          last_updated_at: string | null;
          remain_credit: number | null;
          type: string | null;
          user_id: string | null;
        };
        Insert: {
          charged_credit?: number | null;
          created_at?: string;
          id?: number;
          last_updated_at?: string | null;
          remain_credit?: number | null;
          type?: string | null;
          user_id?: string | null;
        };
        Update: {
          charged_credit?: number | null;
          created_at?: string;
          id?: number;
          last_updated_at?: string | null;
          remain_credit?: number | null;
          type?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "credits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      credits_history: {
        Row: {
          charged_credits: number | null;
          created_at: string;
          event_type: string | null;
          id: number;
          user_id: string | null;
        };
        Insert: {
          charged_credits?: number | null;
          created_at?: string;
          event_type?: string | null;
          id?: number;
          user_id?: string | null;
        };
        Update: {
          charged_credits?: number | null;
          created_at?: string;
          event_type?: string | null;
          id?: number;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "credits_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      crm_email_campaign_deliveries: {
        Row: {
          campaign_id: string;
          discovery_run_id: string;
          sent_at: string;
          talent_id: string;
        };
        Insert: {
          campaign_id: string;
          discovery_run_id: string;
          sent_at?: string;
          talent_id: string;
        };
        Update: {
          campaign_id?: string;
          discovery_run_id?: string;
          sent_at?: string;
          talent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_email_campaign_deliveries_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "crm_email_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_email_campaign_deliveries_discovery_run_id_fkey";
            columns: ["discovery_run_id"];
            isOneToOne: false;
            referencedRelation: "opportunity_discovery_run";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_email_campaign_deliveries_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      crm_email_campaigns: {
        Row: {
          created_at: string;
          email_title: string | null;
          html_content: string;
          id: string;
          max_sends_per_user: number;
          max_total_sends: number;
          name: string;
          recipient_preferred_locale: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email_title?: string | null;
          html_content: string;
          id?: string;
          max_sends_per_user?: number;
          max_total_sends?: number;
          name: string;
          recipient_preferred_locale?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email_title?: string | null;
          html_content?: string;
          id?: string;
          max_sends_per_user?: number;
          max_total_sends?: number;
          name?: string;
          recipient_preferred_locale?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crunchbase_history: {
        Row: {
          company_db_id: number | null;
          content: Json;
          created_at: string;
          fetched_at: string;
          id: string;
          organization_permalink: string | null;
          organization_url: string;
          source_actor: string | null;
        };
        Insert: {
          company_db_id?: number | null;
          content?: Json;
          created_at?: string;
          fetched_at?: string;
          id?: string;
          organization_permalink?: string | null;
          organization_url: string;
          source_actor?: string | null;
        };
        Update: {
          company_db_id?: number | null;
          content?: Json;
          created_at?: string;
          fetched_at?: string;
          id?: string;
          organization_permalink?: string | null;
          organization_url?: string;
          source_actor?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crunchbase_history_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          excerpt: string | null;
          id: number;
          markdown: string | null;
          title: string | null;
          url: string | null;
        };
        Insert: {
          created_at?: string;
          excerpt?: string | null;
          id?: number;
          markdown?: string | null;
          title?: string | null;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          excerpt?: string | null;
          id?: number;
          markdown?: string | null;
          title?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      edu_user: {
        Row: {
          candid_id: string | null;
          created_at: string;
          degree: string | null;
          description: string | null;
          end_date: string | null;
          field: string | null;
          id: string;
          school: string | null;
          start_date: string | null;
          url: string | null;
        };
        Insert: {
          candid_id?: string | null;
          created_at?: string;
          degree?: string | null;
          description?: string | null;
          end_date?: string | null;
          field?: string | null;
          id?: string;
          school?: string | null;
          start_date?: string | null;
          url?: string | null;
        };
        Update: {
          candid_id?: string | null;
          created_at?: string;
          degree?: string | null;
          description?: string | null;
          end_date?: string | null;
          field?: string | null;
          id?: string;
          school?: string | null;
          start_date?: string | null;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "edu_user_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
        ];
      };
      email_inbound_events: {
        Row: {
          attachments: Json;
          cc_addresses: string[];
          created_at: string;
          from_email: string | null;
          id: string;
          message_id: string | null;
          provider: string;
          provider_email_id: string;
          provider_event_id: string | null;
          received_at: string;
          subject: string | null;
          to_addresses: string[];
        };
        Insert: {
          attachments?: Json;
          cc_addresses?: string[];
          created_at?: string;
          from_email?: string | null;
          id?: string;
          message_id?: string | null;
          provider?: string;
          provider_email_id: string;
          provider_event_id?: string | null;
          received_at?: string;
          subject?: string | null;
          to_addresses?: string[];
        };
        Update: {
          attachments?: Json;
          cc_addresses?: string[];
          created_at?: string;
          from_email?: string | null;
          id?: string;
          message_id?: string | null;
          provider?: string;
          provider_email_id?: string;
          provider_event_id?: string | null;
          received_at?: string;
          subject?: string | null;
          to_addresses?: string[];
        };
        Relationships: [];
      };
      email_reply_aliases: {
        Row: {
          company_talent_request_id: string | null;
          conversation_id: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          talent_id: string;
          token_hash: string;
        };
        Insert: {
          company_talent_request_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          talent_id: string;
          token_hash: string;
        };
        Update: {
          company_talent_request_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          talent_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_reply_aliases_company_talent_request_id_fkey";
            columns: ["company_talent_request_id"];
            isOneToOne: false;
            referencedRelation: "company_talent_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_reply_aliases_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_reply_aliases_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      email_reply_jobs: {
        Row: {
          assistant_message_id: number | null;
          attempts: number;
          conversation_id: string | null;
          created_at: string;
          id: string;
          inbound_event_id: string;
          kind: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          metadata: Json;
          processed_at: string | null;
          resend_email_id: string | null;
          skip_reason: string | null;
          status: string;
          talent_id: string | null;
          updated_at: string;
          user_message_id: number | null;
        };
        Insert: {
          assistant_message_id?: number | null;
          attempts?: number;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          inbound_event_id: string;
          kind?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          metadata?: Json;
          processed_at?: string | null;
          resend_email_id?: string | null;
          skip_reason?: string | null;
          status?: string;
          talent_id?: string | null;
          updated_at?: string;
          user_message_id?: number | null;
        };
        Update: {
          assistant_message_id?: number | null;
          attempts?: number;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          inbound_event_id?: string;
          kind?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          metadata?: Json;
          processed_at?: string | null;
          resend_email_id?: string | null;
          skip_reason?: string | null;
          status?: string;
          talent_id?: string | null;
          updated_at?: string;
          user_message_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_reply_jobs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_reply_jobs_inbound_event_id_fkey";
            columns: ["inbound_event_id"];
            isOneToOne: true;
            referencedRelation: "email_inbound_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_reply_jobs_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      ensemble_variants: {
        Row: {
          allow_fallback: boolean;
          created_at: string;
          expand_threshold: number;
          extra_info: string | null;
          fallback_only: boolean;
          fallback_threshold: number;
          id: number;
          is_active: boolean;
          name: string;
          priority: number;
          provider: string;
          temperature: number;
          updated_at: string;
          weight: number;
        };
        Insert: {
          allow_fallback?: boolean;
          created_at?: string;
          expand_threshold?: number;
          extra_info?: string | null;
          fallback_only?: boolean;
          fallback_threshold?: number;
          id?: number;
          is_active?: boolean;
          name: string;
          priority?: number;
          provider?: string;
          temperature?: number;
          updated_at?: string;
          weight?: number;
        };
        Update: {
          allow_fallback?: boolean;
          created_at?: string;
          expand_threshold?: number;
          extra_info?: string | null;
          fallback_only?: boolean;
          fallback_threshold?: number;
          id?: number;
          is_active?: boolean;
          name?: string;
          priority?: number;
          provider?: string;
          temperature?: number;
          updated_at?: string;
          weight?: number;
        };
        Relationships: [];
      };
      experience_user: {
        Row: {
          candid_id: string | null;
          company_id: number | null;
          created_at: string;
          description: string | null;
          end_date: string | null;
          id: number;
          months: number | null;
          role: string | null;
          start_date: string | null;
        };
        Insert: {
          candid_id?: string | null;
          company_id?: number | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: number;
          months?: number | null;
          role?: string | null;
          start_date?: string | null;
        };
        Update: {
          candid_id?: string | null;
          company_id?: number | null;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: number;
          months?: number | null;
          role?: string | null;
          start_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "experience_user_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_user_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
        ];
      };
      extra_experience: {
        Row: {
          candid_id: string | null;
          created_at: string;
          description: string | null;
          id: number;
          issued_at: string | null;
          issued_by: string | null;
          title: string | null;
          type: string | null;
        };
        Insert: {
          candid_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: number;
          issued_at?: string | null;
          issued_by?: string | null;
          title?: string | null;
          type?: string | null;
        };
        Update: {
          candid_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: number;
          issued_at?: string | null;
          issued_by?: string | null;
          title?: string | null;
          type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "extra_experience_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          content: string | null;
          created_at: string;
          from: string | null;
          id: number;
          reply_id: string | null;
          user_id: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          from?: string | null;
          id?: number;
          reply_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          from?: string | null;
          id?: number;
          reply_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      github_profile: {
        Row: {
          activity_summary: Json | null;
          avatar_url: string | null;
          bio: string | null;
          blog: string | null;
          candid_id: string | null;
          company: string | null;
          created_at: string | null;
          email: string | null;
          followers: number | null;
          following: number | null;
          github_created_at: string | null;
          github_id: number | null;
          github_url: string | null;
          github_username: string;
          id: string;
          is_hireable: boolean | null;
          is_site_admin: boolean | null;
          last_fetched_at: string | null;
          location: string | null;
          name: string | null;
          node_id: string | null;
          public_gists: number | null;
          public_repos: number | null;
          readme_markdown: string | null;
          search_text: string | null;
          updated_at: string | null;
        };
        Insert: {
          activity_summary?: Json | null;
          avatar_url?: string | null;
          bio?: string | null;
          blog?: string | null;
          candid_id?: string | null;
          company?: string | null;
          created_at?: string | null;
          email?: string | null;
          followers?: number | null;
          following?: number | null;
          github_created_at?: string | null;
          github_id?: number | null;
          github_url?: string | null;
          github_username: string;
          id?: string;
          is_hireable?: boolean | null;
          is_site_admin?: boolean | null;
          last_fetched_at?: string | null;
          location?: string | null;
          name?: string | null;
          node_id?: string | null;
          public_gists?: number | null;
          public_repos?: number | null;
          readme_markdown?: string | null;
          search_text?: string | null;
          updated_at?: string | null;
        };
        Update: {
          activity_summary?: Json | null;
          avatar_url?: string | null;
          bio?: string | null;
          blog?: string | null;
          candid_id?: string | null;
          company?: string | null;
          created_at?: string | null;
          email?: string | null;
          followers?: number | null;
          following?: number | null;
          github_created_at?: string | null;
          github_id?: number | null;
          github_url?: string | null;
          github_username?: string;
          id?: string;
          is_hireable?: boolean | null;
          is_site_admin?: boolean | null;
          last_fetched_at?: string | null;
          location?: string | null;
          name?: string | null;
          node_id?: string | null;
          public_gists?: number | null;
          public_repos?: number | null;
          readme_markdown?: string | null;
          search_text?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "github_profile_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
        ];
      };
      github_repo: {
        Row: {
          created_at: string | null;
          description: string | null;
          forks: number | null;
          github_id: number | null;
          homepage: string | null;
          id: string;
          is_archived: boolean | null;
          is_disabled: boolean | null;
          is_fork: boolean | null;
          language: string | null;
          languages: Json | null;
          last_fetched_at: string | null;
          license: string | null;
          node_id: string | null;
          open_issues: number | null;
          owner: string;
          pushed_at: string | null;
          readme_excerpt: string | null;
          repo_created_at: string | null;
          repo_full_name: string;
          repo_name: string;
          search_text: string | null;
          stars: number | null;
          topics: string[] | null;
          updated_at: string | null;
          watchers: number | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          forks?: number | null;
          github_id?: number | null;
          homepage?: string | null;
          id?: string;
          is_archived?: boolean | null;
          is_disabled?: boolean | null;
          is_fork?: boolean | null;
          language?: string | null;
          languages?: Json | null;
          last_fetched_at?: string | null;
          license?: string | null;
          node_id?: string | null;
          open_issues?: number | null;
          owner: string;
          pushed_at?: string | null;
          readme_excerpt?: string | null;
          repo_created_at?: string | null;
          repo_full_name: string;
          repo_name: string;
          search_text?: string | null;
          stars?: number | null;
          topics?: string[] | null;
          updated_at?: string | null;
          watchers?: number | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          forks?: number | null;
          github_id?: number | null;
          homepage?: string | null;
          id?: string;
          is_archived?: boolean | null;
          is_disabled?: boolean | null;
          is_fork?: boolean | null;
          language?: string | null;
          languages?: Json | null;
          last_fetched_at?: string | null;
          license?: string | null;
          node_id?: string | null;
          open_issues?: number | null;
          owner?: string;
          pushed_at?: string | null;
          readme_excerpt?: string | null;
          repo_created_at?: string | null;
          repo_full_name?: string;
          repo_name?: string;
          search_text?: string | null;
          stars?: number | null;
          topics?: string[] | null;
          updated_at?: string | null;
          watchers?: number | null;
        };
        Relationships: [];
      };
      github_repo_contribution: {
        Row: {
          commits: number;
          created_at: string;
          description: string | null;
          github_profile_id: string | null;
          id: number;
          last_contrib_at: string | null;
          merged_prs: number;
          repo_id: string | null;
          role: string | null;
          updated_at: string;
        };
        Insert: {
          commits?: number;
          created_at?: string;
          description?: string | null;
          github_profile_id?: string | null;
          id?: number;
          last_contrib_at?: string | null;
          merged_prs?: number;
          repo_id?: string | null;
          role?: string | null;
          updated_at?: string;
        };
        Update: {
          commits?: number;
          created_at?: string;
          description?: string | null;
          github_profile_id?: string | null;
          id?: number;
          last_contrib_at?: string | null;
          merged_prs?: number;
          repo_id?: string | null;
          role?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "github_repo_contribution_github_profile_id_fkey";
            columns: ["github_profile_id"];
            isOneToOne: false;
            referencedRelation: "github_profile";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "github_repo_contribution_repo_id_fkey";
            columns: ["repo_id"];
            isOneToOne: false;
            referencedRelation: "github_repo";
            referencedColumns: ["id"];
          },
        ];
      };
      harper_waitlist: {
        Row: {
          abtest: string | null;
          created_at: string;
          email: string | null;
          id: number;
          is_mobile: boolean | null;
          local_id: string | null;
          name: string | null;
          text: string | null;
          type: number | null;
          url: string | null;
        };
        Insert: {
          abtest?: string | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          is_mobile?: boolean | null;
          local_id?: string | null;
          name?: string | null;
          text?: string | null;
          type?: number | null;
          url?: string | null;
        };
        Update: {
          abtest?: string | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          is_mobile?: boolean | null;
          local_id?: string | null;
          name?: string | null;
          text?: string | null;
          type?: number | null;
          url?: string | null;
        };
        Relationships: [];
      };
      harper_waitlist_company: {
        Row: {
          access_granted_at: string | null;
          additional: string | null;
          approval_email_sent_at: string | null;
          approval_token: string | null;
          approved_at: string | null;
          approved_by: string | null;
          company: string | null;
          company_link: string | null;
          created_at: string;
          email: string;
          is_betatest_agree: boolean;
          is_mobile: boolean | null;
          is_submit: boolean;
          main: string | null;
          name: string | null;
          needs: string[] | null;
          role: string | null;
          size: string | null;
          status: string;
          type: string | null;
          user_id: string | null;
        };
        Insert: {
          access_granted_at?: string | null;
          additional?: string | null;
          approval_email_sent_at?: string | null;
          approval_token?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          company?: string | null;
          company_link?: string | null;
          created_at?: string;
          email: string;
          is_betatest_agree?: boolean;
          is_mobile?: boolean | null;
          is_submit?: boolean;
          main?: string | null;
          name?: string | null;
          needs?: string[] | null;
          role?: string | null;
          size?: string | null;
          status?: string;
          type?: string | null;
          user_id?: string | null;
        };
        Update: {
          access_granted_at?: string | null;
          additional?: string | null;
          approval_email_sent_at?: string | null;
          approval_token?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          company?: string | null;
          company_link?: string | null;
          created_at?: string;
          email?: string;
          is_betatest_agree?: boolean;
          is_mobile?: boolean | null;
          is_submit?: boolean;
          main?: string | null;
          name?: string | null;
          needs?: string[] | null;
          role?: string | null;
          size?: string | null;
          status?: string;
          type?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "harper_waitlist_company_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      homepage: {
        Row: {
          bio: string | null;
          created_at: string;
          id: number;
          page_type: string | null;
          related_links: string | null;
          url: string | null;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          id?: number;
          page_type?: string | null;
          related_links?: string | null;
          url?: string | null;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          id?: number;
          page_type?: string | null;
          related_links?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      internal_role_matching_run_memory: {
        Row: {
          content: string;
          created_at: string;
          role_id: string;
          run_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          role_id: string;
          run_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          role_id?: string;
          run_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "internal_role_matching_run_memory_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      jobposting_company_identity: {
        Row: {
          company_db_id: number | null;
          company_name: string | null;
          company_workspace_id: string;
          confidence: number;
          created_at: string;
          evidence: Json;
          first_seen_at: string;
          id: number;
          last_seen_at: string;
          provider: string;
          provider_company_id: string | null;
          provider_company_url: string | null;
          updated_at: string;
        };
        Insert: {
          company_db_id?: number | null;
          company_name?: string | null;
          company_workspace_id: string;
          confidence?: number;
          created_at?: string;
          evidence?: Json;
          first_seen_at?: string;
          id?: number;
          last_seen_at?: string;
          provider: string;
          provider_company_id?: string | null;
          provider_company_url?: string | null;
          updated_at?: string;
        };
        Update: {
          company_db_id?: number | null;
          company_name?: string | null;
          company_workspace_id?: string;
          confidence?: number;
          created_at?: string;
          evidence?: Json;
          first_seen_at?: string;
          id?: number;
          last_seen_at?: string;
          provider?: string;
          provider_company_id?: string | null;
          provider_company_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobposting_company_identity_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobposting_company_identity_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "jobposting_company_identity_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      jobposting_company_status: {
        Row: {
          company_db_id: number | null;
          company_workspace_id: string | null;
          created_at: string;
          evidence: Json;
          hiring_status: string;
          id: number;
          last_checked_at: string;
          lifecycle_status: string;
          updated_at: string;
        };
        Insert: {
          company_db_id?: number | null;
          company_workspace_id?: string | null;
          created_at?: string;
          evidence?: Json;
          hiring_status?: string;
          id?: number;
          last_checked_at?: string;
          lifecycle_status?: string;
          updated_at?: string;
        };
        Update: {
          company_db_id?: number | null;
          company_workspace_id?: string | null;
          created_at?: string;
          evidence?: Json;
          hiring_status?: string;
          id?: number;
          last_checked_at?: string;
          lifecycle_status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobposting_company_status_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobposting_company_status_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "jobposting_company_status_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      jobposting_crawl_log: {
        Row: {
          company_db_id: number | null;
          company_workspace_id: string | null;
          created_at: string;
          discovered_role_count: number;
          error_message: string | null;
          fetched_at: string;
          final_url: string | null;
          http_status: number | null;
          id: number;
          metadata: Json;
          page_alive: boolean | null;
          role_inserted_count: number;
          role_updated_count: number;
          run_type: string;
          source_kind: string;
          source_url: string;
          status: string;
        };
        Insert: {
          company_db_id?: number | null;
          company_workspace_id?: string | null;
          created_at?: string;
          discovered_role_count?: number;
          error_message?: string | null;
          fetched_at?: string;
          final_url?: string | null;
          http_status?: number | null;
          id?: number;
          metadata?: Json;
          page_alive?: boolean | null;
          role_inserted_count?: number;
          role_updated_count?: number;
          run_type: string;
          source_kind: string;
          source_url: string;
          status: string;
        };
        Update: {
          company_db_id?: number | null;
          company_workspace_id?: string | null;
          created_at?: string;
          discovered_role_count?: number;
          error_message?: string | null;
          fetched_at?: string;
          final_url?: string | null;
          http_status?: number | null;
          id?: number;
          metadata?: Json;
          page_alive?: boolean | null;
          role_inserted_count?: number;
          role_updated_count?: number;
          run_type?: string;
          source_kind?: string;
          source_url?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobposting_crawl_log_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobposting_crawl_log_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "jobposting_crawl_log_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      jobs_companies_sources: {
        Row: {
          company_workspace_id: string | null;
          created_at: string;
          first_seen_at: string;
          id: number;
          last_seen_at: string;
          linkedin_name: string | null;
          linkedin_url: string | null;
          source_metadata: Json;
          updated_at: string;
          wanted_company_name: string | null;
          wanted_company_url: string | null;
          zighang_company_name: string | null;
          zighang_company_url: string | null;
        };
        Insert: {
          company_workspace_id?: string | null;
          created_at?: string;
          first_seen_at?: string;
          id?: number;
          last_seen_at?: string;
          linkedin_name?: string | null;
          linkedin_url?: string | null;
          source_metadata?: Json;
          updated_at?: string;
          wanted_company_name?: string | null;
          wanted_company_url?: string | null;
          zighang_company_name?: string | null;
          zighang_company_url?: string | null;
        };
        Update: {
          company_workspace_id?: string | null;
          created_at?: string;
          first_seen_at?: string;
          id?: number;
          last_seen_at?: string;
          linkedin_name?: string | null;
          linkedin_url?: string | null;
          source_metadata?: Json;
          updated_at?: string;
          wanted_company_name?: string | null;
          wanted_company_url?: string | null;
          zighang_company_name?: string | null;
          zighang_company_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_companies_sources_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "jobs_companies_sources_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
        ];
      };
      landing_logs: {
        Row: {
          abtest_type: string | null;
          country_lang: string | null;
          created_at: string;
          id: number;
          is_mobile: boolean | null;
          local_id: string | null;
          type: string | null;
        };
        Insert: {
          abtest_type?: string | null;
          country_lang?: string | null;
          created_at?: string;
          id?: number;
          is_mobile?: boolean | null;
          local_id?: string | null;
          type?: string | null;
        };
        Update: {
          abtest_type?: string | null;
          country_lang?: string | null;
          created_at?: string;
          id?: number;
          is_mobile?: boolean | null;
          local_id?: string | null;
          type?: string | null;
        };
        Relationships: [];
      };
      link_previews: {
        Row: {
          description: string | null;
          fetched_at: string;
          published_at: string | null;
          title: string | null;
          url: string;
        };
        Insert: {
          description?: string | null;
          fetched_at?: string;
          published_at?: string | null;
          title?: string | null;
          url: string;
        };
        Update: {
          description?: string | null;
          fetched_at?: string;
          published_at?: string | null;
          title?: string | null;
          url?: string;
        };
        Relationships: [];
      };
      linkedin_company_id_collision_log: {
        Row: {
          detected_at: string;
          existing_company_db_id: number;
          harvestapi_id: number | null;
          id: number;
          incoming_company_db_id: number;
          linkedin_company_id: number;
          slug: string | null;
        };
        Insert: {
          detected_at?: string;
          existing_company_db_id: number;
          harvestapi_id?: number | null;
          id?: number;
          incoming_company_db_id: number;
          linkedin_company_id: number;
          slug?: string | null;
        };
        Update: {
          detected_at?: string;
          existing_company_db_id?: number;
          harvestapi_id?: number | null;
          id?: number;
          incoming_company_db_id?: number;
          linkedin_company_id?: number;
          slug?: string | null;
        };
        Relationships: [];
      };
      llm_logs: {
        Row: {
          cost_status: string;
          created_at: string;
          estimated_cost_usd: number;
          id: number;
          meta: Json;
          model: string;
          source: string;
          user_id: string | null;
        };
        Insert: {
          cost_status?: string;
          created_at?: string;
          estimated_cost_usd?: number;
          id?: number;
          meta?: Json;
          model: string;
          source: string;
          user_id?: string | null;
        };
        Update: {
          cost_status?: string;
          created_at?: string;
          estimated_cost_usd?: number;
          id?: number;
          meta?: Json;
          model?: string;
          source?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "llm_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      logs: {
        Row: {
          created_at: string;
          id: number;
          is_mobile: boolean | null;
          meta_data: Json | null;
          type: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          is_mobile?: boolean | null;
          meta_data?: Json | null;
          type?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          is_mobile?: boolean | null;
          meta_data?: Json | null;
          type?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          candid_id: string | null;
          content: string | null;
          created_at: string;
          id: number;
          latency: number | null;
          query_id: string | null;
          role: number | null;
          user_id: string | null;
        };
        Insert: {
          candid_id?: string | null;
          content?: string | null;
          created_at?: string;
          id?: number;
          latency?: number | null;
          query_id?: string | null;
          role?: number | null;
          user_id?: string | null;
        };
        Update: {
          candid_id?: string | null;
          content?: string | null;
          created_at?: string;
          id?: number;
          latency?: number | null;
          query_id?: string | null;
          role?: number | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "queries";
            referencedColumns: ["query_id"];
          },
          {
            foreignKeyName: "messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      official_job_events: {
        Row: {
          anonymous_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          ip_address: string | null;
          job_slug: string | null;
          metadata: Json;
          official_job_id: string | null;
          path: string | null;
          referrer: string | null;
          user_agent: string | null;
          user_email: string | null;
          user_id: string | null;
        };
        Insert: {
          anonymous_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          ip_address?: string | null;
          job_slug?: string | null;
          metadata?: Json;
          official_job_id?: string | null;
          path?: string | null;
          referrer?: string | null;
          user_agent?: string | null;
          user_email?: string | null;
          user_id?: string | null;
        };
        Update: {
          anonymous_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          ip_address?: string | null;
          job_slug?: string | null;
          metadata?: Json;
          official_job_id?: string | null;
          path?: string | null;
          referrer?: string | null;
          user_agent?: string | null;
          user_email?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "official_job_events_official_job_id_fkey";
            columns: ["official_job_id"];
            isOneToOne: false;
            referencedRelation: "official_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      official_jobs: {
        Row: {
          ashby_job_posting_id: string | null;
          company_description_markdown: string;
          company_logo_url: string | null;
          company_name: string;
          company_website_url: string | null;
          compensation: string | null;
          created_at: string;
          display_order: number;
          employment_type: string | null;
          id: string;
          is_on_linkedin: boolean | null;
          is_published: boolean;
          location: string;
          published_at: string | null;
          role_description_markdown: string;
          role_title: string;
          seniority: string | null;
          short_description: string;
          slug: string;
          source_company_name: string | null;
          updated_at: string;
          vertical: string;
        };
        Insert: {
          ashby_job_posting_id?: string | null;
          company_description_markdown?: string;
          company_logo_url?: string | null;
          company_name: string;
          company_website_url?: string | null;
          compensation?: string | null;
          created_at?: string;
          display_order?: number;
          employment_type?: string | null;
          id?: string;
          is_on_linkedin?: boolean | null;
          is_published?: boolean;
          location: string;
          published_at?: string | null;
          role_description_markdown?: string;
          role_title: string;
          seniority?: string | null;
          short_description?: string;
          slug: string;
          source_company_name?: string | null;
          updated_at?: string;
          vertical: string;
        };
        Update: {
          ashby_job_posting_id?: string | null;
          company_description_markdown?: string;
          company_logo_url?: string | null;
          company_name?: string;
          company_website_url?: string | null;
          compensation?: string | null;
          created_at?: string;
          display_order?: number;
          employment_type?: string | null;
          id?: string;
          is_on_linkedin?: boolean | null;
          is_published?: boolean;
          location?: string;
          published_at?: string | null;
          role_description_markdown?: string;
          role_title?: string;
          seniority?: string | null;
          short_description?: string;
          slug?: string;
          source_company_name?: string | null;
          updated_at?: string;
          vertical?: string;
        };
        Relationships: [];
      };
      org_intro_email_threads: {
        Row: {
          capture_address: string;
          company_workspace_id: string;
          created_at: string;
          id: string;
          last_message_at: string | null;
          message_count: number;
          outbound_message_id: string;
          participant_emails: string[];
          recommendation_id: string;
          role_id: string;
          status: string;
          talent_id: string;
          updated_at: string;
        };
        Insert: {
          capture_address: string;
          company_workspace_id: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          message_count?: number;
          outbound_message_id: string;
          participant_emails: string[];
          recommendation_id: string;
          role_id: string;
          status?: string;
          talent_id: string;
          updated_at?: string;
        };
        Update: {
          capture_address?: string;
          company_workspace_id?: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          message_count?: number;
          outbound_message_id?: string;
          participant_emails?: string[];
          recommendation_id?: string;
          role_id?: string;
          status?: string;
          talent_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_intro_email_threads_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "org_intro_email_threads_outbound_message_id_fkey";
            columns: ["outbound_message_id"];
            isOneToOne: true;
            referencedRelation: "career_email_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_intro_email_threads_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "talent_opportunity_recommendation";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_intro_email_threads_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "org_intro_email_threads_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      opportunity_discovery_run: {
        Row: {
          completed_at: string | null;
          conversation_id: string | null;
          coverage: Json;
          created_at: string;
          dedupe_key: string | null;
          error_message: string | null;
          id: string;
          message: string | null;
          query_plan: Json;
          run_mode: string;
          settings_snapshot: Json;
          started_at: string | null;
          status: string;
          talent_id: string | null;
          target_recommendation_count: number;
          trigger: string;
          trigger_payload: Json;
          updated_at: string;
          user_brief: Json;
        };
        Insert: {
          completed_at?: string | null;
          conversation_id?: string | null;
          coverage?: Json;
          created_at?: string;
          dedupe_key?: string | null;
          error_message?: string | null;
          id?: string;
          message?: string | null;
          query_plan?: Json;
          run_mode?: string;
          settings_snapshot?: Json;
          started_at?: string | null;
          status?: string;
          talent_id?: string | null;
          target_recommendation_count?: number;
          trigger: string;
          trigger_payload?: Json;
          updated_at?: string;
          user_brief?: Json;
        };
        Update: {
          completed_at?: string | null;
          conversation_id?: string | null;
          coverage?: Json;
          created_at?: string;
          dedupe_key?: string | null;
          error_message?: string | null;
          id?: string;
          message?: string | null;
          query_plan?: Json;
          run_mode?: string;
          settings_snapshot?: Json;
          started_at?: string | null;
          status?: string;
          talent_id?: string | null;
          target_recommendation_count?: number;
          trigger?: string;
          trigger_payload?: Json;
          updated_at?: string;
          user_brief?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_discovery_run_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunity_discovery_run_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      opportunity_ingestion_run: {
        Row: {
          completed_at: string | null;
          coverage: Json;
          created_at: string;
          error_message: string | null;
          from_date: string | null;
          id: string;
          numbers: Json | null;
          source_provider: string | null;
          source_scope: Json;
          started_at: string | null;
          status: string;
          to_date: string | null;
          trigger: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          coverage?: Json;
          created_at?: string;
          error_message?: string | null;
          from_date?: string | null;
          id?: string;
          numbers?: Json | null;
          source_provider?: string | null;
          source_scope?: Json;
          started_at?: string | null;
          status?: string;
          to_date?: string | null;
          trigger?: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          coverage?: Json;
          created_at?: string;
          error_message?: string | null;
          from_date?: string | null;
          id?: string;
          numbers?: Json | null;
          source_provider?: string | null;
          source_scope?: Json;
          started_at?: string | null;
          status?: string;
          to_date?: string | null;
          trigger?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      opportunity_scheduler_checks: {
        Row: {
          check_kind: string;
          check_payload: Json;
          checked_at: string;
          conversation_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          discovery_run_id: string | null;
          id: string;
          skip_reasons: string[];
          status: string;
          talent_id: string;
          updated_at: string;
        };
        Insert: {
          check_kind?: string;
          check_payload?: Json;
          checked_at?: string;
          conversation_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          discovery_run_id?: string | null;
          id?: string;
          skip_reasons?: string[];
          status?: string;
          talent_id: string;
          updated_at?: string;
        };
        Update: {
          check_kind?: string;
          check_payload?: Json;
          checked_at?: string;
          conversation_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          discovery_run_id?: string | null;
          id?: string;
          skip_reasons?: string[];
          status?: string;
          talent_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_scheduler_checks_discovery_run_id_fkey";
            columns: ["discovery_run_id"];
            isOneToOne: false;
            referencedRelation: "opportunity_discovery_run";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_source_document: {
        Row: {
          content_hash: string | null;
          created_at: string;
          expires_at: string | null;
          fetched_at: string;
          id: string;
          metadata: Json;
          provider: string;
          raw_text_summary: string | null;
          raw_title: string | null;
          source_type: string;
          source_url: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          content_hash?: string | null;
          created_at?: string;
          expires_at?: string | null;
          fetched_at?: string;
          id?: string;
          metadata?: Json;
          provider: string;
          raw_text_summary?: string | null;
          raw_title?: string | null;
          source_type?: string;
          source_url: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          content_hash?: string | null;
          created_at?: string;
          expires_at?: string | null;
          fetched_at?: string;
          id?: string;
          metadata?: Json;
          provider?: string;
          raw_text_summary?: string | null;
          raw_title?: string | null;
          source_type?: string;
          source_url?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      opportunity_source_registry: {
        Row: {
          allowed_access_mode: string;
          base_url: string;
          company_archetype_tags: string[];
          company_workspace_id: string | null;
          created_at: string;
          created_from_run_id: string | null;
          default_ttl_hours: number;
          demand_score: number;
          enabled: boolean;
          id: string;
          keyword_tags: string[];
          last_checked_at: string | null;
          last_error: string | null;
          last_success_at: string | null;
          location_tags: string[];
          next_refresh_at: string | null;
          parser_type: string | null;
          priority: number;
          provider: string;
          rate_limit_per_minute: number | null;
          refresh_interval_hours: number;
          role_family_tags: string[];
          search_url_template: string | null;
          updated_at: string;
        };
        Insert: {
          allowed_access_mode?: string;
          base_url: string;
          company_archetype_tags?: string[];
          company_workspace_id?: string | null;
          created_at?: string;
          created_from_run_id?: string | null;
          default_ttl_hours?: number;
          demand_score?: number;
          enabled?: boolean;
          id?: string;
          keyword_tags?: string[];
          last_checked_at?: string | null;
          last_error?: string | null;
          last_success_at?: string | null;
          location_tags?: string[];
          next_refresh_at?: string | null;
          parser_type?: string | null;
          priority?: number;
          provider: string;
          rate_limit_per_minute?: number | null;
          refresh_interval_hours?: number;
          role_family_tags?: string[];
          search_url_template?: string | null;
          updated_at?: string;
        };
        Update: {
          allowed_access_mode?: string;
          base_url?: string;
          company_archetype_tags?: string[];
          company_workspace_id?: string | null;
          created_at?: string;
          created_from_run_id?: string | null;
          default_ttl_hours?: number;
          demand_score?: number;
          enabled?: boolean;
          id?: string;
          keyword_tags?: string[];
          last_checked_at?: string | null;
          last_error?: string | null;
          last_success_at?: string | null;
          location_tags?: string[];
          next_refresh_at?: string | null;
          parser_type?: string | null;
          priority?: number;
          provider?: string;
          rate_limit_per_minute?: number | null;
          refresh_interval_hours?: number;
          role_family_tags?: string[];
          search_url_template?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_source_registry_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "opportunity_source_registry_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "opportunity_source_registry_created_from_run_id_fkey";
            columns: ["created_from_run_id"];
            isOneToOne: false;
            referencedRelation: "opportunity_discovery_run";
            referencedColumns: ["id"];
          },
        ];
      };
      ops_internal_recommendation_hidden: {
        Row: {
          hidden_at: string;
          recommendation_id: string;
        };
        Insert: {
          hidden_at?: string;
          recommendation_id: string;
        };
        Update: {
          hidden_at?: string;
          recommendation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ops_internal_recommendation_hidden_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: true;
            referencedRelation: "talent_opportunity_recommendation";
            referencedColumns: ["id"];
          },
        ];
      };
      ops_matching_role_stages: {
        Row: {
          id: string;
          label: string;
          role_id: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          label: string;
          role_id: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          label?: string;
          role_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ops_matching_role_stages_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      papers: {
        Row: {
          canonical_key: string | null;
          cited_by_scholar_link: string | null;
          created_at: string;
          id: string;
          pub_year: number | null;
          published_at: string | null;
          scholar_link: string | null;
          title: string;
          total_citations: number;
          year_citations: Json;
        };
        Insert: {
          canonical_key?: string | null;
          cited_by_scholar_link?: string | null;
          created_at?: string;
          id?: string;
          pub_year?: number | null;
          published_at?: string | null;
          scholar_link?: string | null;
          title: string;
          total_citations?: number;
          year_citations?: Json;
        };
        Update: {
          canonical_key?: string | null;
          cited_by_scholar_link?: string | null;
          created_at?: string;
          id?: string;
          pub_year?: number | null;
          published_at?: string | null;
          scholar_link?: string | null;
          title?: string;
          total_citations?: number;
          year_citations?: Json;
        };
        Relationships: [];
      };
      payment_attempts: {
        Row: {
          amount_krw: number;
          approved_at: string | null;
          attempt_key: string;
          created_at: string;
          failure_code: string | null;
          failure_message: string | null;
          id: number;
          order_id: string;
          payment_id: number | null;
          payment_key: string | null;
          plan_id: string | null;
          provider: string;
          raw_response: Json | null;
          reason: string;
          receipt_url: string | null;
          status: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          amount_krw: number;
          approved_at?: string | null;
          attempt_key: string;
          created_at?: string;
          failure_code?: string | null;
          failure_message?: string | null;
          id?: number;
          order_id: string;
          payment_id?: number | null;
          payment_key?: string | null;
          plan_id?: string | null;
          provider: string;
          raw_response?: Json | null;
          reason: string;
          receipt_url?: string | null;
          status: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          amount_krw?: number;
          approved_at?: string | null;
          attempt_key?: string;
          created_at?: string;
          failure_code?: string | null;
          failure_message?: string | null;
          id?: number;
          order_id?: string;
          payment_id?: number | null;
          payment_key?: string | null;
          plan_id?: string | null;
          provider?: string;
          raw_response?: Json | null;
          reason?: string;
          receipt_url?: string | null;
          status?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_attempts_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_attempts_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["plan_id"];
          },
          {
            foreignKeyName: "payment_attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      payments: {
        Row: {
          cancel_at_period_end: boolean | null;
          cancelled_at: string | null;
          card_company: string | null;
          card_number_masked: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          grace_ends_at: string | null;
          id: number;
          ls_customer_id: string | null;
          ls_subscription_id: string | null;
          next_charge_at: string | null;
          plan_id: string | null;
          provider: string | null;
          provider_status: string | null;
          retry_count: number | null;
          retry_next_at: string | null;
          toss_billing_key: string | null;
          toss_customer_key: string | null;
          toss_last_order_id: string | null;
          toss_last_payment_key: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          cancel_at_period_end?: boolean | null;
          cancelled_at?: string | null;
          card_company?: string | null;
          card_number_masked?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          grace_ends_at?: string | null;
          id?: number;
          ls_customer_id?: string | null;
          ls_subscription_id?: string | null;
          next_charge_at?: string | null;
          plan_id?: string | null;
          provider?: string | null;
          provider_status?: string | null;
          retry_count?: number | null;
          retry_next_at?: string | null;
          toss_billing_key?: string | null;
          toss_customer_key?: string | null;
          toss_last_order_id?: string | null;
          toss_last_payment_key?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          cancel_at_period_end?: boolean | null;
          cancelled_at?: string | null;
          card_company?: string | null;
          card_number_masked?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          grace_ends_at?: string | null;
          id?: number;
          ls_customer_id?: string | null;
          ls_subscription_id?: string | null;
          next_charge_at?: string | null;
          plan_id?: string | null;
          provider?: string | null;
          provider_status?: string | null;
          retry_count?: number | null;
          retry_next_at?: string | null;
          toss_billing_key?: string | null;
          toss_customer_key?: string | null;
          toss_last_order_id?: string | null;
          toss_last_payment_key?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["plan_id"];
          },
          {
            foreignKeyName: "payments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      plans: {
        Row: {
          created_at: string;
          credit: number;
          cycle: number;
          display_name: string | null;
          ls_variant_id: string | null;
          name: string | null;
          plan_id: string;
          price_krw: number | null;
        };
        Insert: {
          created_at?: string;
          credit?: number;
          cycle?: number;
          display_name?: string | null;
          ls_variant_id?: string | null;
          name?: string | null;
          plan_id?: string;
          price_krw?: number | null;
        };
        Update: {
          created_at?: string;
          credit?: number;
          cycle?: number;
          display_name?: string | null;
          ls_variant_id?: string | null;
          name?: string | null;
          plan_id?: string;
          price_krw?: number | null;
        };
        Relationships: [];
      };
      profile_shares: {
        Row: {
          candid_id: string;
          created_at: string;
          created_by: string;
          expires_at: string | null;
          id: string;
          include_chat: boolean;
          revoked_at: string | null;
          token: string;
        };
        Insert: {
          candid_id: string;
          created_at?: string;
          created_by: string;
          expires_at?: string | null;
          id?: string;
          include_chat?: boolean;
          revoked_at?: string | null;
          token: string;
        };
        Update: {
          candid_id?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string | null;
          id?: string;
          include_chat?: boolean;
          revoked_at?: string | null;
          token?: string;
        };
        Relationships: [];
      };
      publications: {
        Row: {
          candid_id: string | null;
          citation_num: number | null;
          created_at: string;
          id: number;
          link: string | null;
          published_at: string | null;
          title: string | null;
        };
        Insert: {
          candid_id?: string | null;
          citation_num?: number | null;
          created_at?: string;
          id?: number;
          link?: string | null;
          published_at?: string | null;
          title?: string | null;
        };
        Update: {
          candid_id?: string | null;
          citation_num?: number | null;
          created_at?: string;
          id?: number;
          link?: string | null;
          published_at?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "publications_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
        ];
      };
      queries: {
        Row: {
          created_at: string;
          is_deleted: boolean;
          query: string | null;
          query_id: string;
          query_keyword: string | null;
          raw_input_text: string | null;
          type: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          is_deleted?: boolean;
          query?: string | null;
          query_id?: string;
          query_keyword?: string | null;
          raw_input_text?: string | null;
          type?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          is_deleted?: boolean;
          query?: string | null;
          query_id?: string;
          query_keyword?: string | null;
          raw_input_text?: string | null;
          type?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "queries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      request: {
        Row: {
          candid_id: string | null;
          created_at: string;
          id: number;
          status: number;
          text: string | null;
          user_id: string | null;
        };
        Insert: {
          candid_id?: string | null;
          created_at?: string;
          id?: number;
          status?: number;
          text?: string | null;
          user_id?: string | null;
        };
        Update: {
          candid_id?: string | null;
          created_at?: string;
          id?: number;
          status?: number;
          text?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "request_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "request_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      run_variants: {
        Row: {
          created_at: string;
          error: string | null;
          id: number;
          latency_ms: number | null;
          llm_sql_latency: number | null;
          result_count: number | null;
          run_id: string;
          source_type: number;
          sql_query: string | null;
          status: string;
          variant: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: never;
          latency_ms?: number | null;
          llm_sql_latency?: number | null;
          result_count?: number | null;
          run_id: string;
          source_type?: number;
          sql_query?: string | null;
          status?: string;
          variant: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: never;
          latency_ms?: number | null;
          llm_sql_latency?: number | null;
          result_count?: number | null;
          run_id?: string;
          source_type?: number;
          sql_query?: string | null;
          status?: string;
          variant?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_variants_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      runs: {
        Row: {
          backend_pid: number | null;
          created_at: string;
          criteria: string[] | null;
          feedback: number;
          id: string;
          latency: number | null;
          limit_num: number;
          locale: string;
          logs: Json | null;
          message_id: number | null;
          query_id: string | null;
          query_text: string | null;
          search_settings: Json | null;
          status: string | null;
          user_id: string | null;
        };
        Insert: {
          backend_pid?: number | null;
          created_at?: string;
          criteria?: string[] | null;
          feedback?: number;
          id?: string;
          latency?: number | null;
          limit_num?: number;
          locale?: string;
          logs?: Json | null;
          message_id?: number | null;
          query_id?: string | null;
          query_text?: string | null;
          search_settings?: Json | null;
          status?: string | null;
          user_id?: string | null;
        };
        Update: {
          backend_pid?: number | null;
          created_at?: string;
          criteria?: string[] | null;
          feedback?: number;
          id?: string;
          latency?: number | null;
          limit_num?: number;
          locale?: string;
          logs?: Json | null;
          message_id?: number | null;
          query_id?: string | null;
          query_text?: string | null;
          search_settings?: Json | null;
          status?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "runs_query_id_fkey";
            columns: ["query_id"];
            isOneToOne: false;
            referencedRelation: "queries";
            referencedColumns: ["query_id"];
          },
          {
            foreignKeyName: "runs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      runs_pages: {
        Row: {
          candidate_ids: Json[] | null;
          created_at: string;
          id: number;
          page_idx: number | null;
          run_id: string | null;
          seen_page: number;
          total_candidates: number | null;
        };
        Insert: {
          candidate_ids?: Json[] | null;
          created_at?: string;
          id?: number;
          page_idx?: number | null;
          run_id?: string | null;
          seen_page?: number;
          total_candidates?: number | null;
        };
        Update: {
          candidate_ids?: Json[] | null;
          created_at?: string;
          id?: number;
          page_idx?: number | null;
          run_id?: string | null;
          seen_page?: number;
          total_candidates?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "runs_pages_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      scholar_contributions: {
        Row: {
          created_at: string;
          paper_id: string;
          scholar_profile_id: string;
        };
        Insert: {
          created_at?: string;
          paper_id: string;
          scholar_profile_id: string;
        };
        Update: {
          created_at?: string;
          paper_id?: string;
          scholar_profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scholar_contributions_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scholar_contributions_scholar_profile_id_fkey";
            columns: ["scholar_profile_id"];
            isOneToOne: false;
            referencedRelation: "scholar_profile";
            referencedColumns: ["id"];
          },
        ];
      };
      scholar_profile: {
        Row: {
          affiliation: string | null;
          candid_id: string | null;
          created_at: string;
          email: string | null;
          h_index: number;
          homepage_link: string | null;
          id: string;
          name: string;
          profile_image_url: string | null;
          scholar_url: string;
          scholar_user_id: string;
          search_text: string;
          topics: string;
          total_citations_num: number;
          year_citations: Json;
        };
        Insert: {
          affiliation?: string | null;
          candid_id?: string | null;
          created_at?: string;
          email?: string | null;
          h_index?: number;
          homepage_link?: string | null;
          id?: string;
          name: string;
          profile_image_url?: string | null;
          scholar_url: string;
          scholar_user_id: string;
          search_text?: string;
          topics?: string;
          total_citations_num?: number;
          year_citations?: Json;
        };
        Update: {
          affiliation?: string | null;
          candid_id?: string | null;
          created_at?: string;
          email?: string | null;
          h_index?: number;
          homepage_link?: string | null;
          id?: string;
          name?: string;
          profile_image_url?: string | null;
          scholar_url?: string;
          scholar_user_id?: string;
          search_text?: string;
          topics?: string;
          total_citations_num?: number;
          year_citations?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "scholar_profile_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: true;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
        ];
      };
      scraped_additional_links: {
        Row: {
          candid_id: string;
          created_at: string;
          links: Json | null;
        };
        Insert: {
          candid_id?: string;
          created_at?: string;
          links?: Json | null;
        };
        Update: {
          candid_id?: string;
          created_at?: string;
          links?: Json | null;
        };
        Relationships: [];
      };
      service_answer_examples: {
        Row: {
          answer_example_text: string;
          created_at: string;
          created_by: string | null;
          embedding: string;
          embedding_model: string;
          enabled: boolean;
          id: string;
          notes: string | null;
          tags: string[];
          updated_at: string;
          updated_by: string | null;
          user_example_hash: string;
          user_example_text: string;
        };
        Insert: {
          answer_example_text: string;
          created_at?: string;
          created_by?: string | null;
          embedding: string;
          embedding_model?: string;
          enabled?: boolean;
          id?: string;
          notes?: string | null;
          tags?: string[];
          updated_at?: string;
          updated_by?: string | null;
          user_example_hash: string;
          user_example_text: string;
        };
        Update: {
          answer_example_text?: string;
          created_at?: string;
          created_by?: string | null;
          embedding?: string;
          embedding_model?: string;
          enabled?: boolean;
          id?: string;
          notes?: string | null;
          tags?: string[];
          updated_at?: string;
          updated_by?: string | null;
          user_example_hash?: string;
          user_example_text?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          created_at: string;
          is_exclude_shortlist: boolean | null;
          is_korean: boolean | null;
          is_years_exp_enabled: boolean | null;
          max_years_exp: number | null;
          min_years_exp: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          is_exclude_shortlist?: boolean | null;
          is_korean?: boolean | null;
          is_years_exp_enabled?: boolean | null;
          max_years_exp?: number | null;
          min_years_exp?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          is_exclude_shortlist?: boolean | null;
          is_korean?: boolean | null;
          is_years_exp_enabled?: boolean | null;
          max_years_exp?: number | null;
          min_years_exp?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      shortlist_memo: {
        Row: {
          candid_id: string;
          created_at: string;
          id: number;
          memo: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          candid_id: string;
          created_at?: string;
          id?: number;
          memo?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          candid_id?: string;
          created_at?: string;
          id?: number;
          memo?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shortlist_memo_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shortlist_memo_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      slack_reply_jobs: {
        Row: {
          attempt_count: number;
          batched_prompt: string | null;
          choice_source_job_id: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          next_attempt_at: string;
          prompt: string;
          response_message_id: number | null;
          response_proposal_id: string | null;
          response_text: string | null;
          selected_choice_at: string | null;
          selected_choice_by_slack_user_id: string | null;
          selected_choice_index: number | null;
          selected_choice_label: string | null;
          selected_choice_message: string | null;
          slack_event_id: string;
          slack_message_ts: string;
          slack_response_ts: string | null;
          slack_user_id: string | null;
          status: string;
          thread_id: string;
          trigger_kind: string;
          updated_at: string;
          user_message_id: number | null;
          worker_target: string;
        };
        Insert: {
          attempt_count?: number;
          batched_prompt?: string | null;
          choice_source_job_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          next_attempt_at?: string;
          prompt: string;
          response_message_id?: number | null;
          response_proposal_id?: string | null;
          response_text?: string | null;
          selected_choice_at?: string | null;
          selected_choice_by_slack_user_id?: string | null;
          selected_choice_index?: number | null;
          selected_choice_label?: string | null;
          selected_choice_message?: string | null;
          slack_event_id: string;
          slack_message_ts: string;
          slack_response_ts?: string | null;
          slack_user_id?: string | null;
          status?: string;
          thread_id: string;
          trigger_kind: string;
          updated_at?: string;
          user_message_id?: number | null;
          worker_target?: string;
        };
        Update: {
          attempt_count?: number;
          batched_prompt?: string | null;
          choice_source_job_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          next_attempt_at?: string;
          prompt?: string;
          response_message_id?: number | null;
          response_proposal_id?: string | null;
          response_text?: string | null;
          selected_choice_at?: string | null;
          selected_choice_by_slack_user_id?: string | null;
          selected_choice_index?: number | null;
          selected_choice_label?: string | null;
          selected_choice_message?: string | null;
          slack_event_id?: string;
          slack_message_ts?: string;
          slack_response_ts?: string | null;
          slack_user_id?: string | null;
          status?: string;
          thread_id?: string;
          trigger_kind?: string;
          updated_at?: string;
          user_message_id?: number | null;
          worker_target?: string;
        };
        Relationships: [
          {
            foreignKeyName: "slack_reply_jobs_choice_source_job_id_fkey";
            columns: ["choice_source_job_id"];
            isOneToOne: false;
            referencedRelation: "slack_reply_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slack_reply_jobs_response_message_id_fkey";
            columns: ["response_message_id"];
            isOneToOne: false;
            referencedRelation: "company_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slack_reply_jobs_response_proposal_id_fkey";
            columns: ["response_proposal_id"];
            isOneToOne: false;
            referencedRelation: "company_agent_update_proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slack_reply_jobs_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "company_slack_threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slack_reply_jobs_user_message_id_fkey";
            columns: ["user_message_id"];
            isOneToOne: false;
            referencedRelation: "company_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      summary: {
        Row: {
          candid_id: string | null;
          created_at: string;
          id: number;
          text: string | null;
        };
        Insert: {
          candid_id?: string | null;
          created_at?: string;
          id?: number;
          text?: string | null;
        };
        Update: {
          candid_id?: string | null;
          created_at?: string;
          id?: number;
          text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "summary_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
        ];
      };
      synthesized_summary: {
        Row: {
          candid_id: string | null;
          created_at: string;
          id: number;
          run_id: string | null;
          text: string | null;
        };
        Insert: {
          candid_id?: string | null;
          created_at?: string;
          id?: number;
          run_id?: string | null;
          text?: string | null;
        };
        Update: {
          candid_id?: string | null;
          created_at?: string;
          id?: number;
          run_id?: string | null;
          text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "synthesized_summary_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "synthesized_summary_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      talent_activity_events: {
        Row: {
          changed_domains: string[];
          conversation_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          impact_level: string;
          message_id: number | null;
          source: string;
          summary: string;
          talent_id: string;
        };
        Insert: {
          changed_domains?: string[];
          conversation_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          impact_level?: string;
          message_id?: number | null;
          source?: string;
          summary: string;
          talent_id: string;
        };
        Update: {
          changed_domains?: string[];
          conversation_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          impact_level?: string;
          message_id?: number | null;
          source?: string;
          summary?: string;
          talent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_activity_events_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_activity_events_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "talent_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_activity_events_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_calls: {
        Row: {
          completed_at: string | null;
          conversation_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          last_active_at: string;
          started_at: string;
          state: Json;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          last_active_at?: string;
          started_at?: string;
          state?: Json;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          last_active_at?: string;
          started_at?: string;
          state?: Json;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_calls_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_calls_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_company_follow: {
        Row: {
          company_db_id: number;
          company_workspace_id: string | null;
          conversation_id: string | null;
          created_at: string;
          discovery_channel_summary: string | null;
          followed_at: string;
          id: string;
          source: string;
          talent_id: string;
          tracking_summary: string | null;
          unfollowed_at: string | null;
          updated_at: string;
        };
        Insert: {
          company_db_id: number;
          company_workspace_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          discovery_channel_summary?: string | null;
          followed_at?: string;
          id?: string;
          source?: string;
          talent_id: string;
          tracking_summary?: string | null;
          unfollowed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          company_db_id?: number;
          company_workspace_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          discovery_channel_summary?: string | null;
          followed_at?: string;
          id?: string;
          source?: string;
          talent_id?: string;
          tracking_summary?: string | null;
          unfollowed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_company_follow_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_company_follow_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "talent_company_follow_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "talent_company_follow_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_company_follow_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_company_recommendation: {
        Row: {
          active_role_count: number;
          clicked_at: string | null;
          company_db_id: number;
          company_workspace_id: string | null;
          conversation_id: string | null;
          created_at: string;
          dismissed_at: string | null;
          id: string;
          latest_signal: string | null;
          next_signal: string | null;
          rank: number | null;
          reason_summary: string | null;
          recommendation_reasons: Json;
          recommended_at: string;
          score: number | null;
          signal_summary: string | null;
          source: string;
          talent_id: string;
          updated_at: string;
          viewed_at: string | null;
        };
        Insert: {
          active_role_count?: number;
          clicked_at?: string | null;
          company_db_id: number;
          company_workspace_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          latest_signal?: string | null;
          next_signal?: string | null;
          rank?: number | null;
          reason_summary?: string | null;
          recommendation_reasons?: Json;
          recommended_at?: string;
          score?: number | null;
          signal_summary?: string | null;
          source?: string;
          talent_id: string;
          updated_at?: string;
          viewed_at?: string | null;
        };
        Update: {
          active_role_count?: number;
          clicked_at?: string | null;
          company_db_id?: number;
          company_workspace_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          latest_signal?: string | null;
          next_signal?: string | null;
          rank?: number | null;
          reason_summary?: string | null;
          recommendation_reasons?: Json;
          recommended_at?: string;
          score?: number | null;
          signal_summary?: string | null;
          source?: string;
          talent_id?: string;
          updated_at?: string;
          viewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "talent_company_recommendation_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_company_recommendation_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "company_workspace";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "talent_company_recommendation_company_workspace_id_fkey";
            columns: ["company_workspace_id"];
            isOneToOne: false;
            referencedRelation: "ops_company_workspace_with_label";
            referencedColumns: ["company_workspace_id"];
          },
          {
            foreignKeyName: "talent_company_recommendation_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_company_recommendation_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_conversation_summaries: {
        Row: {
          conversation_id: string;
          created_at: string;
          from_message_id: number | null;
          id: string;
          message_count: number;
          segment_summary: string;
          source_char_count: number;
          summary_json: Json;
          summary_text: string;
          talent_id: string;
          to_message_id: number;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          from_message_id?: number | null;
          id?: string;
          message_count?: number;
          segment_summary?: string;
          source_char_count?: number;
          summary_json?: Json;
          summary_text?: string;
          talent_id: string;
          to_message_id: number;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          from_message_id?: number | null;
          id?: string;
          message_count?: number;
          segment_summary?: string;
          source_char_count?: number;
          summary_json?: Json;
          summary_text?: string;
          talent_id?: string;
          to_message_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "talent_conversation_summaries_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_conversation_summaries_from_message_id_fkey";
            columns: ["from_message_id"];
            isOneToOne: false;
            referencedRelation: "talent_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_conversation_summaries_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "talent_conversation_summaries_to_message_id_fkey";
            columns: ["to_message_id"];
            isOneToOne: false;
            referencedRelation: "talent_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      talent_conversations: {
        Row: {
          created_at: string;
          id: string;
          relief_nudge_sent: boolean;
          stage: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          relief_nudge_sent?: boolean;
          stage?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          relief_nudge_sent?: boolean;
          stage?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_conversations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_educations: {
        Row: {
          created_at: string;
          degree: string | null;
          description: string | null;
          end_date: string | null;
          field: string | null;
          id: number;
          memo: string | null;
          school: string | null;
          start_date: string | null;
          talent_id: string;
          url: string | null;
        };
        Insert: {
          created_at?: string;
          degree?: string | null;
          description?: string | null;
          end_date?: string | null;
          field?: string | null;
          id?: number;
          memo?: string | null;
          school?: string | null;
          start_date?: string | null;
          talent_id: string;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          degree?: string | null;
          description?: string | null;
          end_date?: string | null;
          field?: string | null;
          id?: number;
          memo?: string | null;
          school?: string | null;
          start_date?: string | null;
          talent_id?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "talent_educations_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_documents: {
        Row: {
          content_type: string | null;
          created_at: string;
          extracted_text: string | null;
          file_name: string;
          id: string;
          is_primary: boolean;
          is_public: boolean;
          kind: string;
          size_bytes: number | null;
          storage_path: string;
          talent_id: string;
        };
        Insert: {
          content_type?: string | null;
          created_at?: string;
          extracted_text?: string | null;
          file_name: string;
          id?: string;
          is_primary?: boolean;
          is_public?: boolean;
          kind?: string;
          size_bytes?: number | null;
          storage_path: string;
          talent_id: string;
        };
        Update: {
          content_type?: string | null;
          created_at?: string;
          extracted_text?: string | null;
          file_name?: string;
          id?: string;
          is_primary?: boolean;
          is_public?: boolean;
          kind?: string;
          size_bytes?: number | null;
          storage_path?: string;
          talent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_documents_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_experiences: {
        Row: {
          company_id: string | null;
          company_link: string | null;
          company_location: string | null;
          company_logo: string | null;
          company_name: string | null;
          created_at: string;
          description: string | null;
          employment_type: string | null;
          end_date: string | null;
          id: number;
          memo: string | null;
          months: number | null;
          role: string | null;
          start_date: string | null;
          talent_id: string;
        };
        Insert: {
          company_id?: string | null;
          company_link?: string | null;
          company_location?: string | null;
          company_logo?: string | null;
          company_name?: string | null;
          created_at?: string;
          description?: string | null;
          employment_type?: string | null;
          end_date?: string | null;
          id?: number;
          memo?: string | null;
          months?: number | null;
          role?: string | null;
          start_date?: string | null;
          talent_id: string;
        };
        Update: {
          company_id?: string | null;
          company_link?: string | null;
          company_location?: string | null;
          company_logo?: string | null;
          company_name?: string | null;
          created_at?: string;
          description?: string | null;
          employment_type?: string | null;
          end_date?: string | null;
          id?: number;
          memo?: string | null;
          months?: number | null;
          role?: string | null;
          start_date?: string | null;
          talent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_experiences_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_external_fit: {
        Row: {
          created_at: string;
          meta: Json;
          role_id: string;
          talent_id: string;
        };
        Insert: {
          created_at?: string;
          meta?: Json;
          role_id: string;
          talent_id: string;
        };
        Update: {
          created_at?: string;
          meta?: Json;
          role_id?: string;
          talent_id?: string;
        };
        Relationships: [];
      };
      talent_extras: {
        Row: {
          content: Json;
          talent_id: string;
        };
        Insert: {
          content?: Json;
          talent_id: string;
        };
        Update: {
          content?: Json;
          talent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_extras_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: true;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_insights: {
        Row: {
          content: Json | null;
          created_at: string;
          id: number;
          last_updated_at: string | null;
          talent_id: string | null;
        };
        Insert: {
          content?: Json | null;
          created_at?: string;
          id?: number;
          last_updated_at?: string | null;
          talent_id?: string | null;
        };
        Update: {
          content?: Json | null;
          created_at?: string;
          id?: number;
          last_updated_at?: string | null;
          talent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "talent_insights_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: true;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_messages: {
        Row: {
          content: string;
          conversation_id: string | null;
          created_at: string;
          id: number;
          is_mobile: boolean | null;
          message_type: string;
          role: string;
          thinking_logs: Json;
          user_id: string;
        };
        Insert: {
          content: string;
          conversation_id?: string | null;
          created_at?: string;
          id?: number;
          is_mobile?: boolean | null;
          message_type?: string;
          role: string;
          thinking_logs?: Json;
          user_id: string;
        };
        Update: {
          content?: string;
          conversation_id?: string | null;
          created_at?: string;
          id?: number;
          is_mobile?: boolean | null;
          message_type?: string;
          role?: string;
          thinking_logs?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_network_referral_attributions: {
        Row: {
          hired_at: string | null;
          paid_at: string | null;
          referred_user_id: string;
          token: string;
        };
        Insert: {
          hired_at?: string | null;
          paid_at?: string | null;
          referred_user_id: string;
          token: string;
        };
        Update: {
          hired_at?: string | null;
          paid_at?: string | null;
          referred_user_id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_network_referral_attributions_referred_user_id_fkey";
            columns: ["referred_user_id"];
            isOneToOne: true;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "talent_network_referral_attributions_token_fkey";
            columns: ["token"];
            isOneToOne: false;
            referencedRelation: "talent_network_referral_links";
            referencedColumns: ["token"];
          },
        ];
      };
      talent_network_referral_links: {
        Row: {
          created_at: string;
          referrer_user_id: string;
          token: string;
          visit_count: number;
        };
        Insert: {
          created_at?: string;
          referrer_user_id: string;
          token: string;
          visit_count?: number;
        };
        Update: {
          created_at?: string;
          referrer_user_id?: string;
          token?: string;
          visit_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "talent_network_referral_links_referrer_user_id_fkey";
            columns: ["referrer_user_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_opportunity_chat_preview: {
        Row: {
          assistant_message_id: number;
          conversation_id: string;
          created_at: string;
          discovery_run_id: string;
          id: string;
          rank: number;
          recommendation_id: string;
        };
        Insert: {
          assistant_message_id: number;
          conversation_id: string;
          created_at?: string;
          discovery_run_id: string;
          id?: string;
          rank: number;
          recommendation_id: string;
        };
        Update: {
          assistant_message_id?: number;
          conversation_id?: string;
          created_at?: string;
          discovery_run_id?: string;
          id?: string;
          rank?: number;
          recommendation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_chat_preview_assistant_message_id_fkey";
            columns: ["assistant_message_id"];
            isOneToOne: false;
            referencedRelation: "talent_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_opportunity_chat_preview_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_opportunity_chat_preview_discovery_run_id_fkey";
            columns: ["discovery_run_id"];
            isOneToOne: false;
            referencedRelation: "opportunity_discovery_run";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_opportunity_chat_preview_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "talent_opportunity_recommendation";
            referencedColumns: ["id"];
          },
        ];
      };
      talent_opportunity_delivery: {
        Row: {
          channel: string;
          created_at: string;
          discovery_run_id: string;
          error_message: string | null;
          id: string;
          payload: Json;
          sent_at: string | null;
          status: string;
          talent_id: string;
          updated_at: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          discovery_run_id: string;
          error_message?: string | null;
          id?: string;
          payload?: Json;
          sent_at?: string | null;
          status?: string;
          talent_id: string;
          updated_at?: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          discovery_run_id?: string;
          error_message?: string | null;
          id?: string;
          payload?: Json;
          sent_at?: string | null;
          status?: string;
          talent_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_delivery_discovery_run_id_fkey";
            columns: ["discovery_run_id"];
            isOneToOne: false;
            referencedRelation: "opportunity_discovery_run";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_opportunity_delivery_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_opportunity_fit: {
        Row: {
          created_at: string;
          human_label: string | null;
          human_reason: string | null;
          human_reviewed_at: string | null;
          human_reviewed_by: string | null;
          id: string;
          kind: string | null;
          label: string;
          last_evaluated_at: string;
          opportunity_id: string;
          reason: string;
          reevaluation_checked_at: string | null;
          reevaluation_criteria: Json | null;
          score: number;
          talent_id: string;
        };
        Insert: {
          created_at?: string;
          human_label?: string | null;
          human_reason?: string | null;
          human_reviewed_at?: string | null;
          human_reviewed_by?: string | null;
          id?: string;
          kind?: string | null;
          label: string;
          last_evaluated_at?: string;
          opportunity_id: string;
          reason?: string;
          reevaluation_checked_at?: string | null;
          reevaluation_criteria?: Json | null;
          score: number;
          talent_id: string;
        };
        Update: {
          created_at?: string;
          human_label?: string | null;
          human_reason?: string | null;
          human_reviewed_at?: string | null;
          human_reviewed_by?: string | null;
          id?: string;
          kind?: string | null;
          label?: string;
          last_evaluated_at?: string;
          opportunity_id?: string;
          reason?: string;
          reevaluation_checked_at?: string | null;
          reevaluation_criteria?: Json | null;
          score?: number;
          talent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_fit_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "talent_opportunity_fit_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_opportunity_matching_review: {
        Row: {
          audit_reasoning: string;
          candidate_acceptance_score: number | null;
          candidate_fingerprint: string;
          company_fit_score: number | null;
          consideration_fingerprint: string;
          core_candidate_acceptance_score: number | null;
          core_company_fit_score: number | null;
          created_at: string;
          evaluator_version: string;
          evidence_confidence: number | null;
          excluded_until: string | null;
          final_disposition: string;
          id: string;
          kind: string;
          metadata: Json;
          mutual_score: number | null;
          opportunity_id: string;
          reason_codes: string[];
          requested_by: string | null;
          reviewed_at: string;
          role_fingerprint: string;
          run_id: string;
          source_snapshot: Json;
          talent_id: string;
        };
        Insert: {
          audit_reasoning?: string;
          candidate_acceptance_score?: number | null;
          candidate_fingerprint: string;
          company_fit_score?: number | null;
          consideration_fingerprint: string;
          core_candidate_acceptance_score?: number | null;
          core_company_fit_score?: number | null;
          created_at?: string;
          evaluator_version: string;
          evidence_confidence?: number | null;
          excluded_until?: string | null;
          final_disposition: string;
          id?: string;
          kind?: string;
          metadata?: Json;
          mutual_score?: number | null;
          opportunity_id: string;
          reason_codes?: string[];
          requested_by?: string | null;
          reviewed_at?: string;
          role_fingerprint: string;
          run_id: string;
          source_snapshot?: Json;
          talent_id: string;
        };
        Update: {
          audit_reasoning?: string;
          candidate_acceptance_score?: number | null;
          candidate_fingerprint?: string;
          company_fit_score?: number | null;
          consideration_fingerprint?: string;
          core_candidate_acceptance_score?: number | null;
          core_company_fit_score?: number | null;
          created_at?: string;
          evaluator_version?: string;
          evidence_confidence?: number | null;
          excluded_until?: string | null;
          final_disposition?: string;
          id?: string;
          kind?: string;
          metadata?: Json;
          mutual_score?: number | null;
          opportunity_id?: string;
          reason_codes?: string[];
          requested_by?: string | null;
          reviewed_at?: string;
          role_fingerprint?: string;
          run_id?: string;
          source_snapshot?: Json;
          talent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_matching_review_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "talent_opportunity_matching_review_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_opportunity_recommendation: {
        Row: {
          clicked_at: string | null;
          created_at: string;
          discovery_run_id: string | null;
          dismissed_at: string | null;
          email_acceptance_confirmation: Json;
          evidence: Json;
          feedback: string | null;
          feedback_at: string | null;
          feedback_reason: string | null;
          fit_reasons: Json;
          fit_summary: string | null;
          id: string;
          kind: string;
          model_version: string | null;
          opportunity_type: string;
          preference_fit: Json;
          processed_stage: string | null;
          processed_stage_version: string | null;
          rank: number | null;
          recommended_at: string;
          role_id: string;
          saved_stage: string | null;
          score: number | null;
          talent_id: string;
          talent_memo: string | null;
          tradeoffs: Json;
          updated_at: string;
          viewed_at: string | null;
        };
        Insert: {
          clicked_at?: string | null;
          created_at?: string;
          discovery_run_id?: string | null;
          dismissed_at?: string | null;
          email_acceptance_confirmation?: Json;
          evidence?: Json;
          feedback?: string | null;
          feedback_at?: string | null;
          feedback_reason?: string | null;
          fit_reasons?: Json;
          fit_summary?: string | null;
          id?: string;
          kind?: string;
          model_version?: string | null;
          opportunity_type?: string;
          preference_fit?: Json;
          processed_stage?: string | null;
          processed_stage_version?: string | null;
          rank?: number | null;
          recommended_at?: string;
          role_id: string;
          saved_stage?: string | null;
          score?: number | null;
          talent_id: string;
          talent_memo?: string | null;
          tradeoffs?: Json;
          updated_at?: string;
          viewed_at?: string | null;
        };
        Update: {
          clicked_at?: string | null;
          created_at?: string;
          discovery_run_id?: string | null;
          dismissed_at?: string | null;
          email_acceptance_confirmation?: Json;
          evidence?: Json;
          feedback?: string | null;
          feedback_at?: string | null;
          feedback_reason?: string | null;
          fit_reasons?: Json;
          fit_summary?: string | null;
          id?: string;
          kind?: string;
          model_version?: string | null;
          opportunity_type?: string;
          preference_fit?: Json;
          processed_stage?: string | null;
          processed_stage_version?: string | null;
          rank?: number | null;
          recommended_at?: string;
          role_id?: string;
          saved_stage?: string | null;
          score?: number | null;
          talent_id?: string;
          talent_memo?: string | null;
          tradeoffs?: Json;
          updated_at?: string;
          viewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_recommendation_discovery_run_fkey";
            columns: ["discovery_run_id"];
            isOneToOne: false;
            referencedRelation: "opportunity_discovery_run";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_opportunity_recommendation_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "talent_opportunity_recommendation_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_opportunity_tag: {
        Row: {
          created_at: string;
          id: string;
          opportunity_id: string;
          tag: string;
          talent_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          opportunity_id: string;
          tag: string;
          talent_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          opportunity_id?: string;
          tag?: string;
          talent_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_opportunity_tag_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "talent_opportunity_tag_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_ops_profile_memos: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          id: string;
          talent_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          talent_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          talent_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "talent_ops_profile_memos_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_progress: {
        Row: {
          company_user_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          metadata: Json;
          recommendation_id: string | null;
          role_id: string;
          talent_id: string;
          text: string;
          user_id: string | null;
        };
        Insert: {
          company_user_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          metadata?: Json;
          recommendation_id?: string | null;
          role_id: string;
          talent_id: string;
          text: string;
          user_id?: string | null;
        };
        Update: {
          company_user_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          metadata?: Json;
          recommendation_id?: string | null;
          role_id?: string;
          talent_id?: string;
          text?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "talent_progress_company_user_id_fkey";
            columns: ["company_user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "talent_progress_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "talent_opportunity_recommendation";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_progress_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
          {
            foreignKeyName: "talent_progress_talent_id_fkey";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_referral_application: {
        Row: {
          amount: string | null;
          created_at: string;
          hired_at: string | null;
          id: string;
          memo: string | null;
          recommendation_id: string | null;
          referred_user_id: string;
          reward_due_at: string | null;
          reward_paid: boolean;
          reward_paid_at: string | null;
          role_id: string;
          settlement_completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          amount?: string | null;
          created_at?: string;
          hired_at?: string | null;
          id?: string;
          memo?: string | null;
          recommendation_id?: string | null;
          referred_user_id: string;
          reward_due_at?: string | null;
          reward_paid?: boolean;
          reward_paid_at?: string | null;
          role_id: string;
          settlement_completed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: string | null;
          created_at?: string;
          hired_at?: string | null;
          id?: string;
          memo?: string | null;
          recommendation_id?: string | null;
          referred_user_id?: string;
          reward_due_at?: string | null;
          reward_paid?: boolean;
          reward_paid_at?: string | null;
          role_id?: string;
          settlement_completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_referral_application_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "talent_opportunity_recommendation";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_referral_application_referred_user_id_fkey";
            columns: ["referred_user_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "talent_referral_application_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      talent_referral_payout_information: {
        Row: {
          access_token_expires_at: string | null;
          access_token_hash: string | null;
          accuracy_confirmed_at: string | null;
          address_ciphertext: string | null;
          bank_account_holder_ciphertext: string | null;
          bank_account_number_ciphertext: string | null;
          bank_name: string | null;
          business_registration_number_ciphertext: string | null;
          created_at: string;
          id: string;
          is_korean_tax_resident: boolean | null;
          legal_name_ciphertext: string | null;
          notification_history: Json;
          phone_ciphertext: string | null;
          privacy_consent_version: string | null;
          privacy_consented_at: string | null;
          referral_application_id: string;
          referrer_user_id: string;
          resident_registration_number_ciphertext: string | null;
          submitted_at: string | null;
          tax_entity_type: string | null;
          updated_at: string;
        };
        Insert: {
          access_token_expires_at?: string | null;
          access_token_hash?: string | null;
          accuracy_confirmed_at?: string | null;
          address_ciphertext?: string | null;
          bank_account_holder_ciphertext?: string | null;
          bank_account_number_ciphertext?: string | null;
          bank_name?: string | null;
          business_registration_number_ciphertext?: string | null;
          created_at?: string;
          id?: string;
          is_korean_tax_resident?: boolean | null;
          legal_name_ciphertext?: string | null;
          notification_history?: Json;
          phone_ciphertext?: string | null;
          privacy_consent_version?: string | null;
          privacy_consented_at?: string | null;
          referral_application_id: string;
          referrer_user_id: string;
          resident_registration_number_ciphertext?: string | null;
          submitted_at?: string | null;
          tax_entity_type?: string | null;
          updated_at?: string;
        };
        Update: {
          access_token_expires_at?: string | null;
          access_token_hash?: string | null;
          accuracy_confirmed_at?: string | null;
          address_ciphertext?: string | null;
          bank_account_holder_ciphertext?: string | null;
          bank_account_number_ciphertext?: string | null;
          bank_name?: string | null;
          business_registration_number_ciphertext?: string | null;
          created_at?: string;
          id?: string;
          is_korean_tax_resident?: boolean | null;
          legal_name_ciphertext?: string | null;
          notification_history?: Json;
          phone_ciphertext?: string | null;
          privacy_consent_version?: string | null;
          privacy_consented_at?: string | null;
          referral_application_id?: string;
          referrer_user_id?: string;
          resident_registration_number_ciphertext?: string | null;
          submitted_at?: string | null;
          tax_entity_type?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_referral_payout_information_referral_application_id_fkey";
            columns: ["referral_application_id"];
            isOneToOne: true;
            referencedRelation: "talent_referral_application";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_referral_payout_information_referrer_user_id_fkey";
            columns: ["referrer_user_id"];
            isOneToOne: false;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_setting: {
        Row: {
          blocked_companies: string[];
          created_at: string;
          engagement_types: string[];
          get_external_recommendation: boolean;
          get_internal_recommendation: boolean;
          is_onboarding_done: boolean;
          periodic_interval_days: number;
          preferred_locale: string;
          profile_visibility: string;
          recommendation_batch_size: number;
          recommendation_source_conversation_id: string | null;
          setting_locale: string | null;
          status: string;
          status_updated_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          blocked_companies?: string[];
          created_at?: string;
          engagement_types?: string[];
          get_external_recommendation?: boolean;
          get_internal_recommendation?: boolean;
          is_onboarding_done?: boolean;
          periodic_interval_days?: number;
          preferred_locale?: string;
          profile_visibility?: string;
          recommendation_batch_size?: number;
          recommendation_source_conversation_id?: string | null;
          setting_locale?: string | null;
          status?: string;
          status_updated_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          blocked_companies?: string[];
          created_at?: string;
          engagement_types?: string[];
          get_external_recommendation?: boolean;
          get_internal_recommendation?: boolean;
          is_onboarding_done?: boolean;
          periodic_interval_days?: number;
          preferred_locale?: string;
          profile_visibility?: string;
          recommendation_batch_size?: number;
          recommendation_source_conversation_id?: string | null;
          setting_locale?: string | null;
          status?: string;
          status_updated_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_setting_recommendation_source_conversation_id_fkey";
            columns: ["recommendation_source_conversation_id"];
            isOneToOne: false;
            referencedRelation: "talent_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_setting_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "talent_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      talent_users: {
        Row: {
          bio: string | null;
          created_at: string;
          current_location: string | null;
          email: string | null;
          headline: string | null;
          last_logined_at: string | null;
          location: string | null;
          name: string | null;
          phone_number: string | null;
          profile_picture: string | null;
          resume_file_name: string | null;
          resume_links: string[];
          resume_storage_path: string | null;
          resume_text: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          current_location?: string | null;
          email?: string | null;
          headline?: string | null;
          last_logined_at?: string | null;
          location?: string | null;
          name?: string | null;
          phone_number?: string | null;
          profile_picture?: string | null;
          resume_file_name?: string | null;
          resume_links?: string[];
          resume_storage_path?: string | null;
          resume_text?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          current_location?: string | null;
          email?: string | null;
          headline?: string | null;
          last_logined_at?: string | null;
          location?: string | null;
          name?: string | null;
          phone_number?: string | null;
          profile_picture?: string | null;
          resume_file_name?: string | null;
          resume_links?: string[];
          resume_storage_path?: string | null;
          resume_text?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      translation_entries: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          key: string;
          locale: string;
          namespace: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
          value: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
          locale: string;
          namespace?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
          locale?: string;
          namespace?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: string;
        };
        Relationships: [];
      };
      unlock_profile: {
        Row: {
          candid_id: string | null;
          company_user_id: string | null;
          created_at: string;
          id: number;
        };
        Insert: {
          candid_id?: string | null;
          company_user_id?: string | null;
          created_at?: string;
          id?: number;
        };
        Update: {
          candid_id?: string | null;
          company_user_id?: string | null;
          created_at?: string;
          id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reveal_candid_id_fkey";
            columns: ["candid_id"];
            isOneToOne: false;
            referencedRelation: "candid";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reveal_company_user_id_fkey";
            columns: ["company_user_id"];
            isOneToOne: false;
            referencedRelation: "company_users";
            referencedColumns: ["user_id"];
          },
        ];
      };
      wonderful_fde_country_roles: {
        Row: {
          country_code: string;
          created_at: string;
          location_text: string;
          role_id: string;
          updated_at: string;
        };
        Insert: {
          country_code: string;
          created_at?: string;
          location_text: string;
          role_id: string;
          updated_at?: string;
        };
        Update: {
          country_code?: string;
          created_at?: string;
          location_text?: string;
          role_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wonderful_fde_country_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: true;
            referencedRelation: "company_roles";
            referencedColumns: ["role_id"];
          },
        ];
      };
      worker_runtime_settings: {
        Row: {
          created_at: string;
          found_threshold: number;
          name: string;
          rerank_batch_size: number;
          review_candidate_limit: number;
          summary_concurrency: number;
          updated_at: string;
          variant_candidate_limit: number;
        };
        Insert: {
          created_at?: string;
          found_threshold: number;
          name: string;
          rerank_batch_size: number;
          review_candidate_limit: number;
          summary_concurrency: number;
          updated_at?: string;
          variant_candidate_limit: number;
        };
        Update: {
          created_at?: string;
          found_threshold?: number;
          name?: string;
          rerank_batch_size?: number;
          review_candidate_limit?: number;
          summary_concurrency?: number;
          updated_at?: string;
          variant_candidate_limit?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      ops_company_workspace_with_label: {
        Row: {
          brief: string | null;
          career_url: string | null;
          company_db_id: number | null;
          company_description: string | null;
          company_name: string | null;
          company_workspace_id: string | null;
          created_at: string | null;
          cwql_human_quality_label: number | null;
          cwql_llm_quality_label: number | null;
          has_career_page: boolean | null;
          homepage_url: string | null;
          is_internal: boolean | null;
          is_scrape_original: boolean | null;
          linkedin_url: string | null;
          logo_url: string | null;
          pitch: string | null;
          request: string | null;
          test_score: number | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_workspace_company_db_id_fkey";
            columns: ["company_db_id"];
            isOneToOne: false;
            referencedRelation: "company_db";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      activate_slack_company_agent_update_proposal_v1: {
        Args: {
          p_proposal_id: string;
          p_slack_bot_user_id: string;
          p_slack_message_ts: string;
        };
        Returns: Json;
      };
      apply_company_data_changes_v1: {
        Args: {
          p_changes: Json;
          p_event_content: string;
          p_source: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      archive_ended_internal_opportunities_for_talent: {
        Args: { p_locale?: string; p_talent_id: string };
        Returns: number;
      };
      can_access_candidate_profile: {
        Args: { target_candid_id: string };
        Returns: boolean;
      };
      candid_with_github: {
        Args: never;
        Returns: {
          bio: string | null;
          created_at: string;
          email: string | null;
          fts: unknown;
          headline: string | null;
          id: string;
          is_duplicated_old: boolean;
          is_korean: boolean;
          is_linkedin_deprecated: boolean;
          is_selective: boolean;
          last_updated_at: string | null;
          linkedin_url: string | null;
          links: string[] | null;
          location: string | null;
          name: string | null;
          profile_picture: string | null;
          summary: string | null;
          total_exp_months: number | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "candid";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      change_internal_talent_opportunity_decision:
        | {
            Args: {
              p_action: string;
              p_changed_at?: string;
              p_recommendation_id: string;
              p_talent_id: string;
            };
            Returns: string;
          }
        | {
            Args: {
              p_action: string;
              p_changed_at: string;
              p_reason: string;
              p_recommendation_id: string;
              p_talent_id: string;
            };
            Returns: string;
          };
      claim_career_email_onboarding_lead: {
        Args: {
          onboarding_lead_id: string;
          target_email?: string;
          target_name?: string;
          target_profile_picture?: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      claim_career_email_onboarding_reviews: {
        Args: {
          batch_size?: number;
          max_attempts?: number;
          stale_after_seconds?: number;
          worker_id: string;
        };
        Returns: {
          abtest_type: string;
          calendar_cta_sent_at: string | null;
          calendar_url: string | null;
          conversation_id: string | null;
          converted_at: string | null;
          converted_user_id: string | null;
          country_lang: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          first_email_resend_id: string | null;
          first_email_sent_at: string | null;
          first_inbound_at: string | null;
          id: string;
          is_mobile: boolean | null;
          last_error: string | null;
          local_id: string | null;
          metadata: Json;
          normalized_email: string;
          page_path: string | null;
          paused_at: string | null;
          profile_ingested_at: string | null;
          profile_links: string[];
          profile_received_at: string | null;
          reply_alias: string | null;
          resume_text: string | null;
          review_attempts: number;
          review_email_resend_id: string | null;
          review_locked_at: string | null;
          review_locked_by: string | null;
          source: string | null;
          status: string;
          step: string;
          talent_id: string | null;
          updated_at: string;
          variant: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "career_email_onboarding_leads";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_contact_queue_jobs: {
        Args: {
          batch_size?: number;
          max_attempts?: number;
          stale_after_seconds?: number;
          worker_id: string;
        };
        Returns: {
          attempts: number;
          cancelled_at: string | null;
          company_talent_request_id: string | null;
          created_at: string;
          id: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          payload: Json;
          recommendation_id: string | null;
          resend_email_id: string | null;
          role_id: string | null;
          scheduled_at: string;
          sent_at: string | null;
          status: string;
          type: string;
          updated_at: string;
          user_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "contact_queue";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_slack_reply_jobs: {
        Args: {
          p_batch_size?: number;
          p_max_retry_count?: number;
          p_stale_after_seconds?: number;
          p_worker_id: string;
        };
        Returns: Database["public"]["Tables"]["slack_reply_jobs"]["Row"][];
        SetofOptions: {
          from: "*";
          to: "slack_reply_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_slack_reply_jobs_v2: {
        Args: {
          p_batch_size?: number;
          p_max_retry_count?: number;
          p_stale_after_seconds?: number;
          p_worker_id: string;
          p_worker_target: string;
        };
        Returns: Database["public"]["Tables"]["slack_reply_jobs"]["Row"][];
        SetofOptions: {
          from: "*";
          to: "slack_reply_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      enqueue_slack_reply_job_v1: {
        Args: {
          p_prompt: string;
          p_slack_event_id: string;
          p_slack_message_ts: string;
          p_slack_user_id: string | null;
          p_thread_id: string;
          p_trigger_kind: string;
        };
        Returns: Json;
      };
      enqueue_slack_button_choice_v1: {
        Args: {
          p_action_ts: string;
          p_choice_index: number;
          p_choice_label: string;
          p_choice_message: string;
          p_slack_channel_id: string;
          p_slack_team_id: string;
          p_slack_user_id: string;
          p_source_job_id: string;
          p_source_message_ts: string;
        };
        Returns: Json;
      };
      company_talent_request_stage_is_pending_v1: {
        Args: { p_request_id: string };
        Returns: boolean;
      };
      cancel_company_talent_request_v1: {
        Args: {
          p_request_id: string;
          p_role_id: string;
          p_talent_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      change_company_talent_request_v1: {
        Args: {
          p_action: string;
          p_request_id: string;
          p_role_id: string;
          p_talent_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      reconcile_company_talent_requests_for_stage_v1: {
        Args: { p_role_id: string; p_talent_id: string };
        Returns: undefined;
      };
      set_slack_agent_worker_target_v1: {
        Args: {
          p_company_workspace_id?: string | null;
          p_slack_channel_id?: string | null;
          p_worker_target: string;
        };
        Returns: Json;
      };
      enqueue_company_talent_request_v1: {
        Args: {
          p_expects_document: boolean;
          p_recommendation_id: string;
          p_request_context: string;
          p_role_id: string;
          p_source_company_message_id: number;
          p_talent_id: string;
          p_workspace_id: string;
        };
        Returns: Database["public"]["Tables"]["company_talent_requests"]["Row"];
      };
      finalize_company_talent_delivery_v1: {
        Args: {
          p_request_id: string;
          p_slack_bot_user_id?: string | null;
          p_slack_message_ts?: string | null;
        };
        Returns: Json;
      };
      finalize_talent_resume_upload_v1: {
        Args: {
          p_content_type: string;
          p_conversation_id: string;
          p_extracted_text: string;
          p_file_name: string;
          p_request_id: string;
          p_size_bytes: number;
          p_storage_path: string;
          p_talent_id: string;
        };
        Returns: Json;
      };
      claim_email_reply_jobs: {
        Args: {
          batch_size?: number;
          max_attempts?: number;
          stale_after_seconds?: number;
          worker_id: string;
        };
        Returns: {
          assistant_message_id: number | null;
          attempts: number;
          conversation_id: string | null;
          created_at: string;
          id: string;
          inbound_event_id: string;
          kind: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          metadata: Json;
          processed_at: string | null;
          resend_email_id: string | null;
          skip_reason: string | null;
          status: string;
          talent_id: string | null;
          updated_at: string;
          user_message_id: number | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "email_reply_jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      create_email_inbound_event_and_job_v1: {
        Args: {
          p_cc_addresses: string[];
          p_from_email: string;
          p_job_kind: string;
          p_job_metadata: Json;
          p_message_id: string;
          p_provider: string;
          p_provider_email_id: string;
          p_provider_event_id: string;
          p_received_at: string;
          p_subject: string;
          p_to_addresses: string[];
        };
        Returns: Json;
      };
      claim_talent_user_email_alias: {
        Args: {
          source_email: string;
          target_email?: string;
          target_name?: string;
          target_profile_picture?: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      deduct_user_credits: {
        Args: { amount_to_deduct: number };
        Returns: number;
      };
      execute_raw_sql: {
        Args: {
          limit_num: number;
          offset_num: number;
          page_idx: number;
          sql_query: string;
        };
        Returns: Json[];
      };
      finalize_slack_company_agent_reply_v1: {
        Args: {
          p_job_id: string;
          p_slack_bot_user_id: string;
          p_slack_message_ts: string;
        };
        Returns: Json;
      };
      list_translation_entry_groups: {
        Args: {
          p_after_key?: string;
          p_limit?: number;
          p_min_ko_length?: number;
          p_namespace?: string;
          p_query?: string;
        };
        Returns: {
          description: string;
          en: string;
          key: string;
          ko: string;
          updated_at: string;
          updated_by: string;
        }[];
      };
      match_service_answer_examples: {
        Args: {
          embedding_model_filter?: string;
          match_count?: number;
          min_score?: number;
          query_embedding: string;
        };
        Returns: {
          answer_example_text: string;
          id: string;
          score: number;
          tags: string[];
          user_example_text: string;
        }[];
      };
      present_company_agent_update_proposal_v1: {
        Args: {
          p_message_metadata?: Json;
          p_message_type?: string;
          p_model?: string | null;
          p_payload: Json;
          p_presentation_text: string;
          p_preview: string;
          p_scope_key: string;
          p_slack_thread_id?: string | null;
          p_source: string;
          p_summary: string;
          p_thinking_logs?: Json;
          p_user_message_id: number;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      record_talent_network_referral_visit: {
        Args: { p_token: string; p_visitor_user_id?: string };
        Returns: {
          is_self_visit: boolean;
          referrer_user_id: string;
          token: string;
          visit_count: number;
        }[];
      };
      record_company_talent_response_v1: {
        Args: {
          p_request_id: string;
          p_source_message_id: number;
          p_talent_id: string;
        };
        Returns: Database["public"]["Tables"]["company_talent_requests"]["Row"];
      };
      reassociate_company_workspace_db_v1: {
        Args: {
          p_changes: Json;
          p_event_content: string;
          p_expected_company_db_id: number | null;
          p_target_company_db_id: number | null;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      resolve_company_agent_update_proposal_v1: {
        Args: {
          p_action: string;
          p_current_user_message_id: number;
          p_proposal_id: string;
          p_scope_key: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      reveal_candidate_profile: {
        Args: { target_candid_id: string };
        Returns: {
          already_revealed: boolean;
          new_balance: number;
        }[];
      };
      set_timeout_and_execute_raw_sql: {
        Args: {
          limit_num: number;
          offset_num: number;
          page_idx: number;
          sql_query: string;
        };
        Returns: Json[];
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      store_company_talent_relay_body_v1: {
        Args: {
          p_body: string;
          p_request_id: string;
        };
        Returns: Database["public"]["Tables"]["company_talent_requests"]["Row"];
      };
      stop_run_worker: { Args: { target_run_id: string }; Returns: undefined };
      update_repo_ids: { Args: never; Returns: undefined };
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

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
