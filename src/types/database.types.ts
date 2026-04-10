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
      automation: {
        Row: {
          created_at: string
          id: string
          is_deleted: boolean | null
          is_in_progress: boolean | null
          last_updated_at: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          is_in_progress?: boolean | null
          last_updated_at?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          is_in_progress?: boolean | null
          last_updated_at?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      automation_results: {
        Row: {
          automation_id: string | null
          candid_id: string | null
          concerns: string | null
          created_at: string
          id: number
          text: string | null
          user_id: string | null
        }
        Insert: {
          automation_id?: string | null
          candid_id?: string | null
          concerns?: string | null
          created_at?: string
          id?: number
          text?: string | null
          user_id?: string | null
        }
        Update: {
          automation_id?: string | null
          candid_id?: string | null
          concerns?: string | null
          created_at?: string
          id?: number
          text?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_results_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_results_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
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
      candidate_outreach: {
        Row: {
          active_step: number
          candid_id: string
          created_at: string
          email_discovery_cancel_requested_at: string | null
          email_discovery_evidence: Json
          email_discovery_status: string
          email_discovery_summary: string | null
          email_discovery_trace: Json
          email_source_label: string | null
          email_source_type: string | null
          email_source_url: string | null
          history: Json | null
          id: number
          last_sent_at: string | null
          memo: string | null
          next_due_at: string | null
          sequence_mark: string | null
          sequence_schedule: Json | null
          sequence_status: string
          stopped_at: string | null
          target_email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_step?: number
          candid_id: string
          created_at?: string
          email_discovery_cancel_requested_at?: string | null
          email_discovery_evidence?: Json
          email_discovery_status?: string
          email_discovery_summary?: string | null
          email_discovery_trace?: Json
          email_source_label?: string | null
          email_source_type?: string | null
          email_source_url?: string | null
          history?: Json | null
          id?: number
          last_sent_at?: string | null
          memo?: string | null
          next_due_at?: string | null
          sequence_mark?: string | null
          sequence_schedule?: Json | null
          sequence_status?: string
          stopped_at?: string | null
          target_email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_step?: number
          candid_id?: string
          created_at?: string
          email_discovery_cancel_requested_at?: string | null
          email_discovery_evidence?: Json
          email_discovery_status?: string
          email_discovery_summary?: string | null
          email_discovery_trace?: Json
          email_source_label?: string | null
          email_source_type?: string | null
          email_source_url?: string | null
          history?: Json | null
          id?: number
          last_sent_at?: string | null
          memo?: string | null
          next_due_at?: string | null
          sequence_mark?: string | null
          sequence_schedule?: Json | null
          sequence_status?: string
          stopped_at?: string | null
          target_email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_outreach_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_outreach_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      candidate_outreach_message: {
        Row: {
          body: string
          candid_id: string
          created_at: string
          created_by: string
          id: number
          kind: string
          outreach_id: number | null
          rendered_body: string | null
          rendered_subject: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          step_number: number | null
          subject: string
          to_email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          candid_id: string
          created_at?: string
          created_by: string
          id?: number
          kind: string
          outreach_id?: number | null
          rendered_body?: string | null
          rendered_subject?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          step_number?: number | null
          subject: string
          to_email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          candid_id?: string
          created_at?: string
          created_by?: string
          id?: number
          kind?: string
          outreach_id?: number | null
          rendered_body?: string | null
          rendered_subject?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          step_number?: number | null
          subject?: string
          to_email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_outreach_message_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_outreach_message_outreach_id_fkey"
            columns: ["outreach_id"]
            isOneToOne: false
            referencedRelation: "candidate_outreach"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_outreach_message_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      candidate_outreach_workspace: {
        Row: {
          bookmark_folder_id: number | null
          company_pitch: string | null
          created_at: string
          job_description: string | null
          sender_email: string | null
          signature: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bookmark_folder_id?: number | null
          company_pitch?: string | null
          created_at?: string
          job_description?: string | null
          sender_email?: string | null
          signature?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bookmark_folder_id?: number | null
          company_pitch?: string | null
          created_at?: string
          job_description?: string | null
          sender_email?: string | null
          signature?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_outreach_workspace_bookmark_folder_id_fkey"
            columns: ["bookmark_folder_id"]
            isOneToOne: false
            referencedRelation: "bookmark_folder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_outreach_workspace_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      company_code: {
        Row: {
          code: string
          company: string | null
          count: number
          created_at: string
          credit: number
          domain: string | null
          id: string
          limit: number
          text: string | null
        }
        Insert: {
          code?: string
          company?: string | null
          count?: number
          created_at?: string
          credit?: number
          domain?: string | null
          id?: string
          limit?: number
          text?: string | null
        }
        Update: {
          code?: string
          company?: string | null
          count?: number
          created_at?: string
          credit?: number
          domain?: string | null
          id?: string
          limit?: number
          text?: string | null
        }
        Relationships: []
      }
      company_db: {
        Row: {
          crunchbase_information: Json | null
          description: string | null
          employee_count_range: Json | null
          founded_year: number | null
          funding: Json | null
          funding_url: string | null
          id: number
          investors: string | null
          last_crunchbase_updated_at: string | null
          last_updated_at: string
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
          funding?: Json | null
          funding_url?: string | null
          id?: number
          investors?: string | null
          last_crunchbase_updated_at?: string | null
          last_updated_at?: string
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
          funding?: Json | null
          funding_url?: string | null
          id?: number
          investors?: string | null
          last_crunchbase_updated_at?: string | null
          last_updated_at?: string
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
      company_role_matched: {
        Row: {
          candid_id: string
          created_at: string
          feedback_text: string | null
          harper_memo: string | null
          id: string
          role_id: string
          status: string
          updated_at: string
        }
        Insert: {
          candid_id: string
          created_at?: string
          feedback_text?: string | null
          harper_memo?: string | null
          id?: string
          role_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          candid_id?: string
          created_at?: string
          feedback_text?: string | null
          harper_memo?: string | null
          id?: string
          role_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_role_matched_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_role_matched_role_id_fkey"
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
          created_at: string
          description: string | null
          expires_at: string | null
          external_jd_url: string | null
          information: Json | null
          location_text: string | null
          name: string
          posted_at: string | null
          priority: number | null
          role_id: string
          source_job_id: string | null
          source_provider: string | null
          source_type: string
          status: string
          type: string[]
          updated_at: string
          work_mode: string | null
        }
        Insert: {
          company_workspace_id: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          external_jd_url?: string | null
          information?: Json | null
          location_text?: string | null
          name: string
          posted_at?: string | null
          priority?: number | null
          role_id?: string
          source_job_id?: string | null
          source_provider?: string | null
          source_type?: string
          status?: string
          type?: string[]
          updated_at?: string
          work_mode?: string | null
        }
        Update: {
          company_workspace_id?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          external_jd_url?: string | null
          information?: Json | null
          location_text?: string | null
          name?: string
          posted_at?: string | null
          priority?: number | null
          role_id?: string
          source_job_id?: string | null
          source_provider?: string | null
          source_type?: string
          status?: string
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
      company_user_workspace: {
        Row: {
          company_user_id: string
          company_workspace_id: string
          created_at: string
          id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          company_user_id: string
          company_workspace_id: string
          created_at?: string
          id?: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          company_user_id?: string
          company_workspace_id?: string
          created_at?: string
          id?: string
          role?: string | null
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
        ]
      }
      company_users: {
        Row: {
          company: string | null
          company_description: string | null
          created_at: string
          email: string | null
          is_authenticated: boolean
          is_custom: boolean
          location: string | null
          name: string | null
          profile_picture: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          company_description?: string | null
          created_at?: string
          email?: string | null
          is_authenticated?: boolean
          is_custom?: boolean
          location?: string | null
          name?: string | null
          profile_picture?: string | null
          role?: string | null
          user_id?: string
        }
        Update: {
          company?: string | null
          company_description?: string | null
          created_at?: string
          email?: string | null
          is_authenticated?: boolean
          is_custom?: boolean
          location?: string | null
          name?: string | null
          profile_picture?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      company_workspace: {
        Row: {
          company_db_id: number | null
          company_description: string | null
          company_name: string
          company_workspace_id: string
          created_at: string
          homepage_url: string | null
          linkedin_url: string | null
          logo_storage_path: string | null
          logo_url: string | null
          updated_at: string
        }
        Insert: {
          company_db_id?: number | null
          company_description?: string | null
          company_name: string
          company_workspace_id?: string
          created_at?: string
          homepage_url?: string | null
          linkedin_url?: string | null
          logo_storage_path?: string | null
          logo_url?: string | null
          updated_at?: string
        }
        Update: {
          company_db_id?: number | null
          company_description?: string | null
          company_name?: string
          company_workspace_id?: string
          created_at?: string
          homepage_url?: string | null
          linkedin_url?: string | null
          logo_storage_path?: string | null
          logo_url?: string | null
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
      credit_request: {
        Row: {
          created_at: string
          credit_num: number | null
          id: number
          is_done: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credit_num?: number | null
          id?: number
          is_done?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credit_num?: number | null
          id?: number
          is_done?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_request_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
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
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          from?: string | null
          id?: number
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          from?: string | null
          id?: number
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
      github_profile_backup_20260325: {
        Row: {
          account_type: string | null
          avatar_url: string | null
          bio: string | null
          blog: string | null
          candid_id: string | null
          company: string | null
          created_at: string | null
          email: string | null
          followers: number | null
          following: number | null
          github_id: number | null
          github_url: string | null
          github_username: string | null
          id: string | null
          inserted_at: string | null
          is_hireable: boolean | null
          is_site_admin: boolean | null
          last_fetched_at: string | null
          location: string | null
          name: string | null
          node_id: string | null
          public_gists: number | null
          public_repos: number | null
          search_text: string | null
          twitter_username: string | null
          updated_at: string | null
        }
        Insert: {
          account_type?: string | null
          avatar_url?: string | null
          bio?: string | null
          blog?: string | null
          candid_id?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          followers?: number | null
          following?: number | null
          github_id?: number | null
          github_url?: string | null
          github_username?: string | null
          id?: string | null
          inserted_at?: string | null
          is_hireable?: boolean | null
          is_site_admin?: boolean | null
          last_fetched_at?: string | null
          location?: string | null
          name?: string | null
          node_id?: string | null
          public_gists?: number | null
          public_repos?: number | null
          search_text?: string | null
          twitter_username?: string | null
          updated_at?: string | null
        }
        Update: {
          account_type?: string | null
          avatar_url?: string | null
          bio?: string | null
          blog?: string | null
          candid_id?: string | null
          company?: string | null
          created_at?: string | null
          email?: string | null
          followers?: number | null
          following?: number | null
          github_id?: number | null
          github_url?: string | null
          github_username?: string | null
          id?: string | null
          inserted_at?: string | null
          is_hireable?: boolean | null
          is_site_admin?: boolean | null
          last_fetched_at?: string | null
          location?: string | null
          name?: string | null
          node_id?: string | null
          public_gists?: number | null
          public_repos?: number | null
          search_text?: string | null
          twitter_username?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      github_repo_contribution_old_20260326: {
        Row: {
          candid_id: string | null
          commits: number | null
          contributors: number | null
          created_at: string | null
          default_rank_score: number | null
          description: string | null
          forks: number | null
          github_profile_id: string | null
          id: number | null
          languages: Json | null
          last_contrib_at: string | null
          last_updated_at: string | null
          merged_prs: number | null
          readme_excerpt: string | null
          repo: string | null
          repo_id: string | null
          role: string | null
          search_text: string | null
          search_text_fts: unknown
          stars: number | null
          topics: string | null
          updated_at: string | null
        }
        Insert: {
          candid_id?: string | null
          commits?: number | null
          contributors?: number | null
          created_at?: string | null
          default_rank_score?: number | null
          description?: string | null
          forks?: number | null
          github_profile_id?: string | null
          id?: number | null
          languages?: Json | null
          last_contrib_at?: string | null
          last_updated_at?: string | null
          merged_prs?: number | null
          readme_excerpt?: string | null
          repo?: string | null
          repo_id?: string | null
          role?: string | null
          search_text?: string | null
          search_text_fts?: unknown
          stars?: number | null
          topics?: string | null
          updated_at?: string | null
        }
        Update: {
          candid_id?: string | null
          commits?: number | null
          contributors?: number | null
          created_at?: string | null
          default_rank_score?: number | null
          description?: string | null
          forks?: number | null
          github_profile_id?: string | null
          id?: number | null
          languages?: Json | null
          last_contrib_at?: string | null
          last_updated_at?: string | null
          merged_prs?: number | null
          readme_excerpt?: string | null
          repo?: string | null
          repo_id?: string | null
          role?: string | null
          search_text?: string | null
          search_text_fts?: unknown
          stars?: number | null
          topics?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "github_repo_contribution_candid_id_fkey"
            columns: ["candid_id"]
            isOneToOne: false
            referencedRelation: "candid"
            referencedColumns: ["id"]
          },
        ]
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
      insight_checklist_items: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: number
          is_active: boolean | null
          key: string
          label: string
          priority: number | null
          prompt_hint: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: number
          is_active?: boolean | null
          key: string
          label: string
          priority?: number | null
          prompt_hint?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: number
          is_active?: boolean | null
          key?: string
          label?: string
          priority?: number | null
          prompt_hint?: string | null
        }
        Relationships: []
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
      logs: {
        Row: {
          created_at: string
          id: number
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      memory: {
        Row: {
          content: string | null
          created_at: string
          id: number
          last_updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: number
          last_updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: number
          last_updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
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
      papers: {
        Row: {
          abstract: string | null
          canonical_key: string | null
          cited_by_scholar_link: string | null
          created_at: string
          external_link: string | null
          id: string
          pub_year: number | null
          published_at: string | null
          scholar_link: string | null
          title: string
          total_citations: number
          year_citations: Json
        }
        Insert: {
          abstract?: string | null
          canonical_key?: string | null
          cited_by_scholar_link?: string | null
          created_at?: string
          external_link?: string | null
          id?: string
          pub_year?: number | null
          published_at?: string | null
          scholar_link?: string | null
          title: string
          total_citations?: number
          year_citations?: Json
        }
        Update: {
          abstract?: string | null
          canonical_key?: string | null
          cited_by_scholar_link?: string | null
          created_at?: string
          external_link?: string | null
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
          abstract: string | null
          candid_id: string | null
          citation_num: number | null
          created_at: string
          id: number
          link: string | null
          published_at: string | null
          title: string | null
        }
        Insert: {
          abstract?: string | null
          candid_id?: string | null
          citation_num?: number | null
          created_at?: string
          id?: number
          link?: string | null
          published_at?: string | null
          title?: string | null
        }
        Update: {
          abstract?: string | null
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
          author_order: number | null
          created_at: string
          is_first_author: boolean | null
          paper_id: string
          scholar_profile_id: string
        }
        Insert: {
          author_order?: number | null
          created_at?: string
          is_first_author?: boolean | null
          paper_id: string
          scholar_profile_id: string
        }
        Update: {
          author_order?: number | null
          created_at?: string
          is_first_author?: boolean | null
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
          identifier: string | null
          links: Json | null
        }
        Insert: {
          candid_id?: string
          created_at?: string
          identifier?: string | null
          links?: Json | null
        }
        Update: {
          candid_id?: string
          created_at?: string
          identifier?: string | null
          links?: Json | null
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
      talent_conversations: {
        Row: {
          created_at: string
          id: string
          relief_nudge_sent: boolean
          resume_file_name: string | null
          resume_links: string[]
          resume_text: string | null
          stage: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          relief_nudge_sent?: boolean
          resume_file_name?: string | null
          resume_links?: string[]
          resume_text?: string | null
          stage?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relief_nudge_sent?: boolean
          resume_file_name?: string | null
          resume_links?: string[]
          resume_text?: string | null
          stage?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_conversations_user_id_fkey"
            columns: ["user_id"]
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
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_internal: {
        Row: {
          content: string
          created_at: string
          created_by: string
          from_email: string | null
          id: number
          subject: string | null
          talent_id: string | null
          to_email: string | null
          type: string
          waitlist_id: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          from_email?: string | null
          id?: number
          subject?: string | null
          talent_id?: string | null
          to_email?: string | null
          type: string
          waitlist_id: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          from_email?: string | null
          id?: number
          subject?: string | null
          talent_id?: string | null
          to_email?: string | null
          type?: string
          waitlist_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "talent_internal_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "talent_internal_waitlist_id_fkey"
            columns: ["waitlist_id"]
            isOneToOne: false
            referencedRelation: "harper_waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: number
          message_type: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: number
          message_type?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: number
          message_type?: string
          role?: string
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
        ]
      }
      talent_notification: {
        Row: {
          created_at: string
          id: number
          is_read: boolean | null
          message: string | null
          talent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          is_read?: boolean | null
          message?: string | null
          talent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          is_read?: boolean | null
          message?: string | null
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_notification_talent_id_fkey"
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
          dismissed_at: string | null
          feedback: string | null
          feedback_at: string | null
          feedback_reason: string | null
          id: string
          kind: string
          model_version: string | null
          opportunity_type: string
          rank: number | null
          recommendation_reasons: Json
          recommended_at: string
          role_id: string
          saved_stage: string | null
          score: number | null
          talent_id: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          feedback?: string | null
          feedback_at?: string | null
          feedback_reason?: string | null
          id?: string
          kind?: string
          model_version?: string | null
          opportunity_type?: string
          rank?: number | null
          recommendation_reasons?: Json
          recommended_at?: string
          role_id: string
          saved_stage?: string | null
          score?: number | null
          talent_id: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          clicked_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          feedback?: string | null
          feedback_at?: string | null
          feedback_reason?: string | null
          id?: string
          kind?: string
          model_version?: string | null
          opportunity_type?: string
          rank?: number | null
          recommendation_reasons?: Json
          recommended_at?: string
          role_id?: string
          saved_stage?: string | null
          score?: number | null
          talent_id?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
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
      talent_publications: {
        Row: {
          abstract: string | null
          citation_num: number | null
          created_at: string
          id: number
          link: string | null
          memo: string | null
          published_at: string | null
          talent_id: string
          title: string | null
        }
        Insert: {
          abstract?: string | null
          citation_num?: number | null
          created_at?: string
          id?: number
          link?: string | null
          memo?: string | null
          published_at?: string | null
          talent_id: string
          title?: string | null
        }
        Update: {
          abstract?: string | null
          citation_num?: number | null
          created_at?: string
          id?: number
          link?: string | null
          memo?: string | null
          published_at?: string | null
          talent_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_publications_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_setting: {
        Row: {
          blocked_companies: string[]
          career_move_intent: string | null
          created_at: string
          engagement_types: string[]
          preferred_locations: string[]
          profile_visibility: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_companies?: string[]
          career_move_intent?: string | null
          created_at?: string
          engagement_types?: string[]
          preferred_locations?: string[]
          profile_visibility?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_companies?: string[]
          career_move_intent?: string | null
          created_at?: string
          engagement_types?: string[]
          preferred_locations?: string[]
          profile_visibility?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_setting_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "talent_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      talent_users: {
        Row: {
          bio: string | null
          career_profile: Json
          career_profile_initialized_at: string | null
          created_at: string
          email: string | null
          headline: string | null
          location: string | null
          name: string | null
          network_application: Json
          network_claimed_at: string | null
          network_source_talent_id: string | null
          network_waitlist_id: number | null
          profile_picture: string | null
          resume_file_name: string | null
          resume_links: string[]
          resume_storage_path: string | null
          resume_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          career_profile?: Json
          career_profile_initialized_at?: string | null
          created_at?: string
          email?: string | null
          headline?: string | null
          location?: string | null
          name?: string | null
          network_application?: Json
          network_claimed_at?: string | null
          network_source_talent_id?: string | null
          network_waitlist_id?: number | null
          profile_picture?: string | null
          resume_file_name?: string | null
          resume_links?: string[]
          resume_storage_path?: string | null
          resume_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          career_profile?: Json
          career_profile_initialized_at?: string | null
          created_at?: string
          email?: string | null
          headline?: string | null
          location?: string | null
          name?: string | null
          network_application?: Json
          network_claimed_at?: string | null
          network_source_talent_id?: string | null
          network_waitlist_id?: number | null
          profile_picture?: string | null
          resume_file_name?: string | null
          resume_links?: string[]
          resume_storage_path?: string | null
          resume_text?: string | null
          updated_at?: string
          user_id?: string
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
      worker_runtime_settings: {
        Row: {
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
      [_ in never]: never
    }
    Functions: {
      can_access_candidate_profile: {
        Args: { target_candid_id: string }
        Returns: boolean
      }
      candid_ids_scholar_and_pattern: {
        Args: { pattern: string }
        Returns: string[]
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
      deduct_user_credits: {
        Args: { amount_to_deduct: number }
        Returns: number
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
      filter_candidates_by_pattern: {
        Args: { candidate_ids: string[]; pattern: string }
        Returns: string[]
      }
      find_candid_ids_by_link_pattern: {
        Args: { p_pattern: string }
        Returns: {
          id: string
        }[]
      }
      get_scholar_candidate_ids: { Args: never; Returns: string[] }
      is_admin: { Args: never; Returns: boolean }
      reset_org_db_seq: { Args: never; Returns: undefined }
      reveal_candidate_profile: {
        Args: { target_candid_id: string }
        Returns: {
          already_revealed: boolean
          new_balance: number
        }[]
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
      stop_run_worker: { Args: { target_run_id: string }; Returns: undefined }
      update_repo_ids: { Args: never; Returns: undefined }
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
