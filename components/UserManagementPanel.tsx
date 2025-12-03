import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { SessionUser } from '../types';

interface UserManagementPanelProps {
  user: SessionUser;
}

interface AdminUser {
  email: string;
  created_at: string;
}

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({ user }) => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to load admins');
      }
      const data = await res.json();
      setAdmins(data.admins || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to add admin');
      }
      setNewEmail('');
      await fetchAdmins();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (email: string) => {
    if (!window.confirm(`Remove ${email} from admins?`)) return;
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to remove admin');
      }
      await fetchAdmins();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-zinc-400" />
          Admin Users
        </h3>
        <p className="text-xs text-zinc-500">
          Manage who has administrative access to this workspace.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="relative flex-1">
          <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Enter email address"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 placeholder-zinc-600"
          />
        </div>
        <button
          type="submit"
          disabled={adding || !newEmail}
          className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition disabled:opacity-50 flex items-center gap-2"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </form>

      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            No admins found. (This shouldn't happen if you are seeing this)
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {admins.map((admin) => (
              <li key={admin.email} className="flex items-center justify-between p-3 bg-zinc-900/30 hover:bg-zinc-900/50 transition">
                <span className="text-sm text-zinc-300">{admin.email}</span>
                {admin.email !== user.email && (
                  <button
                    onClick={() => handleRemove(admin.email)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 rounded-md transition"
                    title="Remove admin access"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {admin.email === user.email && (
                  <span className="text-[10px] text-zinc-500 px-2 py-1 bg-zinc-800 rounded">You</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
