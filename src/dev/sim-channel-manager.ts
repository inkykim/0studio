import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { PresenceUser } from '../lib/presence-service';
import { SimUser, buildPresenceState } from './sim-users';

export class SimChannelManager {
  private supabase: SupabaseClient;
  private projectId: string | null = null;
  private channels: Map<string, RealtimeChannel> = new Map();
  private userStates: Map<string, PresenceUser> = new Map();

  constructor(supabaseUrl: string, supabaseAnonKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
  }

  getSupabase(): SupabaseClient {
    return this.supabase;
  }

  setProjectId(projectId: string) {
    this.projectId = projectId;
  }

  async activateUser(user: SimUser, commitId: string | null = null, status: string = ''): Promise<void> {
    if (!this.projectId) throw new Error('No project ID set');
    if (this.channels.has(user.userId)) return;

    const state = buildPresenceState(user, commitId, status);
    const channel = this.supabase.channel(`presence:project:${this.projectId}`, {
      config: { presence: { key: user.userId } },
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timeout subscribing ${user.displayName}`)), 10000);

      channel
        .on('presence', { event: 'sync' }, () => {})
        .subscribe(async (subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            clearTimeout(timeout);
            await channel.track(state).catch(() => {});
            this.channels.set(user.userId, channel);
            this.userStates.set(user.userId, state);
            resolve();
          }
        });
    });
  }

  async deactivateUser(userId: string): Promise<void> {
    const channel = this.channels.get(userId);
    if (!channel) return;
    channel.untrack();
    this.supabase.removeChannel(channel);
    this.channels.delete(userId);
    this.userStates.delete(userId);
  }

  async setCommit(userId: string, commitId: string | null): Promise<void> {
    const channel = this.channels.get(userId);
    const state = this.userStates.get(userId);
    if (!channel || !state) return;
    const updated = { ...state, currentCommitId: commitId };
    this.userStates.set(userId, updated);
    await channel.track(updated).catch(() => {});
  }

  async setStatus(userId: string, statusMessage: string): Promise<void> {
    const channel = this.channels.get(userId);
    const state = this.userStates.get(userId);
    if (!channel || !state) return;
    const updated = { ...state, statusMessage };
    this.userStates.set(userId, updated);
    await channel.track(updated).catch(() => {});
  }

  getState(userId: string): PresenceUser | null {
    return this.userStates.get(userId) ?? null;
  }

  isActive(userId: string): boolean {
    return this.channels.has(userId);
  }

  getActiveUserIds(): string[] {
    return Array.from(this.channels.keys());
  }

  async deactivateAll(): Promise<void> {
    const userIds = Array.from(this.channels.keys());
    await Promise.all(userIds.map((id) => this.deactivateUser(id)));
  }
}
