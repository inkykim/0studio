// Project & member management API client
import { ProjectMember, ProjectMemberRole } from './supabase';
import { toast } from 'sonner';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

async function getAuthHeaders(): Promise<HeadersInit> {
  // Get current session token from supabase
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export interface CloudProject {
  id: string;
  name: string;
  s3_key: string;
  owner_id: string;
  created_at: string;
}

export interface ProjectMemberWithEmail extends ProjectMember {
  // Enriched with display info
  display_name?: string;
}

export class ProjectAPI {
  // ============ PROJECTS ============

  /**
   * Register a local project in the cloud for collaboration
   */
  async registerProject(name: string, filePath: string): Promise<CloudProject> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${BACKEND_URL}/api/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, file_path: filePath }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to register project');
      }

      return await response.json();
    } catch (error) {
      console.error('Error registering project:', error);
      throw error;
    }
  }

  /**
   * Get all projects the user owns or is a member of
   */
  async getUserProjects(): Promise<CloudProject[]> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${BACKEND_URL}/api/projects/user-projects`, {
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch projects');
      }

      const data = await response.json();
      return data.projects;
    } catch (error) {
      console.error('Error fetching user projects:', error);
      throw error;
    }
  }

  /**
   * Get a project by its file path (for matching local to cloud)
   */
  async getProjectByFilePath(filePath: string): Promise<CloudProject | null> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${BACKEND_URL}/api/projects/by-path?file_path=${encodeURIComponent(filePath)}`,
        { headers }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch project');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching project by path:', error);
      return null;
    }
  }

  // ============ MEMBERS ============

  /**
   * Get all members of a project
   */
  async getProjectMembers(projectId: string): Promise<ProjectMemberWithEmail[]> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${BACKEND_URL}/api/projects/${projectId}/members`, {
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch members');
      }

      const data = await response.json();
      return data.members;
    } catch (error) {
      console.error('Error fetching project members:', error);
      throw error;
    }
  }

  /**
   * Invite a user to a project by email
   */
  async inviteMember(
    projectId: string,
    email: string,
    role: ProjectMemberRole = 'viewer'
  ): Promise<ProjectMember> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${BACKEND_URL}/api/projects/${projectId}/members`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to invite member');
      }

      const data = await response.json();
      toast.success(`Invited ${email} as ${role}`);
      return data.member;
    } catch (error: any) {
      console.error('Error inviting member:', error);
      toast.error(error.message || 'Failed to invite member');
      throw error;
    }
  }

  /**
   * Update a member's role
   */
  async updateMemberRole(
    projectId: string,
    memberId: string,
    role: ProjectMemberRole
  ): Promise<ProjectMember> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${BACKEND_URL}/api/projects/${projectId}/members/${memberId}/role`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ role }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update role');
      }

      const data = await response.json();
      toast.success(`Role updated to ${role}`);
      return data.member;
    } catch (error: any) {
      console.error('Error updating member role:', error);
      toast.error(error.message || 'Failed to update role');
      throw error;
    }
  }

  /**
   * Remove a member from a project
   */
  async removeMember(projectId: string, memberId: string): Promise<void> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${BACKEND_URL}/api/projects/${projectId}/members/${memberId}`,
        {
          method: 'DELETE',
          headers,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove member');
      }

      toast.success('Member removed');
    } catch (error: any) {
      console.error('Error removing member:', error);
      toast.error(error.message || 'Failed to remove member');
      throw error;
    }
  }
}

// Export singleton
export const projectAPI = new ProjectAPI();
