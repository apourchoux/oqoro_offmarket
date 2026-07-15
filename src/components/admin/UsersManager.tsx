import { useState } from 'react';
import type { AdminRole, AdminUser } from '../../lib/admin-users';

interface Props {
  initialUsers: AdminUser[];
  /** Admins « de secours » définis par ADMIN_EMAILS (non modifiables ici). */
  envAdmins: string[];
  /** Email de l'admin connecté (ses propres droits ne sont pas modifiables). */
  currentEmail: string;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  admin: 'Admin',
  operateur: 'Opérateur',
};

const ROLE_TONES: Record<AdminRole, string> = {
  admin: 'bg-oq-black text-white',
  operateur: 'bg-blue-100 text-blue-800',
};

const ROLE_HINTS: Record<AdminRole, string> = {
  admin: 'Accès complet, y compris la gestion des utilisateurs.',
  operateur: 'Accès à tout l’admin SAUF la gestion des utilisateurs.',
};

/** Mot de passe aléatoire lisible (16 caractères, sans ambiguïtés O/0/l/1). */
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!#%+';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-card border border-oq-border p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[17px] font-bold text-oq-black mb-1">{title}</h3>
        {description && <p className="text-[13px] text-oq-muted mb-4">{description}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * Gestion des utilisateurs de l'admin (réservée au rôle admin) : création de
 * comptes (email + mot de passe via Supabase Auth), rôles admin/opérateur,
 * réinitialisation de mot de passe, révocation.
 */
export default function UsersManager({ initialUsers, envAdmins, currentEmail }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Création
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('operateur');
  const [newPassword, setNewPassword] = useState('');
  const [createAuth, setCreateAuth] = useState(true);

  // Réinitialisation de mot de passe
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const me = currentEmail.toLowerCase();

  function flash(message: string) {
    setError(null);
    setNotice(message);
  }

  function fail(message: string) {
    setNotice(null);
    setError(message);
  }

  async function createUser() {
    if (!newEmail.trim() || busy) return;
    if (createAuth && newPassword.length < 8) {
      fail('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/admin/api/utilisateurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          display_name: newName.trim() || null,
          role: newRole,
          ...(createAuth ? { password: newPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? 'Création impossible');
        return;
      }
      setUsers((current) => [...current, data.user]);
      setCreateOpen(false);
      flash(
        data.auth_created
          ? `Compte créé pour ${data.user.email}. Transmettez-lui son mot de passe — il pourra se connecter immédiatement.`
          : `Accès accordé à ${data.user.email} (compte de connexion existant conservé).`,
      );
      setNewName('');
      setNewEmail('');
      setNewRole('operateur');
      setNewPassword('');
    } catch (err) {
      console.error(err);
      fail('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(user: AdminUser, role: AdminRole) {
    if (role === user.role || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/utilisateurs/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? 'Changement de rôle impossible');
        return;
      }
      setUsers((current) => current.map((u) => (u.id === user.id ? data.user : u)));
      flash(`${user.email} est maintenant ${ROLE_LABELS[role]}.`);
    } catch (err) {
      console.error(err);
      fail('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  async function doResetPassword() {
    if (!resetUser || resetPassword.length < 8 || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/utilisateurs/${resetUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? 'Réinitialisation impossible');
        return;
      }
      flash(`Mot de passe de ${resetUser.email} réinitialisé. Transmettez-le-lui.`);
      setResetUser(null);
      setResetPassword('');
    } catch (err) {
      console.error(err);
      fail('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: AdminUser) {
    if (
      !confirm(
        `Révoquer l'accès de ${user.email} ?\n` +
          'Son compte de connexion sera également supprimé s\'il avait été créé depuis cette page.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/utilisateurs/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        fail(data.error ?? 'Suppression impossible');
        return;
      }
      setUsers((current) => current.filter((u) => u.id !== user.id));
      flash(`Accès de ${user.email} révoqué.`);
    } catch (err) {
      console.error(err);
      fail('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="text-[13px] text-oq-muted flex-1">
          <span className="font-semibold text-oq-black">Admin</span> : accès complet ·{' '}
          <span className="font-semibold text-oq-black">Opérateur</span> : tout l'admin sauf
          cette page.
        </p>
        <button
          type="button"
          className="oq-btn-dark w-full sm:w-auto"
          onClick={() => setCreateOpen(true)}
        >
          Ajouter un utilisateur
        </button>
      </div>

      {notice && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-btn text-[13px] text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-btn text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-oq-border rounded-card overflow-hidden">
        {users.length === 0 && envAdmins.length === 0 ? (
          <div className="p-10 text-center text-oq-muted">
            Aucun utilisateur. Ajoutez le premier compte admin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[640px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-oq-muted bg-oq-bg">
                  <th className="px-4 py-3 font-semibold">Utilisateur</th>
                  <th className="px-4 py-3 font-semibold">Rôle</th>
                  <th className="px-4 py-3 font-semibold">Ajouté le</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {envAdmins.map((email) => (
                  <tr key={`env-${email}`} className="border-t border-oq-border bg-oq-bg/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-oq-black break-all">
                        {email}
                        {email === me && (
                          <span className="ml-2 text-[11px] text-oq-muted">(vous)</span>
                        )}
                      </div>
                      <div className="text-[12px] text-oq-muted">
                        Défini par la variable ADMIN_EMAILS — non modifiable ici
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${ROLE_TONES.admin}`}>
                        Admin
                      </span>
                    </td>
                    <td className="px-4 py-3 text-oq-muted text-[13px]">—</td>
                    <td className="px-4 py-3" />
                  </tr>
                ))}
                {users.map((u) => {
                  const isSelf = u.email.toLowerCase() === me;
                  return (
                    <tr key={u.id} className="border-t border-oq-border">
                      <td className="px-4 py-3">
                        <div className="font-medium text-oq-black break-all">
                          {u.display_name || u.email}
                          {isSelf && <span className="ml-2 text-[11px] text-oq-muted">(vous)</span>}
                        </div>
                        {u.display_name && (
                          <div className="text-[12px] text-oq-muted break-all">{u.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${ROLE_TONES[u.role]}`}>
                            {ROLE_LABELS[u.role]}
                          </span>
                        ) : (
                          <select
                            className="oq-input !py-1.5 !w-auto text-[13px]"
                            value={u.role}
                            disabled={busy}
                            onChange={(e) => changeRole(u, e.target.value as AdminRole)}
                            title={ROLE_HINTS[u.role]}
                          >
                            <option value="admin">Admin</option>
                            <option value="operateur">Opérateur</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-oq-muted text-[13px] whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString('fr-FR')}
                        {u.created_by && (
                          <div className="text-[11px]">par {u.created_by}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="text-[13px] text-oq-muted hover:text-oq-black mr-3"
                          disabled={busy}
                          onClick={() => {
                            setResetUser(u);
                            setResetPassword(generatePassword());
                          }}
                        >
                          Réinit. mot de passe
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            className="text-[13px] text-red-600 hover:text-red-700"
                            disabled={busy}
                            onClick={() => removeUser(u)}
                          >
                            Révoquer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Modal création ─── */}
      {createOpen && (
        <Modal
          title="Ajouter un utilisateur"
          description="Le compte pourra se connecter sur /admin/login avec cet email et ce mot de passe."
          onClose={() => setCreateOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="oq-label">Nom (optionnel)</label>
              <input
                className="oq-input"
                placeholder="Prénom Nom"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="oq-label">Email *</label>
              <input
                type="email"
                className="oq-input"
                placeholder="prenom@oqoro.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="oq-label">Rôle</label>
              <div className="grid grid-cols-2 gap-2">
                {(['admin', 'operateur'] as AdminRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNewRole(r)}
                    className={`p-3 border rounded-btn text-left transition-colors ${
                      newRole === r
                        ? 'border-brand-600 bg-brand-600/5'
                        : 'border-oq-border hover:bg-oq-bg'
                    }`}
                  >
                    <div className="font-semibold text-oq-black text-[14px]">{ROLE_LABELS[r]}</div>
                    <div className="text-[12px] text-oq-muted mt-0.5">{ROLE_HINTS[r]}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-[13px] text-oq-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAuth}
                  onChange={(e) => {
                    setCreateAuth(e.target.checked);
                    if (e.target.checked && !newPassword) setNewPassword(generatePassword());
                  }}
                />
                Créer le compte de connexion (mot de passe ci-dessous)
              </label>
              {createAuth && (
                <div className="flex gap-2 mt-2">
                  <input
                    className="oq-input font-mono text-[13px]"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8 caractères minimum"
                  />
                  <button
                    type="button"
                    className="oq-btn-secondary oq-btn-sm shrink-0"
                    onClick={() => setNewPassword(generatePassword())}
                    title="Générer un mot de passe"
                  >
                    ⟳
                  </button>
                </div>
              )}
              {!createAuth && (
                <p className="text-[12px] text-oq-muted mt-2">
                  À utiliser si cette personne possède déjà un compte de connexion : elle
                  gardera son mot de passe actuel.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
              <button type="button" className="oq-btn-secondary" onClick={() => setCreateOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="oq-btn-dark"
                disabled={!newEmail.trim() || (createAuth && newPassword.length < 8) || busy}
                onClick={createUser}
              >
                {busy ? 'Création…' : "Créer l'utilisateur"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Modal réinitialisation mot de passe ─── */}
      {resetUser && (
        <Modal
          title="Réinitialiser le mot de passe"
          description={`Nouveau mot de passe pour ${resetUser.email}. L'ancien cessera de fonctionner immédiatement.`}
          onClose={() => {
            setResetUser(null);
            setResetPassword('');
          }}
        >
          <div className="flex gap-2 mb-4">
            <input
              className="oq-input font-mono text-[13px]"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="8 caractères minimum"
              autoFocus
            />
            <button
              type="button"
              className="oq-btn-secondary oq-btn-sm shrink-0"
              onClick={() => setResetPassword(generatePassword())}
              title="Générer un mot de passe"
            >
              ⟳
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
            <button
              type="button"
              className="oq-btn-secondary"
              onClick={() => {
                setResetUser(null);
                setResetPassword('');
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              className="oq-btn-dark"
              disabled={resetPassword.length < 8 || busy}
              onClick={doResetPassword}
            >
              {busy ? '…' : 'Réinitialiser'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
