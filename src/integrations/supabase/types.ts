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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_goals: {
        Row: {
          agent_id: string
          agent_name: string
          current_value: number
          decided_at: string | null
          decided_by: string | null
          id: string
          metric: string
          reject_reason: string | null
          status: string
          suggested_at: string
          suggested_value: number
          suggestion_id: string | null
        }
        Insert: {
          agent_id: string
          agent_name?: string
          current_value?: number
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          metric?: string
          reject_reason?: string | null
          status?: string
          suggested_at?: string
          suggested_value?: number
          suggestion_id?: string | null
        }
        Update: {
          agent_id?: string
          agent_name?: string
          current_value?: number
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          metric?: string
          reject_reason?: string | null
          status?: string
          suggested_at?: string
          suggested_value?: number
          suggestion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_goals_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "delma_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_notifications: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          metrics: Json
          period_days: number
          sent_by: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metrics?: Json
          period_days?: number
          sent_by: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metrics?: Json
          period_days?: number
          sent_by?: string
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          created_at: string | null
          default_model: string | null
          display_name: string
          id: string
          is_active: boolean | null
          models: Json | null
          provider: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_model?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          models?: Json | null
          provider: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_model?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          models?: Json | null
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      brain_reports: {
        Row: {
          content: string
          context: string | null
          created_at: string
          id: string
          period: number
          provider: string
          schedule_type: string | null
        }
        Insert: {
          content?: string
          context?: string | null
          created_at?: string
          id?: string
          period?: number
          provider?: string
          schedule_type?: string | null
        }
        Update: {
          content?: string
          context?: string | null
          created_at?: string
          id?: string
          period?: number
          provider?: string
          schedule_type?: string | null
        }
        Relationships: []
      }
      channel_announcement_reads: {
        Row: {
          created_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_announcement_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "internal_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          created_at: string
          department_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "internal_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          channel: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          name_edited: boolean
          notes: string | null
          phone: string | null
          tags: string[]
        }
        Insert: {
          avatar_url?: string | null
          channel?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          name_edited?: boolean
          notes?: string | null
          phone?: string | null
          tags?: string[]
        }
        Update: {
          avatar_url?: string | null
          channel?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          name_edited?: boolean
          notes?: string | null
          phone?: string | null
          tags?: string[]
        }
        Relationships: []
      }
      conversation_logs: {
        Row: {
          agent_status_at_finalization: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          channel: string | null
          contact_name: string
          contact_notes: string | null
          contact_phone: string | null
          conversation_id: string
          department_id: string | null
          department_name: string | null
          finalized_at: string
          finalized_by: string | null
          finalized_by_name: string | null
          id: string
          messages: Json
          priority: string
          protocol: string | null
          reset_at: string | null
          started_at: string
          tags: string[]
          total_messages: number
          wait_time: number | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          agent_status_at_finalization?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          channel?: string | null
          contact_name: string
          contact_notes?: string | null
          contact_phone?: string | null
          conversation_id: string
          department_id?: string | null
          department_name?: string | null
          finalized_at?: string
          finalized_by?: string | null
          finalized_by_name?: string | null
          id?: string
          messages?: Json
          priority?: string
          protocol?: string | null
          reset_at?: string | null
          started_at: string
          tags?: string[]
          total_messages?: number
          wait_time?: number | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          agent_status_at_finalization?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          channel?: string | null
          contact_name?: string
          contact_notes?: string | null
          contact_phone?: string | null
          conversation_id?: string
          department_id?: string | null
          department_name?: string | null
          finalized_at?: string
          finalized_by?: string | null
          finalized_by_name?: string | null
          id?: string
          messages?: Json
          priority?: string
          protocol?: string | null
          reset_at?: string | null
          started_at?: string
          tags?: string[]
          total_messages?: number
          wait_time?: number | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_logs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_logs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_logs_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_logs_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          assigned_to_robot: string | null
          channel: string | null
          contact_id: string
          created_at: string
          department_id: string
          external_id: string | null
          handoff_summary: string | null
          id: string
          last_message_preview: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          protocol: string | null
          robot_lock_until: string | null
          robot_transferred: boolean
          sdr_deal_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          tags: string[]
          updated_at: string
          wait_time: number | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_robot?: string | null
          channel?: string | null
          contact_id: string
          created_at?: string
          department_id: string
          external_id?: string | null
          handoff_summary?: string | null
          id?: string
          last_message_preview?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          protocol?: string | null
          robot_lock_until?: string | null
          robot_transferred?: boolean
          sdr_deal_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[]
          updated_at?: string
          wait_time?: number | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_robot?: string | null
          channel?: string | null
          contact_id?: string
          created_at?: string
          department_id?: string
          external_id?: string | null
          handoff_summary?: string | null
          id?: string
          last_message_preview?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          protocol?: string | null
          robot_lock_until?: string | null
          robot_transferred?: boolean
          sdr_deal_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[]
          updated_at?: string
          wait_time?: number | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_robot_fkey"
            columns: ["assigned_to_robot"]
            isOneToOne: false
            referencedRelation: "robots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_sdr_deal_id_fkey"
            columns: ["sdr_deal_id"]
            isOneToOne: false
            referencedRelation: "sdr_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      delma_anomalies: {
        Row: {
          affected_entity: string | null
          affected_entity_id: string | null
          auto_suggestion_id: string | null
          description: string
          detected_at: string
          id: string
          metric_baseline: number | null
          metric_current: number | null
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          type: string
        }
        Insert: {
          affected_entity?: string | null
          affected_entity_id?: string | null
          auto_suggestion_id?: string | null
          description: string
          detected_at?: string
          id?: string
          metric_baseline?: number | null
          metric_current?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          type: string
        }
        Update: {
          affected_entity?: string | null
          affected_entity_id?: string | null
          auto_suggestion_id?: string | null
          description?: string
          detected_at?: string
          id?: string
          metric_baseline?: number | null
          metric_current?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          type?: string
        }
        Relationships: []
      }
      delma_chat_logs: {
        Row: {
          action_type: string
          command: string
          created_at: string
          id: string
          result: string
          result_data: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          command: string
          created_at?: string
          id?: string
          result?: string
          result_data?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          command?: string
          created_at?: string
          id?: string
          result?: string
          result_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      delma_memory: {
        Row: {
          content: Json
          created_at: string
          expires_at: string
          id: string
          related_suggestion_id: string | null
          source: string
          type: string
          weight: number
        }
        Insert: {
          content?: Json
          created_at?: string
          expires_at?: string
          id?: string
          related_suggestion_id?: string | null
          source?: string
          type?: string
          weight?: number
        }
        Update: {
          content?: Json
          created_at?: string
          expires_at?: string
          id?: string
          related_suggestion_id?: string | null
          source?: string
          type?: string
          weight?: number
        }
        Relationships: []
      }
      delma_suggestions: {
        Row: {
          category: string
          confidence_score: number
          content: Json
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          justification: string
          memories_used: Json
          reject_reason: string | null
          status: string
          title: string
        }
        Insert: {
          category?: string
          confidence_score?: number
          content?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          justification?: string
          memories_used?: Json
          reject_reason?: string | null
          status?: string
          title: string
        }
        Update: {
          category?: string
          confidence_score?: number
          content?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          justification?: string
          memories_used?: Json
          reject_reason?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          auto_priority: boolean
          color: string
          created_at: string
          description: string | null
          id: string
          max_wait_time: number | null
          name: string
        }
        Insert: {
          auto_priority?: boolean
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          max_wait_time?: number | null
          name: string
        }
        Update: {
          auto_priority?: boolean
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          max_wait_time?: number | null
          name?: string
        }
        Relationships: []
      }
      franqueado_cities: {
        Row: {
          city: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "franqueado_cities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franqueado_cities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          google_email: string | null
          id: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          google_email?: string | null
          id?: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      internal_channels: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          channel_id: string | null
          content: string
          created_at: string
          id: string
          receiver_id: string | null
          sender_id: string
        }
        Insert: {
          channel_id?: string | null
          content: string
          created_at?: string
          id?: string
          receiver_id?: string | null
          sender_id: string
        }
        Update: {
          channel_id?: string | null
          content?: string
          created_at?: string
          id?: string
          receiver_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "internal_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      message_deletion_logs: {
        Row: {
          contact_name: string | null
          contact_phone: string | null
          conversation_id: string
          deleted_at: string
          deleted_by: string
          deleted_by_name: string
          id: string
          message_content: string | null
          message_created_at: string | null
          message_id: string
          message_sender_name: string | null
          reason: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone?: string | null
          conversation_id: string
          deleted_at?: string
          deleted_by: string
          deleted_by_name: string
          id?: string
          message_content?: string | null
          message_created_at?: string | null
          message_id: string
          message_sender_name?: string | null
          reason: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string | null
          conversation_id?: string
          deleted_at?: string
          deleted_by?: string
          deleted_by_name?: string
          id?: string
          message_content?: string | null
          message_created_at?: string | null
          message_id?: string
          message_sender_name?: string | null
          reason?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          external_message_id: string | null
          id: string
          message_id: string | null
          sender_phone: string | null
        }
        Insert: {
          created_at?: string | null
          emoji: string
          external_message_id?: string | null
          id?: string
          message_id?: string | null
          sender_phone?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string
          external_message_id?: string | null
          id?: string
          message_id?: string | null
          sender_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          deleted: boolean | null
          delivery_status: string | null
          external_id: string | null
          id: string
          message_type: string
          sender_id: string | null
          sender_name: string
          status: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          deleted?: boolean | null
          delivery_status?: string | null
          external_id?: string | null
          id?: string
          message_type?: string
          sender_id?: string | null
          sender_name: string
          status?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          deleted?: boolean | null
          delivery_status?: string | null
          external_id?: string | null
          id?: string
          message_type?: string
          sender_id?: string | null
          sender_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_webhook_audit: {
        Row: {
          connection_id: string | null
          contact_id: string | null
          conversation_id: string | null
          decision: string
          event_kind: string
          from_phone: string | null
          id: string
          phone_number_id_payload: string | null
          raw_snippet: string | null
          reason: string | null
          received_at: string
          wamid: string | null
        }
        Insert: {
          connection_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          decision?: string
          event_kind?: string
          from_phone?: string | null
          id?: string
          phone_number_id_payload?: string | null
          raw_snippet?: string | null
          reason?: string | null
          received_at?: string
          wamid?: string | null
        }
        Update: {
          connection_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          decision?: string
          event_kind?: string
          from_phone?: string | null
          id?: string
          phone_number_id_payload?: string | null
          raw_snippet?: string | null
          reason?: string | null
          received_at?: string
          wamid?: string | null
        }
        Relationships: []
      }
      profile_departments: {
        Row: {
          department_id: string
          id: string
          profile_id: string
        }
        Insert: {
          department_id: string
          id?: string
          profile_id: string
        }
        Update: {
          department_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_departments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_departments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          pause_started_at: string | null
          phone: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          pause_started_at?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          pause_started_at?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      quick_message_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_message_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_message_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_messages: {
        Row: {
          category: string
          content: string
          created_at: string
          department_id: string | null
          id: string
          is_favorite: boolean
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_favorite?: boolean
          title: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          department_id?: string | null
          id?: string
          is_favorite?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_messages_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_config: {
        Row: {
          conversations_goal_daily: number
          conversations_goal_monthly: number
          conversations_goal_weekly: number
          created_at: string
          department_id: string
          id: string
          is_active: boolean
          tma_green_limit: number
          tma_yellow_limit: number
          tme_green_limit: number
          tme_yellow_limit: number
          updated_at: string
          weight_conversations: number
          weight_tma: number
          weight_tme: number
        }
        Insert: {
          conversations_goal_daily?: number
          conversations_goal_monthly?: number
          conversations_goal_weekly?: number
          created_at?: string
          department_id: string
          id?: string
          is_active?: boolean
          tma_green_limit?: number
          tma_yellow_limit?: number
          tme_green_limit?: number
          tme_yellow_limit?: number
          updated_at?: string
          weight_conversations?: number
          weight_tma?: number
          weight_tme?: number
        }
        Update: {
          conversations_goal_daily?: number
          conversations_goal_monthly?: number
          conversations_goal_weekly?: number
          created_at?: string
          department_id?: string
          id?: string
          is_active?: boolean
          tma_green_limit?: number
          tma_yellow_limit?: number
          tme_green_limit?: number
          tme_yellow_limit?: number
          updated_at?: string
          weight_conversations?: number
          weight_tma?: number
          weight_tme?: number
        }
        Relationships: [
          {
            foreignKeyName: "ranking_config_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedule: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          hour_of_day: number
          id: string
          is_active: boolean
          last_run_at: string | null
          next_run_at: string | null
          schedule_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          hour_of_day?: number
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          schedule_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          hour_of_day?: number
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          next_run_at?: string | null
          schedule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedule_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedule_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      report_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          department_id: string | null
          department_name: string | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          reset_type: string
          totals: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          department_id?: string | null
          department_name?: string | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          reset_type?: string
          totals?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          department_id?: string | null
          department_name?: string | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          reset_type?: string
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_snapshots_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      robot_change_schedule: {
        Row: {
          affected_section: string | null
          applied_at: string | null
          applied_by: string | null
          created_at: string
          current_instruction: string
          id: string
          new_instruction: string
          robot_id: string
          scheduled_for: string
          status: string
          suggestion_id: string | null
        }
        Insert: {
          affected_section?: string | null
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          current_instruction: string
          id?: string
          new_instruction: string
          robot_id: string
          scheduled_for: string
          status?: string
          suggestion_id?: string | null
        }
        Update: {
          affected_section?: string | null
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          current_instruction?: string
          id?: string
          new_instruction?: string
          robot_id?: string
          scheduled_for?: string
          status?: string
          suggestion_id?: string | null
        }
        Relationships: []
      }
      robot_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          robot_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          robot_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          robot_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "robot_schedules_robot_id_fkey"
            columns: ["robot_id"]
            isOneToOne: false
            referencedRelation: "robots"
            referencedColumns: ["id"]
          },
        ]
      }
      robot_training_suggestions: {
        Row: {
          applied_at: string | null
          compliance_notes: string | null
          compliance_status: string | null
          content: string
          created_at: string
          id: string
          knowledge_base_snapshot: Json | null
          knowledge_base_updated_at: string | null
          reasoning: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          robot_id: string
          robot_name: string
          status: string
          suggestion_type: string
          title: string
        }
        Insert: {
          applied_at?: string | null
          compliance_notes?: string | null
          compliance_status?: string | null
          content: string
          created_at?: string
          id?: string
          knowledge_base_snapshot?: Json | null
          knowledge_base_updated_at?: string | null
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          robot_id: string
          robot_name: string
          status?: string
          suggestion_type?: string
          title: string
        }
        Update: {
          applied_at?: string | null
          compliance_notes?: string | null
          compliance_status?: string | null
          content?: string
          created_at?: string
          id?: string
          knowledge_base_snapshot?: Json | null
          knowledge_base_updated_at?: string | null
          reasoning?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          robot_id?: string
          robot_name?: string
          status?: string
          suggestion_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "robot_training_suggestions_robot_id_fkey"
            columns: ["robot_id"]
            isOneToOne: false
            referencedRelation: "robots"
            referencedColumns: ["id"]
          },
        ]
      }
      robots: {
        Row: {
          auto_assign: boolean
          avatar_url: string | null
          channels: string[]
          created_at: string
          created_by: string | null
          departments: string[]
          description: string | null
          finalization_message: string | null
          id: string
          instructions: string | null
          intelligence: string
          last_triggered: string | null
          manually_activated: boolean
          max_tokens: number
          messages_count: number
          name: string
          qa_pairs: Json
          reference_links: Json
          send_audio: string
          status: string
          tone: string
          tools: Json
          updated_at: string
        }
        Insert: {
          auto_assign?: boolean
          avatar_url?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          departments?: string[]
          description?: string | null
          finalization_message?: string | null
          id?: string
          instructions?: string | null
          intelligence?: string
          last_triggered?: string | null
          manually_activated?: boolean
          max_tokens?: number
          messages_count?: number
          name: string
          qa_pairs?: Json
          reference_links?: Json
          send_audio?: string
          status?: string
          tone?: string
          tools?: Json
          updated_at?: string
        }
        Update: {
          auto_assign?: boolean
          avatar_url?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          departments?: string[]
          description?: string | null
          finalization_message?: string | null
          id?: string
          instructions?: string | null
          intelligence?: string
          last_triggered?: string | null
          manually_activated?: boolean
          max_tokens?: number
          messages_count?: number
          name?: string
          qa_pairs?: Json
          reference_links?: Json
          send_audio?: string
          status?: string
          tone?: string
          tools?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "robots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "robots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_appointments: {
        Row: {
          attendees: string[]
          contact_id: string | null
          created_at: string
          date: string
          description: string | null
          duration: number
          google_event_id: string | null
          google_meet_url: string | null
          id: string
          meeting_url: string | null
          metadata: Json | null
          next_transcript_check: string | null
          processing_status: string | null
          status: string
          time: string
          title: string
          transcript_import_attempts: number | null
          transcript_import_error: string | null
          transcription_summary: string | null
          transcription_text: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attendees?: string[]
          contact_id?: string | null
          created_at?: string
          date: string
          description?: string | null
          duration?: number
          google_event_id?: string | null
          google_meet_url?: string | null
          id?: string
          meeting_url?: string | null
          metadata?: Json | null
          next_transcript_check?: string | null
          processing_status?: string | null
          status?: string
          time?: string
          title: string
          transcript_import_attempts?: number | null
          transcript_import_error?: string | null
          transcription_summary?: string | null
          transcription_text?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attendees?: string[]
          contact_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          duration?: number
          google_event_id?: string | null
          google_meet_url?: string | null
          id?: string
          meeting_url?: string | null
          metadata?: Json | null
          next_transcript_check?: string | null
          processing_status?: string | null
          status?: string
          time?: string
          title?: string
          transcript_import_attempts?: number | null
          transcript_import_error?: string | null
          transcription_summary?: string | null
          transcription_text?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sdr_appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_appointments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_appointments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_auto_config: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          keywords: string[]
          transfer_to_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          transfer_to_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          transfer_to_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdr_auto_config_transfer_to_user_id_fkey"
            columns: ["transfer_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_auto_config_transfer_to_user_id_fkey"
            columns: ["transfer_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_deal_activities: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          id: string
          is_completed: boolean
          scheduled_at: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          id?: string
          is_completed?: boolean
          scheduled_at?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          scheduled_at?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdr_deal_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_deal_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "sdr_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_deals: {
        Row: {
          company: string | null
          contact_id: string | null
          created_at: string
          due_date: string | null
          id: string
          last_customer_message_at: string | null
          lost_at: string | null
          lost_reason: string | null
          owner_id: string | null
          priority: string
          remarketing_attempts: number
          remarketing_stopped: boolean
          stage_id: string | null
          tags: string[]
          title: string
          updated_at: string
          value: number
          won_at: string | null
        }
        Insert: {
          company?: string | null
          contact_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          last_customer_message_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          owner_id?: string | null
          priority?: string
          remarketing_attempts?: number
          remarketing_stopped?: boolean
          stage_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Update: {
          company?: string | null
          contact_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          last_customer_message_at?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          owner_id?: string | null
          priority?: string
          remarketing_attempts?: number
          remarketing_stopped?: boolean
          stage_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sdr_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "sdr_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_pipeline_stages: {
        Row: {
          ai_trigger_criteria: string | null
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_ai_managed: boolean
          is_system: boolean
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          ai_trigger_criteria?: string | null
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_ai_managed?: boolean
          is_system?: boolean
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          ai_trigger_criteria?: string | null
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_ai_managed?: boolean
          is_system?: boolean
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      sdr_remarketing_config: {
        Row: {
          created_at: string
          days_inactive: number
          id: string
          is_active: boolean
          message_template: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_inactive?: number
          id?: string
          is_active?: boolean
          message_template: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_inactive?: number
          id?: string
          is_active?: boolean
          message_template?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      sdr_remarketing_log: {
        Row: {
          attempt_number: number
          config_id: string
          deal_id: string
          id: string
          sent_at: string
        }
        Insert: {
          attempt_number?: number
          config_id: string
          deal_id: string
          id?: string
          sent_at?: string
        }
        Update: {
          attempt_number?: number
          config_id?: string
          deal_id?: string
          id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdr_remarketing_log_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "sdr_remarketing_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_remarketing_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "sdr_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_robot_config: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          robot_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          robot_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          robot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdr_robot_config_robot_id_fkey"
            columns: ["robot_id"]
            isOneToOne: false
            referencedRelation: "robots"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_logs: {
        Row: {
          conversation_id: string
          created_at: string
          from_user_id: string | null
          from_user_name: string | null
          id: string
          reason: string | null
          status: string
          to_department_id: string
          to_department_name: string | null
          to_robot_id: string | null
          to_robot_name: string | null
          to_user_id: string | null
          to_user_name: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          from_user_id?: string | null
          from_user_name?: string | null
          id?: string
          reason?: string | null
          status?: string
          to_department_id: string
          to_department_name?: string | null
          to_robot_id?: string | null
          to_robot_name?: string | null
          to_user_id?: string | null
          to_user_name?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          from_user_id?: string | null
          from_user_name?: string | null
          id?: string
          reason?: string | null
          status?: string
          to_department_id?: string
          to_department_name?: string | null
          to_robot_id?: string | null
          to_robot_name?: string | null
          to_user_id?: string | null
          to_user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_to_robot_id_fkey"
            columns: ["to_robot_id"]
            isOneToOne: false
            referencedRelation: "robots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_config: {
        Row: {
          created_at: string
          department_id: string | null
          franqueado: string | null
          id: string
          is_active: boolean
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          franqueado?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          franqueado?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_config_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          access_token: string | null
          connection_type: string
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          name: string | null
          phone_display: string | null
          phone_number_id: string
          status: string
          updated_at: string
          verify_token: string | null
          waba_id: string
        }
        Insert: {
          access_token?: string | null
          connection_type?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          name?: string | null
          phone_display?: string | null
          phone_number_id: string
          status?: string
          updated_at?: string
          verify_token?: string | null
          waba_id: string
        }
        Update: {
          access_token?: string | null
          connection_type?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          name?: string | null
          phone_display?: string | null
          phone_number_id?: string
          status?: string
          updated_at?: string
          verify_token?: string | null
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_lid_map: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string
          lid_jid: string
          phone_digits: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          instance_id?: string
          lid_jid: string
          phone_digits: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string
          lid_jid?: string
          phone_digits?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      work_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string | null
          name: string | null
          status: Database["public"]["Enums"]["user_status"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      find_contact_by_phone: {
        Args: { phone_input: string }
        Returns: {
          channel: string
          id: string
          name: string
          name_edited: boolean
          notes: string
          phone: string
        }[]
      }
      get_department_members_public: {
        Args: { _department_id: string }
        Returns: {
          avatar_url: string
          id: string
          name: string
        }[]
      }
      get_ranking_team_members: {
        Args: { _department_id: string }
        Returns: {
          avatar_url: string
          id: string
          name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_franqueado_for_city: {
        Args: { _city: string; _user_id: string }
        Returns: boolean
      }
      is_robot_within_schedule: {
        Args: { robot_uuid: string }
        Returns: boolean
      }
      list_team_directory: {
        Args: never
        Returns: {
          avatar_url: string
          departments: Json
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["user_status"]
        }[]
      }
      merge_duplicate_contacts: {
        Args: { duplicate_id: string; primary_id: string }
        Returns: Json
      }
      normalize_phone_variants: {
        Args: { phone_input: string }
        Returns: string[]
      }
      sync_robot_statuses: { Args: never; Returns: number }
      user_can_access_channel: {
        Args: { channel_uuid: string }
        Returns: boolean
      }
      user_can_access_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      user_can_delete_internal_message: {
        Args: { _channel_id: string; _receiver_id: string; _sender_id: string }
        Returns: boolean
      }
      user_in_department_by_name: {
        Args: { _dept_name: string; _user_id: string }
        Returns: boolean
      }
      users_share_department: {
        Args: { _other_user_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "atendente" | "franqueado"
      conversation_status:
        | "em_fila"
        | "em_atendimento"
        | "transferida"
        | "finalizada"
        | "pendente"
      priority_level: "low" | "normal" | "high" | "urgent"
      user_status: "online" | "away" | "busy" | "offline"
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
      app_role: ["admin", "supervisor", "atendente", "franqueado"],
      conversation_status: [
        "em_fila",
        "em_atendimento",
        "transferida",
        "finalizada",
        "pendente",
      ],
      priority_level: ["low", "normal", "high", "urgent"],
      user_status: ["online", "away", "busy", "offline"],
    },
  },
} as const
