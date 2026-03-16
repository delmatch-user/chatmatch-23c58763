import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  status: 'online' | 'away' | 'busy' | 'offline';
  created_at: string;
  updated_at: string;
  roles: { role: 'admin' | 'supervisor' | 'atendente' | 'franqueado' }[];
  departments: { department_id: string }[];
  franqueado_cities?: string[];
}

export function useUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('name');

      if (profilesError) throw profilesError;

      // Fetch roles for all users
      const { data: allRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Fetch departments for all users
      const { data: allDepts, error: deptsError } = await supabase
        .from('profile_departments')
        .select('profile_id, department_id');

      if (deptsError) throw deptsError;

      // Fetch franqueado cities
      const { data: allCities } = await supabase
        .from('franqueado_cities')
        .select('user_id, city');

      // Combine data
      const usersWithData = profiles?.map(profile => ({
        ...profile,
        roles: allRoles?.filter(r => r.user_id === profile.id).map(r => ({ role: r.role })) || [],
        departments: allDepts?.filter(d => d.profile_id === profile.id).map(d => ({ department_id: d.department_id })) || [],
        franqueado_cities: allCities?.filter(c => c.user_id === profile.id).map(c => c.city) || [],
      })) || [];

      setUsers(usersWithData as UserProfile[]);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const createUser = async (
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'supervisor' | 'atendente' | 'franqueado',
    departmentIds: string[]
  ) => {
    try {
      // Save current session before creating new user
      const { data: currentSessionData } = await supabase.auth.getSession();
      const currentSession = currentSessionData.session;

      // Create user via Supabase Auth - use signUp which triggers the handle_new_user function
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Usuário não foi criado');

      const userId = authData.user.id;

      // Restore original session immediately to prevent auto-login as new user
      if (currentSession) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
      }

      // Wait a bit for the trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update the role (the trigger creates 'atendente' by default, so we update if different)
      if (role !== 'atendente') {
        // Delete default role
        await supabase.from('user_roles').delete().eq('user_id', userId);
        
        // Insert the correct role
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role });

        if (roleError) {
          console.error('Error setting role:', roleError);
        }
      }

      // Assign departments
      if (departmentIds.length > 0) {
        console.log('Assigning departments:', departmentIds, 'to user:', userId);
        
        const deptInserts = departmentIds.map(dept_id => ({
          profile_id: userId,
          department_id: dept_id,
        }));

        const { data: deptData, error: deptError } = await supabase
          .from('profile_departments')
          .insert(deptInserts)
          .select();

        if (deptError) {
          console.error('Error assigning departments:', deptError);
          toast.error('Erro ao atribuir departamentos: ' + deptError.message);
        } else {
          console.log('Departments assigned successfully:', deptData);
        }
      }

      toast.success('Usuário criado com sucesso!');
      await fetchUsers();
      return { error: null };
    } catch (error: any) {
      console.error('Error creating user:', error);
      
      let message = error.message;
      if (error.message?.includes('already registered')) {
        message = 'Este email já está cadastrado';
      }
      
      toast.error('Erro ao criar usuário: ' + message);
      return { error };
    }
  };

  const updateUser = async (userId: string, data: { name?: string; phone?: string }) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', userId);

      if (error) throw error;
      
      toast.success('Usuário atualizado com sucesso!');
      await fetchUsers();
      return { error: null };
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast.error('Erro ao atualizar usuário: ' + error.message);
      return { error };
    }
  };

  const updateUserRole = async (userId: string, newRole: 'admin' | 'supervisor' | 'atendente' | 'franqueado') => {
    try {
      // Delete existing roles
      await supabase.from('user_roles').delete().eq('user_id', userId);
      
      // Insert new role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });

      if (error) throw error;
      
      toast.success('Perfil atualizado com sucesso!');
      await fetchUsers();
      return { error: null };
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error('Erro ao atualizar perfil: ' + error.message);
      return { error };
    }
  };

  const updateUserDepartments = async (userId: string, departmentIds: string[]) => {
    try {
      // Delete existing department assignments
      await supabase.from('profile_departments').delete().eq('profile_id', userId);
      
      // Insert new assignments
      if (departmentIds.length > 0) {
        const deptInserts = departmentIds.map(dept_id => ({
          profile_id: userId,
          department_id: dept_id,
        }));

        const { error } = await supabase
          .from('profile_departments')
          .insert(deptInserts);

        if (error) throw error;
      }
      
      toast.success('Departamentos atualizados com sucesso!');
      await fetchUsers();
      return { error: null };
    } catch (error: any) {
      console.error('Error updating departments:', error);
      toast.error('Erro ao atualizar departamentos: ' + error.message);
      return { error };
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: userId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success('Usuário excluído completamente!');
      await fetchUsers();
      return { error: null };
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Erro ao excluir usuário: ' + error.message);
      return { error };
    }
  };

  const updateFranqueadoCities = async (userId: string, cities: string[]) => {
    try {
      // Delete existing cities
      await supabase.from('franqueado_cities').delete().eq('user_id', userId);
      
      // Insert new cities
      if (cities.length > 0) {
        const inserts = cities.map(city => ({ user_id: userId, city }));
        const { error } = await supabase.from('franqueado_cities').insert(inserts);
        if (error) throw error;
      }
      
      toast.success('Cidades atualizadas com sucesso!');
      await fetchUsers();
      return { error: null };
    } catch (error: any) {
      console.error('Error updating franqueado cities:', error);
      toast.error('Erro ao atualizar cidades: ' + error.message);
      return { error };
    }
  };

  return {
    users,
    isLoading,
    fetchUsers,
    createUser,
    updateUser,
    updateUserRole,
    updateUserDepartments,
    updateFranqueadoCities,
    deleteUser,
  };
}
