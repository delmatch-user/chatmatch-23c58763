CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'supervisor',
    'atendente'
);


--
-- Name: conversation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conversation_status AS ENUM (
    'em_fila',
    'em_atendimento',
    'transferida',
    'finalizada',
    'pendente'
);


--
-- Name: priority_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.priority_level AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'online',
    'away',
    'busy',
    'offline'
);


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  );
  -- Primeiro usuário recebe role admin automaticamente
  if (select count(*) from public.profiles) = 1 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'atendente');
  end if;
  return new;
end;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;


--
-- Name: list_team_directory(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_team_directory() RETURNS TABLE(id uuid, name text, avatar_url text, status public.user_status, role public.app_role, departments jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    p.id,
    p.name,
    p.avatar_url,
    p.status,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin') THEN 'admin'::public.app_role
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'supervisor') THEN 'supervisor'::public.app_role
      ELSE 'atendente'::public.app_role
    END AS role,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'name', d.name,
            'color', d.color
          )
          ORDER BY d.name
        )
        FROM public.profile_departments pd
        JOIN public.departments d ON d.id = pd.department_id
        WHERE pd.profile_id = p.id
      ),
      '[]'::jsonb
    ) AS departments
  FROM public.profiles p
  ORDER BY p.name;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: user_can_access_conversation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_can_access_conversation(_conversation_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id
    AND (
      c.assigned_to = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'supervisor'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profile_departments pd
        WHERE pd.profile_id = auth.uid()
        AND pd.department_id = c.department_id
      )
    )
  )
$$;


--
-- Name: user_can_delete_internal_message(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_can_delete_internal_message(_sender_id uuid, _receiver_id uuid, _channel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (
    -- User is sender
    _sender_id = auth.uid()
    -- OR user is receiver in DM
    OR (_receiver_id = auth.uid() AND _channel_id IS NULL)
    -- OR user is admin/supervisor
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
  )
$$;


--
-- Name: users_share_department(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.users_share_department(_user_id uuid, _other_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_departments pd1
    JOIN public.profile_departments pd2 ON pd1.department_id = pd2.department_id
    WHERE pd1.profile_id = _user_id
    AND pd2.profile_id = _other_user_id
  )
$$;


SET default_table_access_method = heap;

--
-- Name: channel_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    user_id uuid,
    department_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_type_check CHECK ((((user_id IS NOT NULL) AND (department_id IS NULL)) OR ((user_id IS NULL) AND (department_id IS NOT NULL))))
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    avatar_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    contact_name text NOT NULL,
    contact_phone text,
    department_id uuid,
    department_name text,
    assigned_to uuid,
    assigned_to_name text,
    finalized_by uuid,
    finalized_by_name text,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finalized_at timestamp with time zone DEFAULT now() NOT NULL,
    total_messages integer DEFAULT 0 NOT NULL,
    wait_time integer
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    department_id uuid NOT NULL,
    assigned_to uuid,
    status public.conversation_status DEFAULT 'em_fila'::public.conversation_status NOT NULL,
    priority public.priority_level DEFAULT 'normal'::public.priority_level NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    wait_time integer,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#FF6C08'::text NOT NULL,
    max_wait_time integer,
    auto_priority boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: internal_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'channel'::text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT internal_channels_type_check CHECK ((type = ANY (ARRAY['channel'::text, 'department'::text])))
);


--
-- Name: internal_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid,
    sender_id uuid NOT NULL,
    receiver_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_target_check CHECK ((((channel_id IS NOT NULL) AND (receiver_id IS NULL)) OR ((channel_id IS NULL) AND (receiver_id IS NOT NULL))))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid,
    sender_name text NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    department_id uuid NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    phone text,
    status public.user_status DEFAULT 'online'::public.user_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quick_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'Outros'::text NOT NULL,
    is_favorite boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: robots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.robots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    avatar_url text,
    status text DEFAULT 'inactive'::text NOT NULL,
    intelligence text DEFAULT 'flash'::text NOT NULL,
    tone text DEFAULT 'equilibrado'::text NOT NULL,
    max_tokens integer DEFAULT 1000 NOT NULL,
    departments text[] DEFAULT '{}'::text[] NOT NULL,
    send_audio text DEFAULT 'nunca'::text NOT NULL,
    finalization_message text,
    messages_count integer DEFAULT 0 NOT NULL,
    last_triggered timestamp with time zone,
    instructions text,
    qa_pairs jsonb DEFAULT '[]'::jsonb NOT NULL,
    reference_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    tools jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT robots_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'paused'::text])))
);


