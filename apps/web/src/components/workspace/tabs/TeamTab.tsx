"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users as UsersIcon,
  Crown,
  Shield,
  User,
  Loader2,
  Mail,
  Plus,
  Trash2,
  Copy,
  Link as LinkIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
};

const roleIcon: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
};

export function TeamTab({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: string | null;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState("Personal");
  const [myRole, setMyRole] = useState("owner");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<
    Array<{ id: string; email: string; role: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [sending, setSending] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const canManage = myRole === "owner" || myRole === "admin";

  const load = useCallback(async () => {
    if (!workspaceId) {
      setTeamName("Personal");
      setMyRole("owner");
      setMembers(
        user
          ? [
              {
                id: user.id,
                userId: user.id,
                name: user.name,
                email: user.email,
                role: "owner",
              },
            ]
          : []
      );
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.getProjectTeam(projectId);
      const data = res.data;
      if (data?.name) setTeamName(data.name);
      if (data?.role) setMyRole(data.role);
      setMembers(data?.members ?? []);
      setInvitations(data?.invitations ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId, workspaceId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendInvite = async () => {
    if (!workspaceId || !inviteEmail.trim()) return;
    setSending(true);
    try {
      const res = await api.inviteWorkspaceMember(
        workspaceId,
        inviteEmail,
        inviteRole
      );
      const link = `${window.location.origin}/workspaces/${workspaceId}?token=${res.data.token}`;
      setLastInviteLink(link);
      setInviteEmail("");
      toast({ title: "Invite created", description: "Share the link with them." });
      await load();
    } catch (err) {
      toast({
        title: "Couldn't invite",
        description:
          (err as { error?: { message?: string } }).error?.message ?? "Failed",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: "admin" | "member") => {
    if (!workspaceId) return;
    try {
      await api.updateWorkspaceMemberRole(workspaceId, memberId, role);
      await load();
    } catch (err) {
      toast({
        title: "Couldn't update",
        description:
          (err as { error?: { message?: string } }).error?.message ?? "Failed",
        variant: "destructive",
      });
    }
  };

  const remove = async (memberId: string) => {
    if (!workspaceId || !confirm("Remove this member?")) return;
    await api.removeWorkspaceMember(workspaceId, memberId);
    await load();
  };

  const copyLink = () => {
    if (!lastInviteLink) return;
    void navigator.clipboard.writeText(lastInviteLink);
    toast({ title: "Link copied", description: lastInviteLink });
  };

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <UsersIcon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{teamName}</span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          {members.length} members
          {invitations.length > 0 && ` · ${invitations.length} pending`}
        </span>
      </div>

      {loading ? (
        <div className="grid flex-1 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto scrollbar-thin">
          {canManage && workspaceId && (
            <div className="space-y-3 border-b border-border bg-card/40 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> Invite member
              </div>
              <div className="flex gap-2">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1 rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as "admin" | "member")
                  }
                  className="rounded-md bg-secondary px-2 py-2 text-sm capitalize focus:outline-none"
                >
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
                <button
                  type="button"
                  onClick={() => void sendInvite()}
                  disabled={sending || !inviteEmail.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}{" "}
                  Invite
                </button>
              </div>
              {lastInviteLink && (
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <Copy className="h-3 w-3" /> Copy invite link
                </button>
              )}
              {invitations.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  {invitations.map((iv) => (
                    <div
                      key={iv.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-xs"
                    >
                      <LinkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{iv.email}</span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] capitalize">
                        {iv.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="divide-y divide-border">
            {members.map((m) => {
              const Icon = roleIcon[m.role] ?? User;
              const isMe = m.userId === user?.id;
              return (
                <div
                  key={m.id}
                  className="group flex items-center gap-3 px-4 py-3 transition-smooth hover:bg-secondary/40"
                >
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-accent text-xs font-semibold text-accent-foreground">
                    {(m.name?.[0] || m.email?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name || m.email}
                      {isMe && (
                        <span className="ml-2 text-[10px] text-primary">
                          (you)
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {m.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 text-xs">
                    <Icon className="h-3 w-3 text-primary" />
                    {canManage && !isMe && workspaceId ? (
                      <select
                        value={m.role === "owner" ? "admin" : m.role}
                        onChange={(e) =>
                          void handleRoleChange(
                            m.id,
                            e.target.value as "admin" | "member"
                          )
                        }
                        className="bg-transparent text-xs capitalize focus:outline-none"
                      >
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                      </select>
                    ) : (
                      <span className="capitalize">{m.role}</span>
                    )}
                  </div>
                  {canManage && !isMe && workspaceId && (
                    <button
                      type="button"
                      onClick={() => void remove(m.id)}
                      className="grid h-7 w-7 place-items-center rounded text-muted-foreground opacity-0 transition-smooth hover:bg-secondary group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
