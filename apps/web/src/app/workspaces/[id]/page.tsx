"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useWorkspace } from "@/hooks/useWorkspace";

type WorkspaceDetail = Awaited<ReturnType<typeof api.getWorkspace>>["data"];

export default function WorkspaceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const { refreshWorkspaces } = useWorkspace();

  const [data, setData] = useState<WorkspaceDetail | null>(null);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAcceptToken, setPendingAcceptToken] = useState<string | null>(
    () => searchParams.get("token")
  );
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [inviteOnly, setInviteOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInviteOnly(false);
    try {
      const res = await api.getWorkspace(workspaceId);
      setData(res.data);
      setName(res.data.name);
    } catch (err) {
      const e = err as { error?: { code?: string; message?: string } };
      if (e.error?.code === "FORBIDDEN" && pendingAcceptToken) {
        setInviteOnly(true);
      } else {
        setError(e.error?.message ?? "Failed to load workspace");
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, pendingAcceptToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = data?.role === "owner" || data?.role === "admin";
  const isOwner = data?.role === "owner";

  const handleRename = async () => {
    if (!data || name === data.name) return;
    try {
      await api.updateWorkspace(workspaceId, name);
      await load();
      await refreshWorkspaces();
      setActionMsg("Workspace renamed");
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ?? "Rename failed"
      );
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.inviteWorkspaceMember(workspaceId, inviteEmail, inviteRole);
      const link = `${window.location.origin}/workspaces/${workspaceId}?token=${res.data.token}`;
      setLastInviteLink(link);
      setInviteEmail("");
      await load();
      setActionMsg(`Invitation sent to ${res.data.email}`);
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ?? "Invite failed"
      );
    }
  };

  const handleAccept = async () => {
    if (!pendingAcceptToken) return;
    try {
      await api.acceptWorkspaceInvite(workspaceId, pendingAcceptToken);
      setPendingAcceptToken(null);
      await load();
      await refreshWorkspaces();
      setActionMsg("You joined the workspace");
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ?? "Accept failed"
      );
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Remove this member?")) return;
    try {
      await api.removeWorkspaceMember(workspaceId, memberId);
      await load();
      setActionMsg("Member removed");
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ?? "Remove failed"
      );
    }
  };

  const handleRoleChange = async (memberId: string, role: "admin" | "member") => {
    try {
      await api.updateWorkspaceMemberRole(workspaceId, memberId, role);
      await load();
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ?? "Role update failed"
      );
    }
  };

  const handleTransfer = async (newOwnerUserId: string) => {
    if (!confirm("Transfer ownership? You will become an admin.")) return;
    try {
      await api.transferWorkspaceOwnership(workspaceId, newOwnerUserId);
      await load();
      await refreshWorkspaces();
      setActionMsg("Ownership transferred");
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ?? "Transfer failed"
      );
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this workspace? Projects will become personal.")) return;
    try {
      await api.deleteWorkspace(workspaceId);
      await refreshWorkspaces();
      window.location.href = "/workspaces";
    } catch (err) {
      setError(
        (err as { error?: { message?: string } }).error?.message ?? "Delete failed"
      );
    }
  };

  if (loading) return <p className="px-6 py-8 text-gray-500">Loading...</p>;

  if (inviteOnly && pendingAcceptToken) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <h1 className="text-xl font-semibold text-white">Workspace invitation</h1>
        <p className="mt-2 text-sm text-gray-400">
          You have been invited to join a workspace on Nebula AI.
        </p>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <Button className="mt-4" onClick={() => void handleAccept()}>
          Accept invitation
        </Button>
      </div>
    );
  }

  if (error && !data) return <p className="px-6 py-8 text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <Link href="/workspaces" className="text-xs text-nebula-400 hover:underline">
        ← Back to workspaces
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">{data.name}</h1>
        <p className="text-sm text-gray-500">
          {data.membersCount} members · {data.projectsCount} projects · Your role:{" "}
          <span className="capitalize text-gray-400">{data.role}</span>
        </p>
      </div>

      {actionMsg && <p className="text-sm text-green-400">{actionMsg}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {canManage && (
        <section className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-3 text-sm font-medium text-white">Settings</h2>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={() => void handleRename()}>Rename</Button>
          </div>
          {isOwner && (
            <Button
              variant="ghost"
              className="mt-4 text-red-400"
              onClick={() => void handleDelete()}
            >
              Delete workspace
            </Button>
          )}
        </section>
      )}

      <section className="rounded-lg border border-surface-border bg-surface-card p-4">
        <h2 className="mb-3 text-sm font-medium text-white">Members</h2>
        <div className="space-y-2">
          {data.members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-surface-border px-3 py-2"
            >
              <div>
                <p className="text-sm text-white">{m.name}</p>
                <p className="text-xs text-gray-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {canManage && m.role !== "owner" ? (
                  <select
                    value={m.role}
                    onChange={(e) =>
                      void handleRoleChange(m.id, e.target.value as "admin" | "member")
                    }
                    className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-white"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span className="text-xs capitalize text-gray-400">{m.role}</span>
                )}
                {isOwner && m.role !== "owner" && (
                  <Button
                    variant="ghost"
                    className="text-xs text-nebula-400"
                    onClick={() => void handleTransfer(m.userId)}
                  >
                    Make owner
                  </Button>
                )}
                {canManage && m.role !== "owner" && (
                  <Button
                    variant="ghost"
                    className="text-xs text-red-400"
                    onClick={() => void handleRemove(m.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <section className="rounded-lg border border-surface-border bg-surface-card p-4">
          <h2 className="mb-3 text-sm font-medium text-white">Invite member</h2>
          <form onSubmit={handleInvite} className="flex flex-wrap gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
              className="rounded border border-surface-border bg-surface px-2 py-2 text-sm text-white"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit">Send invite</Button>
          </form>
          {lastInviteLink && (
            <p className="mt-3 break-all text-xs text-gray-500">
              Share link: <span className="text-nebula-400">{lastInviteLink}</span>
            </p>
          )}
          {data.invitations.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-gray-500">Pending invitations</p>
              {data.invitations.map((inv) => (
                <div key={inv.id} className="text-sm text-gray-400">
                  {inv.email} ({inv.role}) — expires{" "}
                  {new Date(inv.expiresAt).toLocaleDateString()}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <Link
          href="/projects"
          className="text-sm text-nebula-400 hover:underline"
          onClick={() => {
            localStorage.setItem("nebula_workspace_id", workspaceId);
          }}
        >
          View workspace projects →
        </Link>
      </section>
    </div>
  );
}