--
-- Name: transfer_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    from_user_id uuid,
    from_user_name text,
    to_user_id uuid,
    to_user_name text,
    to_department_id uuid NOT NULL,
    to_department_name text,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: whatsapp_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number_id text NOT NULL,
    waba_id text NOT NULL,
    phone_display text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channel_members channel_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_phone_key UNIQUE (phone);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversation_logs conversation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_logs
    ADD CONSTRAINT conversation_logs_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: internal_channels internal_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_channels
    ADD CONSTRAINT internal_channels_pkey PRIMARY KEY (id);


--
-- Name: internal_messages internal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: profile_departments profile_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_departments
    ADD CONSTRAINT profile_departments_pkey PRIMARY KEY (id);


--
-- Name: profile_departments profile_departments_profile_id_department_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_departments
    ADD CONSTRAINT profile_departments_profile_id_department_id_key UNIQUE (profile_id, department_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: quick_messages quick_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_messages
    ADD CONSTRAINT quick_messages_pkey PRIMARY KEY (id);


--
-- Name: robots robots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.robots
    ADD CONSTRAINT robots_pkey PRIMARY KEY (id);


--
-- Name: transfer_logs transfer_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_logs
    ADD CONSTRAINT transfer_logs_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: whatsapp_connections whatsapp_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_connections
    ADD CONSTRAINT whatsapp_connections_pkey PRIMARY KEY (id);


--
-- Name: idx_conversation_logs_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_logs_department ON public.conversation_logs USING btree (department_id);


--
-- Name: idx_conversation_logs_finalized_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_logs_finalized_at ON public.conversation_logs USING btree (finalized_at DESC);


--
-- Name: robots update_robots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_robots_updated_at BEFORE UPDATE ON public.robots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: channel_members channel_members_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.internal_channels(id) ON DELETE CASCADE;


--
-- Name: channel_members channel_members_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: channel_members channel_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversation_logs conversation_logs_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_logs
    ADD CONSTRAINT conversation_logs_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: conversation_logs conversation_logs_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_logs
    ADD CONSTRAINT conversation_logs_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: conversation_logs conversation_logs_finalized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_logs
    ADD CONSTRAINT conversation_logs_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.profiles(id);


--
-- Name: conversations conversations_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: internal_channels internal_channels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_channels
    ADD CONSTRAINT internal_channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: internal_messages internal_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.internal_channels(id) ON DELETE CASCADE;


--
-- Name: internal_messages internal_messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id);


