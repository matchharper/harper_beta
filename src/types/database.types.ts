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
      candid: {
        Row: {
          bio: string | null
          created_at: string
          email: string | null
          fts: unknown
          headline: string | null
          id: string
          is_korean: boolean | null
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
          is_korean?: boolean | null
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
          is_korean?: boolean | null
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
        }
        Insert: {
          candid_id: string
          created_at?: string
          identifier: string
          is_current?: boolean
        }
        Update: {
          candid_id?: string
          created_at?: string
          identifier?: string
          is_current?: boolean
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
      company_code: {
        Row: {
          code: string | null
          company: string | null
          count: number
          created_at: string
          domain: string | null
          id: string
        }
        Insert: {
          code?: string | null
          company?: string | null
          count?: number
          created_at?: string
          domain?: string | null
          id?: string
        }
        Update: {
          code?: string | null
          company?: string | null
          count?: number
          created_at?: string
          domain?: string | null
          id?: string
        }
        Relationships: []
      }
      company_db: {
        Row: {
          description: string | null
          employee_count_range: Json | null
          founded_year: number | null
          funding: Json | null
          funding_url: string | null
          id: number
          investors: string | null
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
          description?: string | null
          employee_count_range?: Json | null
          founded_year?: number | null
          funding?: Json | null
          funding_url?: string | null
          id?: number
          investors?: string | null
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
          description?: string | null
          employee_count_range?: Json | null
          founded_year?: number | null
          funding?: Json | null
          funding_url?: string | null
          id?: number
          investors?: string | null
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
      company_users: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          is_authenticated: boolean
          location: string | null
          name: string | null
          profile_picture: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          is_authenticated?: boolean
          location?: string | null
          name?: string | null
          profile_picture?: string | null
          role?: string | null
          user_id?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          is_authenticated?: boolean
          location?: string | null
          name?: string | null
          profile_picture?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      connection: {
        Row: {
          candid_id: string | null
          created_at: string
          id: number
          last_updated_at: string
          typed: number | null
          user_id: string | null
        }
        Insert: {
          candid_id?: string | null
          created_at?: string
          id?: number
          last_updated_at?: string
          typed?: number | null
          user_id?: string | null
        }
        Update: {
          candid_id?: string | null
          created_at?: string
          id?: number
          last_updated_at?: string
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
          remain_credit: number | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          charged_credit?: number | null
          created_at?: string
          id?: number
          remain_credit?: number | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          charged_credit?: number | null
          created_at?: string
          id?: number
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
      crunchbase_company: {
        Row: {
          company_id: number | null
          created_at: string
          id: number
          is_crunchbase_done: boolean
        }
        Insert: {
          company_id?: number | null
          created_at?: string
          id?: number
          is_crunchbase_done?: boolean
        }
        Update: {
          company_id?: number | null
          created_at?: string
          id?: number
          is_crunchbase_done?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "crunchbase_company_company_id_fkey"
            columns: ["company_id"]
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
          id: number
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: number
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "company_users"
            referencedColumns: ["user_id"]
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
          additional: string | null
          company: string | null
          company_link: string | null
          created_at: string
          email: string
          expect: string | null
          is_mobile: boolean | null
          name: string | null
          needs: string[] | null
          role: string | null
          salary: string | null
          size: string | null
        }
        Insert: {
          additional?: string | null
          company?: string | null
          company_link?: string | null
          created_at?: string
          email: string
          expect?: string | null
          is_mobile?: boolean | null
          name?: string | null
          needs?: string[] | null
          role?: string | null
          salary?: string | null
          size?: string | null
        }
        Update: {
          additional?: string | null
          company?: string | null
          company_link?: string | null
          created_at?: string
          email?: string
          expect?: string | null
          is_mobile?: boolean | null
          name?: string | null
          needs?: string[] | null
          role?: string | null
          salary?: string | null
          size?: string | null
        }
        Relationships: []
      }
      landing_logs: {
        Row: {
          created_at: string
          id: number
          type: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          type?: string | null
        }
        Update: {
          created_at?: string
          id?: number
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
      new_people: {
        Row: {
          content: string | null
          created_at: string
          linkedin_id: string
          name: string | null
          url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          linkedin_id: string
          name?: string | null
          url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          linkedin_id?: string
          name?: string | null
          url?: string | null
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
          retries: number
          user_id: string
        }
        Insert: {
          created_at?: string
          is_deleted?: boolean
          query?: string | null
          query_id?: string
          query_keyword?: string | null
          raw_input_text?: string | null
          retries?: number
          user_id: string
        }
        Update: {
          created_at?: string
          is_deleted?: boolean
          query?: string | null
          query_id?: string
          query_keyword?: string | null
          raw_input_text?: string | null
          retries?: number
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
      runs: {
        Row: {
          backend_pid: number | null
          created_at: string
          criteria: string[] | null
          feedback: number
          id: string
          latency: number | null
          limit: number
          message_id: number | null
          query_id: string | null
          query_text: string | null
          results: Json | null
          sql_query: string | null
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
          limit?: number
          message_id?: number | null
          query_id?: string | null
          query_text?: string | null
          results?: Json | null
          sql_query?: string | null
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
          limit?: number
          message_id?: number | null
          query_id?: string | null
          query_text?: string | null
          results?: Json | null
          sql_query?: string | null
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
          message_id: number | null
          page_idx: number | null
          run_id: string | null
        }
        Insert: {
          candidate_ids?: Json[] | null
          created_at?: string
          id?: number
          message_id?: number | null
          page_idx?: number | null
          run_id?: string | null
        }
        Update: {
          candidate_ids?: Json[] | null
          created_at?: string
          id?: number
          message_id?: number | null
          page_idx?: number | null
          run_id?: string | null
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
      settings: {
        Row: {
          created_at: string
          is_exclude_shortlist: boolean | null
          is_korean: boolean | null
          max_years_exp: number | null
          min_years_exp: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          is_exclude_shortlist?: boolean | null
          is_korean?: boolean | null
          max_years_exp?: number | null
          min_years_exp?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          is_exclude_shortlist?: boolean | null
          is_korean?: boolean | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      reset_org_db_seq: { Args: never; Returns: undefined }
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