--
-- Name: internal_messages internal_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profile_departments profile_departments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_departments
    ADD CONSTRAINT profile_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: profile_departments profile_departments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_departments
    ADD CONSTRAINT profile_departments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quick_messages quick_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_messages
    ADD CONSTRAINT quick_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: robots robots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.robots
    ADD CONSTRAINT robots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: transfer_logs transfer_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_logs
    ADD CONSTRAINT transfer_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: transfer_logs transfer_logs_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_logs
    ADD CONSTRAINT transfer_logs_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: transfer_logs transfer_logs_to_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_logs
    ADD CONSTRAINT transfer_logs_to_department_id_fkey FOREIGN KEY (to_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: transfer_logs transfer_logs_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_logs
    ADD CONSTRAINT transfer_logs_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_connections whatsapp_connections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_connections
    ADD CONSTRAINT whatsapp_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversation_logs Admins can delete conversation logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete conversation logs" ON public.conversation_logs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: internal_channels Admins e supervisores podem criar canais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins e supervisores podem criar canais" ON public.internal_channels FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: internal_channels Admins e supervisores podem deletar canais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins e supervisores podem deletar canais" ON public.internal_channels FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: channel_members Admins e supervisores podem gerenciar membros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins e supervisores podem gerenciar membros" ON public.channel_members USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: profiles Allow own insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow own insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: internal_channels Canais visíveis por usuários autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Canais visíveis por usuários autenticados" ON public.internal_channels FOR SELECT USING (true);


--
-- Name: contacts Contacts insertable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Contacts insertable by authenticated users" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: contacts Contacts updatable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Contacts updatable by authenticated users" ON public.contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: contacts Contacts viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Contacts viewable by authenticated users" ON public.contacts FOR SELECT TO authenticated USING (true);


--
-- Name: conversations Conversations modifiable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Conversations modifiable by authenticated users" ON public.conversations TO authenticated USING (true) WITH CHECK (true);


--
-- Name: conversations Conversations viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Conversations viewable by authenticated users" ON public.conversations FOR SELECT TO authenticated USING (true);


--
-- Name: departments Departments modifiable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Departments modifiable by admins" ON public.departments TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: departments Departments viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Departments viewable by authenticated users" ON public.departments FOR SELECT TO authenticated USING (true);


--
-- Name: channel_members Membros visíveis por usuários autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Membros visíveis por usuários autenticados" ON public.channel_members FOR SELECT USING (true);


--
-- Name: internal_messages Mensagens internas visíveis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mensagens internas visíveis" ON public.internal_messages FOR SELECT USING (true);


--
-- Name: messages Messages deletable by conversation participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Messages deletable by conversation participants" ON public.messages FOR DELETE TO authenticated USING (public.user_can_access_conversation(conversation_id));


--
-- Name: messages Messages insertable by conversation participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Messages insertable by conversation participants" ON public.messages FOR INSERT TO authenticated WITH CHECK (public.user_can_access_conversation(conversation_id));


--
-- Name: messages Messages updatable by conversation participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Messages updatable by conversation participants" ON public.messages FOR UPDATE TO authenticated USING (public.user_can_access_conversation(conversation_id));


--
-- Name: messages Messages viewable by conversation participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Messages viewable by conversation participants" ON public.messages FOR SELECT TO authenticated USING (public.user_can_access_conversation(conversation_id));


--
-- Name: profile_departments Profile_departments modifiable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profile_departments modifiable by admins" ON public.profile_departments TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profile_departments Profile_departments viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profile_departments viewable by authenticated users" ON public.profile_departments FOR SELECT TO authenticated USING (true);


--
-- Name: quick_messages Quick messages deletable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Quick messages deletable by owner" ON public.quick_messages FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: quick_messages Quick messages insertable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Quick messages insertable by owner" ON public.quick_messages FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: quick_messages Quick messages modifiable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Quick messages modifiable by owner" ON public.quick_messages FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: quick_messages Quick messages viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Quick messages viewable by authenticated users" ON public.quick_messages FOR SELECT TO authenticated USING (true);


--
-- Name: robots Robots manageable by admins and supervisors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Robots manageable by admins and supervisors" ON public.robots USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: robots Robots viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Robots viewable by authenticated users" ON public.robots FOR SELECT USING (true);


--
-- Name: user_roles Roles modifiable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Roles modifiable by admins" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Roles viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Roles viewable by authenticated users" ON public.user_roles FOR SELECT TO authenticated USING (true);


--
-- Name: transfer_logs Transfer logs modifiable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Transfer logs modifiable by authenticated users" ON public.transfer_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: transfer_logs Transfer logs viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Transfer logs viewable by authenticated users" ON public.transfer_logs FOR SELECT TO authenticated USING (true);


--
-- Name: internal_messages Users can delete messages they participate in; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete messages they participate in" ON public.internal_messages FOR DELETE TO authenticated USING (((sender_id = auth.uid()) OR ((receiver_id = auth.uid()) AND (channel_id IS NULL)) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: conversation_logs Users can insert conversation logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert conversation logs" ON public.conversation_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: conversation_logs Users can view own finalized logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own finalized logs" ON public.conversation_logs FOR SELECT TO authenticated USING (((finalized_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role)));


--
-- Name: profiles Users can view own profile and colleagues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile and colleagues" ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'supervisor'::public.app_role) OR public.users_share_department(auth.uid(), id)));


--
-- Name: internal_messages Usuários podem enviar mensagens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuários podem enviar mensagens" ON public.internal_messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));


--
-- Name: whatsapp_connections WA connections modifiable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "WA connections modifiable by admins" ON public.whatsapp_connections TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: whatsapp_connections WA connections viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "WA connections viewable by authenticated users" ON public.whatsapp_connections FOR SELECT TO authenticated USING (true);


--
-- Name: channel_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: internal_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: internal_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: quick_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quick_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: robots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.robots ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;